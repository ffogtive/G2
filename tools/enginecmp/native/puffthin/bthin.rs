//! bthin — enginecmp B(쏜 뒤)를 앱 엔진(Rapier 0.36 + puff_sim 게임 바람) 위에서.
//!
//!   PUFF_DISC_H=0.055 bthin --name X [--preset v1|web] [--tune "contactHz=240,contactZeta=5"] [--ns 10,20,30,40] [--seeds 1-12] [--post 720] [--sub 1]
//!
//! 절차는 tools/enginecmp/compare.mjs runShotTrial 과 같다: 원기둥 더미(spread 0.07) → settle(600) → 표준 초록 숨
//! (더미 중심 −1 x, 위에서 3장째 높이, +x, 세기 0.95, 돌풍 0, 기본 경로) → 프레임마다 stepJudge → 6 s(720 프레임)까지.
//! --sub k: 한 프레임(1/120)을 k 번의 dt/k 스텝으로(바깥 하위 스텝). 판정·속도는 프레임 끝에서만 본다.
//! 출력: 판마다 JSON 한 줄 (compare.mjs 원자료와 같은 키: settleSteps heightRatio judge{steps,kind,flipped,outs} rest08 rest02 v5s drift3to6 sleeping).
use puff_sim::table::{disc_h, BlowArgs, JudgeState, Table, V3};
use puff_sim::Tune;

fn range(s: &str) -> Vec<u32> {
    let mut v = Vec::new();
    for p in s.split(',') {
        if let Some((a, b)) = p.split_once('-') {
            for i in a.parse::<u32>().unwrap()..=b.parse::<u32>().unwrap() {
                v.push(i);
            }
        } else {
            v.push(p.parse().unwrap());
        }
    }
    v
}

fn poses(t: &Table) -> Vec<V3> {
    t.discs.iter().map(|d| t.pos(d.id)).collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let opt = |k: &str, d: &str| -> String {
        args.iter().position(|a| a == &format!("--{k}")).map(|i| args[i + 1].clone()).unwrap_or_else(|| d.to_string())
    };
    let name = opt("name", "R36");
    let mut tune = if opt("preset", "v1") == "web" { Tune::web_literal() } else { Tune::default() };
    tune.apply_overrides(&opt("tune", "")).expect("tune");
    let sub: u32 = opt("sub", "1").parse().unwrap();
    let frame_dt = tune.dt;
    tune.dt = frame_dt / sub as f64;
    let ns = range(&opt("ns", "10,20,30,40"));
    let seeds = range(&opt("seeds", "1-12"));
    let post: u32 = opt("post", "720").parse().unwrap();
    let h = disc_h();
    let spring = tune.contact_spring();
    let sspring = tune.static_spring();
    eprintln!("{name}: h {h} sub {sub} dt {} spring {:?} static {:?}", tune.dt, spring, sspring);
    for &n in &ns {
        for &seed in &seeds {
            let mut t = Table::with_tune(seed, tune.clone());
            t.add_pile(n as usize, 0.07, (0.0, 0.0), &[]);
            let t0 = std::time::Instant::now();
            // settle (sim.js: 60 스텝 뒤 최대 속도 < 0.06 이면 끝, 상한 600) — 프레임 단위
            let mut settle_steps = 600u32;
            for i in 0..600u32 {
                for _ in 0..sub {
                    t.step();
                }
                if i > 60 && t.max_speed() < 0.06 {
                    settle_steps = i;
                    break;
                }
            }
            let ms_settle = t0.elapsed().as_secs_f64() * 1000.0 / (settle_steps + 1) as f64;
            let top = t.column_top();
            let height_ratio = top / (n as f64 * h);
            let bottom = t.discs.iter().map(|d| t.pos(d.id).y).fold(f64::INFINITY, f64::min);
            let floor_pen = h / 2.0 - bottom;
            // 표준 초록 숨
            let (cx, cz) = t.pile_center();
            let mut ys: Vec<f64> = t.discs.iter().filter(|d| !d.off).map(|d| t.pos(d.id).y).collect();
            ys.sort_by(|a, b| b.partial_cmp(a).unwrap());
            let y = ys[(3usize).min(ys.len()) - 1];
            t.blow(&BlowArgs::new(V3::new(cx - 1.0, y, cz), 1.0, 0.0, 0.95, 0.0));
            let mut j = JudgeState::default();
            let mut strict = 0u32;
            let mut judge: Option<(u32, &str, usize, usize)> = None;
            let mut speeds = Vec::with_capacity(post as usize);
            let mut p3 = None;
            let t1 = std::time::Instant::now();
            for k in 1..=post {
                for _ in 0..sub {
                    t.step();
                }
                if judge.is_none() {
                    let ms = t.max_speed();
                    strict = if t.puff.is_none() && j.n + 1 > 72 && ms < 0.08 { strict + 1 } else { 0 };
                    if t.step_judge(&mut j) {
                        let kind = if k >= 600 { "cap" } else if strict > 24 { "quiet" } else { "late" };
                        judge = Some((k, kind, t.flipped_ids().len(), t.out_ids().len()));
                    }
                }
                speeds.push(t.max_speed());
                if k == 360 {
                    p3 = Some(poses(&t));
                }
            }
            let ms_post = t1.elapsed().as_secs_f64() * 1000.0 / post as f64;
            let pe = poses(&t);
            let p3 = p3.unwrap();
            let mut drift = 0.0f64;
            for d in &t.discs {
                if d.off {
                    continue;
                }
                let (a, b) = (p3[d.id], pe[d.id]);
                drift = drift.max(((a.x - b.x).powi(2) + (a.y - b.y).powi(2) + (a.z - b.z).powi(2)).sqrt());
            }
            let last = |thr: f64| -> Option<usize> {
                for i in (0..speeds.len()).rev() {
                    if speeds[i] >= thr {
                        return if i + 1 < speeds.len() { Some(i + 1) } else { None };
                    }
                }
                Some(0)
            };
            let js = |o: Option<usize>| o.map(|v| v.to_string()).unwrap_or("null".into());
            let sleeping = t.discs.iter().filter(|d| !d.off && t.world.bodies[d.body].is_sleeping()).count();
            let (js_steps, kind, fl, outs) = judge.unwrap_or((post, "cap", 0, 0));
            println!(
                "{{\"name\":\"{name}\",\"n\":{n},\"h\":{h},\"seed\":{seed},\"settleSteps\":{settle_steps},\"heightRatio\":{:.4},\"floorPen\":{:.5},\"judge\":{{\"steps\":{js_steps},\"kind\":\"{kind}\",\"flipped\":{fl},\"outs\":{outs}}},\"end\":{{\"flipped\":{},\"outs\":{}}},\"rest08\":{},\"rest02\":{},\"v5s\":{:.4},\"v6s\":{:.4},\"drift3to6\":{:.4},\"sleeping\":{sleeping},\"msSettle\":{:.3},\"msPost\":{:.3},\"hash\":\"{:016x}\"}}",
                height_ratio, floor_pen, t.flipped_ids().len(), t.out_ids().len(), js(last(0.08)), js(last(0.02)), speeds[599], speeds[speeds.len() - 1], drift, ms_settle, ms_post, t.state_hash()
            );
        }
    }
}
