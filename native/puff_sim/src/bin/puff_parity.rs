//! puff_parity — JS 측정 도구(tools/*.mjs)의 Rust 판 + 벤치 + 결정성 해시.
//!
//! 사용 (native/puff_sim 에서):
//!   cargo run --release --bin puff_parity -- powercurve [S=16] [Ns=8,12,20] [Hs=0.95,0.75,0.5]
//!   cargo run --release --bin puff_parity -- fromtop [S=16] [Ns=3,5,8,12,16,20]
//!   cargo run --release --bin puff_parity -- aimmap [S=16] [N=12] [R=0.9]          (env LATS, HS)
//!   cargo run --release --bin puff_parity -- stackpower [S=16] [Ns=1,2,3,5,8]       (env PS)
//!   cargo run --release --bin puff_parity -- mouthmap [S=16] [Ns=14,20]             (env LAYERS, MOUTHS, RATIO, DIRS)
//!   cargo run --release --bin puff_parity -- all [S=16]       → 다섯 도구 전부 (JSON=out.json 이면 시드별 값도 저장)
//!   cargo run --release --bin puff_parity -- bench [Ns=1,5,10,20,30,40] [reps=5]
//!   cargo run --release --bin puff_parity -- hash [seed=7] [n=20]
//! 공통 env: TUNE="push=22,lift=500" (sim.js 이름 또는 snake_case), PRESET=web (sim.js 값 글자 그대로), SEED_OFF=16, THREADS=4
//! 출력 형식은 JS 도구와 같게(같은 줄 모양) → parity/compare.mjs 가 시드별 JSON 으로 잡음 안인지 판정

use puff_sim::rng::Mulberry32;
use puff_sim::rules::{resolve_shot, sweet_hi_for, Shot};
use puff_sim::table::{BlowArgs, Table, DISC_H, V3};
use puff_sim::{aim_point, Tune};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

// ── 공통 ──────────────────────────────────────────────────────────

fn env_list(name: &str, default: &str) -> Vec<String> {
    std::env::var(name).unwrap_or_else(|_| default.to_string()).split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
}

fn arg_list(args: &[String], i: usize, default: &str) -> Vec<f64> {
    args.get(i).map(String::as_str).unwrap_or(default).split(',').map(|s| s.trim().parse::<f64>().expect("숫자 목록")).collect()
}

fn arg_num(args: &[String], i: usize, default: f64) -> f64 {
    args.get(i).map(|s| s.parse::<f64>().expect("숫자")).unwrap_or(default)
}

fn tune() -> Tune {
    // PRESET=web → sim.js 값 글자 그대로(다시 맞추기 전)
    let mut t = if std::env::var("PRESET").as_deref() == Ok("web") { Tune::web_literal() } else { Tune::default() };
    if let Ok(spec) = std::env::var("TUNE") {
        t.apply_overrides(&spec).unwrap_or_else(|e| panic!("TUNE: {e}"));
    }
    t
}

/// JS toFixed 처럼(동률이면 크게) 반올림해서 문자열로
fn fx(v: f64, d: usize) -> String {
    let m = 10f64.powi(d as i32);
    let r = (v * m).round() / m;
    let s = format!("{:.*}", d, r);
    if s.starts_with("-") && s.trim_start_matches('-').chars().all(|c| c == '0' || c == '.') {
        s.trim_start_matches('-').to_string()
    } else {
        s
    }
}

/// 시드 밀기: SEED_OFF=16 이면 시드 17..32 (튜닝에 안 쓴 '새 시드'로 다시 재기)
fn seed_off() -> u32 {
    std::env::var("SEED_OFF").ok().and_then(|s| s.parse().ok()).unwrap_or(0)
}

fn threads() -> usize {
    std::env::var("THREADS").ok().and_then(|s| s.parse().ok()).unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4))
}

/// 작업 i = 0..n 을 스레드로 나눠 돌리고 i 순서대로 모은다(결과는 스레드 수와 무관)
fn par_map<T: Send, F: Fn(usize) -> T + Sync>(n: usize, f: F) -> Vec<T> {
    let next = AtomicUsize::new(0);
    let mut out: Vec<Option<T>> = (0..n).map(|_| None).collect();
    let chunks: Vec<Vec<(usize, T)>> = std::thread::scope(|sc| {
        let hs: Vec<_> = (0..threads().min(n.max(1)))
            .map(|_| {
                sc.spawn(|| {
                    let mut mine = Vec::new();
                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        if i >= n {
                            break;
                        }
                        mine.push((i, f(i)));
                    }
                    mine
                })
            })
            .collect();
        hs.into_iter().map(|h| h.join().expect("작업 스레드")).collect()
    });
    for c in chunks {
        for (i, v) in c {
            out[i] = Some(v);
        }
    }
    out.into_iter().map(|v| v.expect("빠진 작업")).collect()
}

fn mean(v: &[f64]) -> f64 {
    if v.is_empty() {
        0.0
    } else {
        v.iter().sum::<f64>() / v.len() as f64
    }
}

fn new_pile(seed: u32, n: usize, t: &Tune) -> Table {
    let mut tb = Table::with_tune(seed, t.clone());
    tb.add_pile(n, 0.07, (0.0, 0.0), &[]);
    tb.settle(600);
    tb
}

/// 시드별 값 묶음 (parity/compare.mjs 가 읽는 JSON 의 한 칸)
#[derive(Default, Clone)]
struct Cell {
    key: String,
    vals: BTreeMap<&'static str, Vec<f64>>,
}

impl Cell {
    fn new(key: String) -> Self {
        Self { key, vals: BTreeMap::new() }
    }
    fn push(&mut self, k: &'static str, v: f64) {
        self.vals.entry(k).or_default().push(v);
    }
    fn get(&self, k: &str) -> &[f64] {
        self.vals.get(k).map(Vec::as_slice).unwrap_or(&[])
    }
    fn mean(&self, k: &str) -> f64 {
        mean(self.get(k))
    }
    fn sum(&self, k: &str) -> f64 {
        self.get(k).iter().sum()
    }
}

fn cells_json(tool: &str, cells: &[Cell]) -> String {
    let mut s = String::new();
    let _ = write!(s, "{{\"tool\":\"{tool}\",\"cells\":[");
    for (i, c) in cells.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        let _ = write!(s, "{{\"key\":\"{}\"", c.key);
        for (k, v) in &c.vals {
            let _ = write!(s, ",\"{k}\":[");
            for (j, x) in v.iter().enumerate() {
                if j > 0 {
                    s.push(',');
                }
                let _ = write!(s, "{}", if x.is_finite() { format!("{x}") } else { "null".into() });
            }
            s.push(']');
        }
        s.push('}');
    }
    s.push_str("]}");
    s
}

// ── powercurve ────────────────────────────────────────────────────

fn powercurve(s_n: usize, ns: &[f64], hs: &[f64], t: &Tune) -> Vec<Cell> {
    let ratios: Vec<f64> = env_list("RATIOS", "0.5,0.6,0.7,0.8,0.9,1.0,1.05,1.1,1.2,1.3").iter().map(|s| s.parse().unwrap()).collect();
    let mut jobs = Vec::new();
    for &n in ns {
        for &hf in hs {
            for &r in &ratios {
                for s in 1..=s_n as u32 {
                    jobs.push((n as usize, hf, r, s + seed_off()));
                }
            }
        }
    }
    let res = par_map(jobs.len(), |i| {
        let (n, hf, r, s) = jobs[i];
        let mut tb = new_pile(s * 7907 + n as u32, n, t);
        let top = tb.column_top();
        let raw = Shot { lat: 0.0, h: (top * hf).max(0.03), power: sweet_hi_for(n) * r };
        let sh = resolve_shot(raw, n, top, &mut Mulberry32::new(s * 31 + n as u32), 1.0);
        let c = tb.pile_center();
        let aim = V3::new(c.0 - (1.0 - sh.lat * sh.lat).sqrt(), sh.h, c.1 + sh.lat);
        tb.blow(&BlowArgs::new(aim, 1.0, 0.0, sh.power, sh.blast));
        tb.run_until_settled(4.0);
        (tb.flipped_ids().len() as f64, tb.out_ids().len() as f64)
    });
    let mut cells = Vec::new();
    let mut k = 0;
    for &n in ns {
        for &hf in hs {
            let mut line = Vec::new();
            for &r in &ratios {
                let mut c = Cell::new(format!("n={}|aim={}|r={}", n, hf, fx(r, 2)));
                for _ in 0..s_n {
                    c.push("flips", res[k].0);
                    c.push("outs", res[k].1);
                    k += 1;
                }
                let o = c.mean("outs");
                line.push(format!("{}:{}{}", fx(r, 2), fx(c.mean("flips"), 1), if o > 0.0 { format!("/out{}", fx(o, 1)) } else { String::new() }));
                cells.push(c);
            }
            println!("n={:>2} aim={} | {}", n, hf, line.join("  "));
        }
    }
    cells
}

// ── fromtop ───────────────────────────────────────────────────────

fn fromtop(s_n: usize, ns: &[f64], t: &Tune) -> Vec<Cell> {
    let mut cells = Vec::new();
    for &nf in ns {
        let n = nf as usize;
        let ks: Vec<f64> = [0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0].into_iter().filter(|&k| k <= n as f64).collect();
        let off = seed_off();
        let jobs: Vec<(f64, u32)> = ks.iter().flat_map(|&k| (1..=s_n as u32).map(move |s| (k, s + off))).collect();
        let res = par_map(jobs.len(), |i| {
            let (k, s) = jobs[i];
            let mut tb = new_pile(s * 7907 + n as u32, n, t);
            let ys = tb.layer_ys();
            let top = tb.column_top();
            let h = if k < 1.0 { top - DISC_H * 0.25 } else { ys[(n - 1).min((k.round() as usize).saturating_sub(1))] };
            let sh = resolve_shot(Shot { lat: 0.0, h, power: sweet_hi_for(n) * 0.9 }, n, top, &mut Mulberry32::new(s * 31 + n as u32), 1.0);
            let c = tb.pile_center();
            tb.blow(&BlowArgs::new(V3::new(c.0 - 1.0, sh.h, c.1), 1.0, 0.0, sh.power, 0.0));
            tb.run_until_settled(4.0);
            tb.flipped_ids().len() as f64
        });
        let mut row = Vec::new();
        for (ki, &k) in ks.iter().enumerate() {
            let mut c = Cell::new(format!("n={}|k={}", n, k));
            for s in 0..s_n {
                c.push("flips", res[ki * s_n + s]);
            }
            let zero = c.get("flips").iter().filter(|&&f| f == 0.0).count() as f64;
            row.push(format!("{}장째:{}(꽝{}%)", k, fx(c.mean("flips"), 1), (zero / s_n as f64 * 100.0).round()));
            cells.push(c);
        }
        println!("n={} | {}", n, row.join("  "));
    }
    cells
}

// ── aimmap ────────────────────────────────────────────────────────

fn aimmap(s_n: usize, n: usize, r: f64, t: &Tune) -> Vec<Cell> {
    let lats: Vec<f64> = env_list("LATS", "-0.9,-0.6,-0.3,0,0.3,0.6,0.9").iter().map(|s| s.parse().unwrap()).collect();
    let hs: Vec<f64> = env_list("HS", "0.95,0.75,0.5").iter().map(|s| s.parse().unwrap()).collect();
    let mut jobs = Vec::new();
    for &hf in &hs {
        for &lat in &lats {
            for s in 1..=s_n as u32 {
                jobs.push((hf, lat, s + seed_off()));
            }
        }
    }
    // 시드별: flip, out, spin, side 합, fwd 합, moved, roll 합, roll 수
    let res = par_map(jobs.len(), |i| {
        let (hf, lat, s) = jobs[i];
        let mut tb = new_pile(s * 7907 + n as u32, n, t);
        let top = tb.column_top();
        let sh = resolve_shot(Shot { lat, h: (top * hf).max(0.03), power: sweet_hi_for(n) * r }, n, top, &mut Mulberry32::new(s * 31 + n as u32), 1.0);
        let c = tb.pile_center();
        let p0: Vec<V3> = (0..tb.discs.len()).map(|id| tb.pos(id)).collect();
        tb.blow(&BlowArgs::new(V3::new(c.0 - (1.0 - sh.lat * sh.lat).sqrt(), sh.h, c.1 + sh.lat), 1.0, 0.0, sh.power, sh.blast));
        for _ in 0..30 {
            tb.step();
        }
        let mut spin = 0.0;
        for id in tb.live_ids() {
            spin += (tb.world.bodies[tb.discs[id].body].angvel().y as f64).abs() / n as f64;
        }
        tb.run_until_settled(4.0);
        let flipped = tb.flipped_ids();
        let (mut side, mut fwd, mut moved, mut out) = (0.0, 0.0, 0.0, 0.0);
        for id in tb.live_ids() {
            let p = tb.pos(id);
            let (dx, dz) = (p.x - p0[id].x, p.z - p0[id].z);
            if (dx * dx + dz * dz).sqrt() > 0.3 {
                moved += 1.0;
                side += dz;
                fwd += dx;
            }
            if !tb.in_circle(id) {
                out += 1.0;
            }
        }
        let (mut roll, mut roll_n) = (0.0, 0.0);
        for &id in &flipped {
            let p = tb.pos(id);
            let (dx, dz) = (p.x - p0[id].x, p.z - p0[id].z);
            let l = (dx * dx + dz * dz).sqrt();
            if l > 0.2 {
                roll += dz.abs() / l;
                roll_n += 1.0;
            }
        }
        [flipped.len() as f64, out, spin, side, fwd, moved, roll, roll_n]
    });
    let mut cells = Vec::new();
    let mut k = 0;
    for &hf in &hs {
        let mut line: Vec<[f64; 6]> = Vec::new();
        for &lat in &lats {
            let mut c = Cell::new(format!("N={}|R={}|h={}|lat={}", n, r, hf, lat));
            for _ in 0..s_n {
                let v = res[k];
                for (name, x) in ["flip", "out", "spin", "side", "fwd", "moved", "roll", "rollN"].iter().zip(v.iter()) {
                    c.push(name, *x);
                }
                k += 1;
            }
            let moved = c.sum("moved");
            let rn = c.sum("rollN");
            line.push([
                c.mean("flip"),
                if moved > 0.0 { c.sum("side") / moved } else { 0.0 },
                if moved > 0.0 { c.sum("fwd") / moved } else { 0.0 },
                c.mean("spin"),
                if rn > 0.0 { c.sum("roll") / rn } else { 0.0 },
                c.mean("out"),
            ]);
            cells.push(c);
        }
        println!("h={}", hf);
        for (mi, name) in ["flip", "side", "fwd", "spin", "roll", "out"].iter().enumerate() {
            let parts: Vec<String> = lats.iter().zip(line.iter()).map(|(lat, v)| format!("{}{}:{:>5}", if *lat >= 0.0 { "+" } else { "" }, fx(*lat, 1), fx(v[mi], 2))).collect();
            println!("  {:<4} | {}", name, parts.join("  "));
        }
    }
    cells
}

// ── stackpower ────────────────────────────────────────────────────

fn stackpower(s_n: usize, ns: &[f64], t: &Tune) -> Vec<Cell> {
    let ps: Vec<f64> = env_list("PS", "0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95").iter().map(|s| s.parse().unwrap()).collect();
    let mut jobs = Vec::new();
    for &n in ns {
        for lat in [0.0, 0.6] {
            for &pw in &ps {
                for s in 1..=s_n as u32 {
                    jobs.push((n as usize, lat, pw, s + seed_off()));
                }
            }
        }
    }
    let res = par_map(jobs.len(), |i| {
        let (n, lat, pw, s) = jobs[i];
        let mut tb = new_pile(s * 7907 + n as u32, n, t);
        let top = tb.column_top();
        let c = tb.pile_center();
        let aim = V3::new(c.0 - (1.0f64 - lat * lat).sqrt(), top * 0.6, c.1 + lat);
        tb.blow(&BlowArgs::new(aim, 1.0, 0.0, pw, 0.0));
        tb.run_until_settled(4.0);
        (tb.flipped_ids().len() as f64, tb.out_ids().len() as f64)
    });
    let mut cells = Vec::new();
    let mut k = 0;
    for &n in ns {
        for lat in [0.0, 0.6] {
            let mut parts = Vec::new();
            for &pw in &ps {
                let mut c = Cell::new(format!("n={}|lat={}|pw={}", n, lat, pw));
                for _ in 0..s_n {
                    c.push("flips", res[k].0);
                    c.push("outs", res[k].1);
                    k += 1;
                }
                let f = c.sum("flips");
                let o = c.sum("outs");
                parts.push(format!("{}:{}%{}", pw, fx(f / s_n as f64 / n * 100.0, 0), if o > 0.0 { format!("/o{}", fx(o / s_n as f64, 1)) } else { String::new() }));
                cells.push(c);
            }
            println!("n={} lat={} | {}", n, lat, parts.join(" "));
        }
    }
    cells
}

// ── mouthmap (요약: 장수 × 층 × 입 높이, 숨 한 가지) ────────────────

fn layer_index(l: &str, n: usize) -> usize {
    match l {
        "top" => 0,
        "mid" => (n - 1) / 2,
        "low3" => (((n - 1) * 2) as f64 / 3.0).round() as usize,
        "bottom" => n - 1,
        k => (n - 1).min((k.parse::<i64>().unwrap() - 1).max(0) as usize),
    }
}

fn mouthmap(s_n: usize, ns: &[f64], t: &Tune) -> Vec<Cell> {
    let layers = env_list("LAYERS", "top,3,mid,low3");
    let mouths = env_list("MOUTHS", "0.15,follow");
    let ratio: f64 = std::env::var("RATIO").ok().and_then(|s| s.parse().ok()).unwrap_or(0.9);
    let dirs = env_list("DIRS", "-z,+z");
    let dirv = |d: &str| match d {
        "-z" => (0.0, -1.0),
        "+z" => (0.0, 1.0),
        "+x" => (1.0, 0.0),
        _ => (-1.0, 0.0),
    };
    let mut jobs = Vec::new();
    for &nf in ns {
        let n = nf as usize;
        let mut seen = Vec::new();
        for l in &layers {
            let li = layer_index(l, n);
            if seen.contains(&li) {
                continue;
            }
            seen.push(li);
            for m in &mouths {
                for s in 1..=s_n as u32 {
                    for d in &dirs {
                        jobs.push((n, l.clone(), m.clone(), s + seed_off(), dirv(d)));
                    }
                }
            }
        }
    }
    let res = par_map(jobs.len(), |i| {
        let (n, ref layer, ref mouth, s, d) = jobs[i];
        let mut tb = new_pile(s * 7907 + n as u32, n, t);
        let c = tb.pile_center();
        let ys = tb.layer_ys();
        let top = tb.column_top();
        let sh = resolve_shot(Shot { lat: 0.0, h: ys[layer_index(layer, n)], power: sweet_hi_for(n) * ratio }, n, top, &mut Mulberry32::new(s * 31 + n as u32), 1.0);
        let aim = aim_point(c, d, sh.lat, sh.h);
        let mut b = BlowArgs::new(aim, d.0, d.1, sh.power, sh.blast);
        if mouth != "follow" {
            b.mouth_y = Some(if let Some(k) = mouth.strip_prefix("top+") { top + k.parse::<f64>().unwrap() } else { mouth.parse().unwrap() });
        }
        let y0: Vec<f64> = (0..tb.discs.len()).map(|id| tb.pos(id).y).collect();
        let mut max_y = y0.clone();
        tb.blow(&b);
        let steps = (4.0 / tb.t.dt).ceil() as u32;
        for i in 0..steps {
            tb.step();
            for id in tb.live_ids() {
                if tb.discs[id].off {
                    continue;
                }
                let y = tb.pos(id).y;
                if y > max_y[id] {
                    max_y[id] = y;
                }
            }
            if tb.puff.is_none() && i > 30 && tb.is_settled(0.06) {
                break;
            }
        }
        let flipped = tb.flipped_ids();
        let apex: Vec<f64> = flipped.iter().map(|&id| max_y[id] - y0[id]).collect();
        (flipped.len() as f64, tb.out_ids().len() as f64, apex)
    });
    let mut cells: Vec<Cell> = Vec::new();
    let per = s_n * dirs.len();
    let mut k = 0;
    println!("\n== 입술 높이 지도  ({}시드 × {}, lat 0, 숨 {})", s_n, dirs.join("/"), ratio);
    println!("  n  층      | {}", mouths.iter().map(|m| format!("{:>9}", if m == "follow" { "level" } else { m })).collect::<Vec<_>>().join(" "));
    while k < jobs.len() {
        let (n, layer) = (jobs[k].0, jobs[k].1.clone());
        let mut parts = Vec::new();
        for m in &mouths {
            let mut c = Cell::new(format!("n={}|layer={}|mouth={}|r={}", n, layer, m, ratio));
            for _ in 0..per {
                let (f, o, ref ap) = res[k];
                c.push("flips", f);
                c.push("outs", o);
                for &a in ap {
                    c.push("apex", a);
                }
                k += 1;
            }
            let zero = c.get("flips").iter().filter(|&&f| f == 0.0).count() as f64 / per as f64;
            parts.push(format!("{:>4} {:>3}%", fx(c.mean("flips"), 1), (zero * 100.0).round()));
            cells.push(c);
        }
        println!("  {:>2} {:<7} | {}", n, layer, parts.join(" "));
    }
    // 퍼올림 이득: 같은 층에서 낮은 입 / 수평
    if mouths.iter().any(|m| m == "follow") {
        println!("\n-- 낮은 입 이득 (같은 층, 낮은 입 ÷ 수평)  · apex 비");
        for &nf in ns {
            let n = nf as usize;
            for l in ["mid", "low3", "3"] {
                let lv = cells.iter().find(|c| c.key == format!("n={}|layer={}|mouth=follow|r={}", n, l, ratio));
                for m in mouths.iter().filter(|m| *m != "follow") {
                    let lo = cells.iter().find(|c| c.key == format!("n={}|layer={}|mouth={}|r={}", n, l, m, ratio));
                    if let (Some(lv), Some(lo)) = (lv, lo) {
                        let g = if lv.mean("flips") > 0.0 { fx(lo.mean("flips") / lv.mean("flips"), 2) } else { "inf".into() };
                        let ap = if lv.mean("apex") > 0.0 { fx(lo.mean("apex") / lv.mean("apex"), 2) } else { "-".into() };
                        println!("  n={:>2} {:<4} {} {} vs level {} (×{})  apex ×{}", n, l, m, fx(lo.mean("flips"), 2), fx(lv.mean("flips"), 2), g, ap);
                    }
                }
            }
        }
    }
    cells
}

// ── bench / hash ──────────────────────────────────────────────────

fn bench(ns: &[f64], reps: usize, t: &Tune) {
    println!("== 스텝 시간 (단일 스레드, release, µs/step)  settle = 더미 가라앉힘 / shot = 초록 숨 3장째 + 4초(480스텝 고정)");
    println!("  n  | settle µs/step (steps) | shot µs/step | shot 최대 µs/step | 120Hz 예산 8333µs 대비");
    for &nf in ns {
        let n = nf as usize;
        let (mut settle_us, mut settle_steps, mut shot_us, mut shot_steps, mut worst) = (0.0, 0.0, 0.0, 0.0, 0.0f64);
        for r in 0..reps {
            let mut tb = Table::with_tune(r as u32 * 7907 + n as u32, t.clone());
            tb.add_pile(n, 0.07, (0.0, 0.0), &[]);
            let t0 = Instant::now();
            let st = tb.settle(600);
            settle_us += t0.elapsed().as_secs_f64() * 1e6;
            settle_steps += st.max(1) as f64;
            let ys = tb.layer_ys();
            let h = ys[(n - 1).min(2)];
            let c = tb.pile_center();
            let sh = resolve_shot(Shot { lat: 0.0, h, power: sweet_hi_for(n) * 0.9 }, n, tb.column_top(), &mut Mulberry32::new(1), 1.0);
            tb.blow(&BlowArgs::new(V3::new(c.0 - 1.0, sh.h, c.1), 1.0, 0.0, sh.power, 0.0));
            for _ in 0..480 {
                let t1 = Instant::now();
                tb.step();
                let us = t1.elapsed().as_secs_f64() * 1e6;
                worst = worst.max(us);
                shot_us += us;
                shot_steps += 1.0;
            }
        }
        let shot = shot_us / shot_steps;
        println!(
            "  {:>2} | {:>8} ({:>4}) | {:>8} | {:>8} | {}%",
            n,
            fx(settle_us / settle_steps, 1),
            fx(settle_steps / reps as f64, 0),
            fx(shot, 1),
            fx(worst, 1),
            fx(shot / 8333.3 * 100.0, 2)
        );
    }
}

fn hash_run(seed: u32, n: usize, t: &Tune) -> Vec<(String, u64)> {
    let mut out = Vec::new();
    let mut tb = Table::with_tune(seed, t.clone());
    tb.add_pile(n, 0.07, (0.0, 0.0), &[]);
    out.push(("pile".into(), tb.state_hash()));
    let st = tb.settle(600);
    out.push((format!("settle({st})"), tb.state_hash()));
    // 1) 기본 경로 초록 숨, 3장째
    let ys = tb.layer_ys();
    let c = tb.pile_center();
    let sh = resolve_shot(Shot { lat: 0.2, h: ys[(n - 1).min(2)], power: sweet_hi_for(n) * 0.9 }, n, tb.column_top(), &mut Mulberry32::new(seed), 1.0);
    tb.blow(&BlowArgs::new(aim_point(c, (0.0, -1.0), sh.lat, sh.h), 0.0, -1.0, sh.power, sh.blast));
    for i in 0..60 {
        tb.step();
        if i == 15 {
            out.push(("blow+16".into(), tb.state_hash()));
        }
    }
    out.push(("blow+60".into(), tb.state_hash()));
    let s1 = tb.run_until_settled(4.0);
    out.push((format!("settled({s1}) flips={}", tb.flipped_ids().len()), tb.state_hash()));
    // 2) 가져가고 다시 쌓고, 낮은 입 + 돌풍
    let taken = tb.flipped_ids();
    for id in taken {
        tb.remove(id);
    }
    tb.restack((0.0, 0.0));
    tb.settle(600);
    out.push(("restack".into(), tb.state_hash()));
    let live = tb.live_ids().len();
    if live > 0 {
        let ys = tb.layer_ys();
        let c = tb.pile_center();
        let sh = resolve_shot(Shot { lat: -0.3, h: ys[(live - 1) / 2], power: sweet_hi_for(live) * 1.1 }, live, tb.column_top(), &mut Mulberry32::new(seed ^ 0x55), 1.0);
        let mut b = BlowArgs::new(aim_point(c, (1.0, 0.0), sh.lat, sh.h), 1.0, 0.0, sh.power, sh.blast);
        b.mouth_y = Some(0.15);
        tb.blow(&b);
        let s2 = tb.run_until_settled(4.0);
        out.push((format!("lip+blast settled({s2}) flips={} outs={}", tb.flipped_ids().len(), tb.out_ids().len()), tb.state_hash()));
    }
    out
}

/// JS scratch trace.mjs 와 같은 요약: settle 높이·블로우 궤적
fn trace(seed: u32, n: usize, r: f64, hf: f64, t: &Tune) {
    let mut tb = Table::with_tune(seed * 7907 + n as u32, t.clone());
    tb.add_pile(n, 0.07, (0.0, 0.0), &[]);
    println!("init y {}", (0..n).map(|i| fx(tb.pos(i).y, 4)).collect::<Vec<_>>().join(" "));
    let st = tb.settle(600);
    println!("settle {} top {} ys {}", st, fx(tb.column_top(), 5), (0..n).map(|i| fx(tb.pos(i).y, 4)).collect::<Vec<_>>().join(" "));
    println!("xz {}", (0..n).map(|i| { let p = tb.pos(i); format!("{},{}", fx(p.x, 3), fx(p.z, 3)) }).collect::<Vec<_>>().join(" "));
    let top = tb.column_top();
    let sh = resolve_shot(Shot { lat: 0.0, h: (top * hf).max(0.03), power: sweet_hi_for(n) * r }, n, top, &mut Mulberry32::new(seed * 31 + n as u32), 1.0);
    let c = tb.pile_center();
    println!("shot h={} power={} blast={}", sh.h, sh.power, sh.blast);
    tb.blow(&BlowArgs::new(V3::new(c.0 - (1.0 - sh.lat * sh.lat).sqrt(), sh.h, c.1 + sh.lat), 1.0, 0.0, sh.power, sh.blast));
    for i in 0..120 {
        tb.step();
        if i < 18 && i % 4 == 1 {
            println!("hits {} {}", i, tb.last_hits.iter().map(|h| format!("{}:s{}g{}", h.id, fx(h.s, 3), fx(h.gap, 3))).collect::<Vec<_>>().join(" "));
        }
        if [0, 1, 4, 8, 15, 16, 30, 60, 119].contains(&i) {
            let v: Vec<String> = (0..n).map(|id| {
                let b = &tb.world.bodies[tb.discs[id].body];
                let (v, w) = (b.linvel(), b.angvel());
                format!("{}:v({},{},{})w{}", id, fx(v.x as f64, 2), fx(v.y as f64, 2), fx(v.z as f64, 2), fx(w.length() as f64, 2))
            }).collect();
            println!("step {} maxSpeed {} {}", i, fx(tb.max_speed(), 3), v[n.saturating_sub(5)..].join(" "));
        }
    }
    tb.run_until_settled(4.0);
    println!("final flips {} outs {}", tb.flipped_ids().len(), tb.out_ids().len());
}

/// 가라앉은 더미 높이 프로필 (JS scratch settleprof.mjs 와 대조): 접촉 스프링 맞추기용
fn settleprof(ns: &[f64], t: &Tune) {
    for &nf in ns {
        let n = nf as usize;
        let s_n = 6;
        let (mut top, mut bot, mut st) = (0.0, 0.0, 0.0);
        for s in 1..=s_n as u32 {
            let mut tb = Table::with_tune(s * 7907 + n as u32, t.clone());
            tb.add_pile(n, 0.07, (0.0, 0.0), &[]);
            st += tb.settle(600) as f64;
            top += tb.column_top();
            bot += (0..n).map(|i| tb.pos(i).y).fold(f64::INFINITY, f64::min);
        }
        let k = s_n as f64;
        println!("n={:>2} top {} bottom {} settle {}", n, fx(top / k, 4), fx(bot / k, 4), fx(st / k, 0));
    }
}

/// 많은 시드 × 장수의 시나리오 해시를 하나로 접는다 (아키텍처 간 결정성 대조: x86_64 / aarch64 / wasm32)
fn hashsweep(seeds: u32, ns: &[f64], t: &Tune) {
    let mut all = puff_sim::Fnv64::new();
    let mut count = 0;
    for &nf in ns {
        let mut per = puff_sim::Fnv64::new();
        for seed in 1..=seeds {
            for (_, h) in hash_run(seed, nf as usize, t) {
                per.u64(h);
                all.u64(h);
                count += 1;
            }
        }
        println!("n={:>2} seeds 1..{} → {:016x}", nf, seeds, per.finish());
    }
    println!("ALL {:016x} ({} hashes)", all.finish(), count);
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(String::as_str).unwrap_or("help");
    let t = tune();
    let t0 = Instant::now();
    let json_path = std::env::var("JSON").ok();
    let mut all: Vec<(String, Vec<Cell>)> = Vec::new();
    match cmd {
        "powercurve" => {
            let s = arg_num(&args, 1, 16.0) as usize;
            all.push(("powercurve".into(), powercurve(s, &arg_list(&args, 2, "8,12,20"), &arg_list(&args, 3, "0.95,0.75,0.5"), &t)));
        }
        "fromtop" => {
            let s = arg_num(&args, 1, 16.0) as usize;
            all.push(("fromtop".into(), fromtop(s, &arg_list(&args, 2, "3,5,8,12,16,20"), &t)));
        }
        "aimmap" => {
            let s = arg_num(&args, 1, 16.0) as usize;
            all.push(("aimmap".into(), aimmap(s, arg_num(&args, 2, 12.0) as usize, arg_num(&args, 3, 0.9), &t)));
        }
        "stackpower" => {
            let s = arg_num(&args, 1, 16.0) as usize;
            all.push(("stackpower".into(), stackpower(s, &arg_list(&args, 2, "1,2,3,5,8"), &t)));
        }
        "mouthmap" => {
            let s = arg_num(&args, 1, 16.0) as usize;
            all.push(("mouthmap".into(), mouthmap(s, &arg_list(&args, 2, "14,20"), &t)));
        }
        "all" => {
            let s = arg_num(&args, 1, 16.0) as usize;
            println!("## powercurve");
            all.push(("powercurve".into(), powercurve(s, &[8.0, 12.0, 20.0], &[0.95, 0.75, 0.5], &t)));
            println!("## fromtop");
            all.push(("fromtop".into(), fromtop(s, &[3.0, 5.0, 8.0, 12.0, 16.0, 20.0], &t)));
            println!("## aimmap (LATS=-0.6,0,0.6 N=12 R=0.9)");
            std::env::set_var("LATS", std::env::var("LATS").unwrap_or_else(|_| "-0.6,0,0.6".into()));
            all.push(("aimmap".into(), aimmap(s, 12, 0.9, &t)));
            println!("## stackpower");
            all.push(("stackpower".into(), stackpower(s, &[1.0, 2.0, 3.0, 5.0, 8.0], &t)));
            println!("## mouthmap");
            all.push(("mouthmap".into(), mouthmap(s, &[14.0, 20.0], &t)));
        }
        "bench" => {
            let ns = arg_list(&args, 1, "1,5,10,20,30,40");
            bench(&ns, arg_num(&args, 2, 5.0) as usize, &t);
        }
        "settleprof" => settleprof(&arg_list(&args, 1, "1,2,3,5,8,12,16,20,30"), &t),
        "trace" => trace(arg_num(&args, 1, 1.0) as u32, arg_num(&args, 2, 12.0) as usize, arg_num(&args, 3, 0.9), arg_num(&args, 4, 0.75), &t),
        "hashsweep" => {
            println!("{}", puff_sim::sim_version());
            hashsweep(arg_num(&args, 1, 50.0) as u32, &arg_list(&args, 2, "1,5,12,20,30"), &t)
        }
        "hash" => {
            let seed = arg_num(&args, 1, 7.0) as u32;
            let n = arg_num(&args, 2, 20.0) as usize;
            println!("{}", puff_sim::sim_version());
            for (k, h) in hash_run(seed, n, &t) {
                println!("{h:016x}  {k}");
            }
        }
        _ => {
            eprintln!("사용: puff_parity <powercurve|fromtop|aimmap|stackpower|mouthmap|all|bench|hash> [인자…]  (src/bin/puff_parity.rs 머리말 참고)");
            std::process::exit(2);
        }
    }
    if let Some(p) = json_path {
        let body: Vec<String> = all.iter().map(|(tool, cells)| cells_json(tool, cells)).collect();
        std::fs::write(&p, format!("{{\"engine\":\"rust\",\"tune\":\"{}\",\"suites\":[{}]}}", std::env::var("TUNE").unwrap_or_default(), body.join(","))).expect("JSON 쓰기");
    }
    eprintln!("({:.1}s)", t0.elapsed().as_secs_f64());
}
