//! puff_v2 — 3D 제트 스파이크 CLI
//!
//!   puff_v2 settle [N,N,..] [시드 수] [스레드] [1920]  G1 쌓임 (기본 1,10,20,40,64,80 · 20시드 · 3스레드; 1920 = 대비책 400 Hz × 16)
//!   puff_v2 unit                                   S0 = A0.8 (+ A0.7·H3·F1 옆면·말림 쐐기 기록)
//!   puff_v2 spike S1..S6 [seeds=8] [threads=3] [ns=20,30] [out=파일.jsonl]   실험 한 게이트 (요약 JSON, 샷은 out 에)
//!   puff_v2 shot key=value ...                     샷 하나 → JSON 한 줄 (trace=1 이면 스텝 기록을 stderr 로)
//!   puff_v2 batch [threads] < 줄마다 key=value      샷 여러 개 → 입력 순서대로 JSON 줄
//!   puff_v2 probe key=value ...                    가라앉힌 더미에 최대 유량 순간 공력 한 번 (경계면별 진단). pose=flat 은 build_flat 0.30 s, 그 밖은 원시 입력 0.15 s (PROBE_T=초)
//!   puff_v2 nominal [N,N,..] [a-b]                 시드별 명목 더미 높이 (물리 없음, 조준 격자용 — scripts/spike.py)
//!   puff_v2 version
//!
//! 샷 키: n seed pose=chin|eye|under breath=puff|pueok q dur sweep(°/s) delay smax mode=c|a|b h lat inset sigma warp
//!        cp0 cp_in cd f2 audit trace max_after mu_pp mu_pt fwarp=curl:0.03:90 ftop tag tk mk
//!        pose=flat 전용: rel=D|top relx off w t0 a=도|top ax area=pueok|puff tilt (원시 숨 키 breath dur sweep delay smax 와 섞으면 오류)

use puff_v2::*;
use std::io::{BufRead, Write};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(|s| s.as_str()).unwrap_or("help");
    let rest = if args.len() > 1 { &args[1..] } else { &[][..] };
    match cmd {
        "settle" => {
            let ns: Vec<usize> = rest
                .first()
                .map(|s| s.split(',').map(|x| x.parse().expect("N 목록")).collect())
                .unwrap_or(vec![1, 10, 20, 40, 64, 80]);
            let seeds: u32 = rest.get(1).and_then(|s| s.parse().ok()).unwrap_or(20);
            let th: usize = rest.get(2).and_then(|s| s.parse().ok()).unwrap_or(3);
            let t0 = std::time::Instant::now();
            let mut cfg = if rest.get(3).map(|s| s.as_str()) == Some("1920") { pile::SolverCfg::fallback_1920() } else { pile::SolverCfg::default() };
            // 진단: PGS·STAB=정수,정수 (기본 2,2)
            if let Ok(v) = std::env::var("PGS_STAB") {
                let p: Vec<usize> = v.split(',').map(|x| x.parse().unwrap()).collect();
                cfg.pgs_iters = p[0];
                cfg.stab_iters = p[1];
            }
            let rows = gates::settle_gate(&ns, seeds, th, cfg);
            for r in &rows {
                eprintln!(
                    "G1 n={:3} 꼭대기/명목 min {:.4} mean {:.4} | 맨아래 여유 {:+.4} | 3s 뒤 vmax {:.4} | 무너짐 {}/{} | 스텝 평균 {:.0}µs p99 {:.0}µs 최대 {:.0}µs | {}",
                    r.n,
                    r.top_min,
                    r.top_mean,
                    r.bottom_margin_min,
                    r.vmax_3s,
                    r.collapsed,
                    r.seeds,
                    r.step_us_mean,
                    r.step_us_p99,
                    r.step_us_max,
                    if r.pass { "통과" } else { "실패" }
                );
            }
            eprintln!("({:.1} s)", t0.elapsed().as_secs_f64());
            println!("{}", gates::settle_json(&rows));
        }
        "unit" => {
            let (rows, ok) = gates::s0_gate();
            for r in &rows {
                eprintln!(
                    "S0 {:9} A {:.1}cm² x {:4.1} {:2.0}° 판폭/제트폭 {:.2} 점 {:4} → F/J {:.4} 띠 [{:.2},{:.2}] {}",
                    r.path,
                    r.area_cm2,
                    r.x,
                    r.angle_deg,
                    r.width_ratio,
                    r.n_pts,
                    r.f_over_j,
                    r.band.0,
                    r.band.1,
                    if r.pass { "통과" } else { "실패" }
                );
            }
            eprintln!("S0 = A0.8 {}", if ok { "통과" } else { "실패 — 법칙 버그, 진행 중지" });
            println!("{}", gates::s0_json(&rows, ok));
            for l in gates::unit_extras() {
                println!("{l}");
            }
            if !ok {
                std::process::exit(2);
            }
        }
        "spike" => {
            let gate = rest.first().cloned().unwrap_or_else(|| "S1".into());
            let mut cfg = gates::SpikeCfg::default();
            let mut out: Option<String> = None;
            for kv in rest.iter().skip(1) {
                let (k, v) = kv.split_once('=').expect("key=value");
                match k {
                    "seeds" => cfg.seeds = v.parse().unwrap(),
                    "threads" => cfg.threads = v.parse().unwrap(),
                    "ns" => cfg.ns = Some(v.split(',').map(|x| x.parse().unwrap()).collect()),
                    "hfrac" => cfg.hfrac = v.split(',').map(|x| x.parse().unwrap()).collect(),
                    "out" => out = Some(v.to_string()),
                    _ => panic!("모르는 키 {k}"),
                }
            }
            match gates::spike(&gate, &cfg) {
                Ok((summary, shots)) => {
                    if let Some(path) = out {
                        let mut f = std::fs::File::create(&path).expect("out 파일");
                        for s in &shots {
                            writeln!(f, "{}", s.to_json()).unwrap();
                        }
                    }
                    println!("{summary}");
                }
                Err(e) => {
                    eprintln!("{e}");
                    std::process::exit(1);
                }
            }
        }
        "shot" => {
            let spec = ShotSpec::parse_kv(&rest.join(" ")).unwrap_or_else(|e| {
                eprintln!("{e}");
                std::process::exit(1)
            });
            let r = run_shot(&spec);
            if spec.trace {
                for l in &r.trace {
                    eprintln!("{l}");
                }
            }
            println!("{}", r.to_json());
        }
        "batch" => {
            let th: usize = rest.first().and_then(|s| s.parse().ok()).unwrap_or(3);
            let stdin = std::io::stdin();
            let mut specs = Vec::new();
            for line in stdin.lock().lines() {
                let line = line.unwrap();
                let l = line.trim();
                if l.is_empty() || l.starts_with('#') {
                    continue;
                }
                specs.push(ShotSpec::parse_kv(l).unwrap_or_else(|e| {
                    eprintln!("{e}: {l}");
                    std::process::exit(1)
                }));
            }
            for r in run_batch(&specs, th) {
                println!("{}", r.to_json());
            }
        }
        "nominal" => {
            // 명목 더미 높이 Σ 두께 (물리 없이 시드 → 배치만). puff_v2 nominal 20,30,40 1-64 → 줄마다 "n seed nominal"
            let ns: Vec<usize> = rest.first().map(|s| s.split(',').map(|x| x.parse().expect("N 목록")).collect()).unwrap_or(vec![20, 40]);
            let (a, b) = rest
                .get(1)
                .and_then(|s| s.split_once('-'))
                .map(|(a, b)| (a.parse::<u32>().unwrap(), b.parse::<u32>().unwrap()))
                .unwrap_or((1, 64));
            for &n in &ns {
                for seed in a..=b {
                    println!("{} {} {:.6}", n, seed, gates::nominal_height(n, seed));
                }
            }
        }
        "probe" => {
            let spec = ShotSpec::parse_kv(&rest.join(" ")).unwrap();
            let snap = shot::settle_pile(&spec.pile, spec.solver);
            let sim = pile::Sim::restore(&snap);
            // pose=flat 은 샷과 같은 build_flat 길(꼭대기 = 가라앉힌 더미). 순간 시각: PROBE_T(화면 초),
            // 기본 원시 입력 0.15 s(퍽 가득) · 평평한 바닥 0.30 s(rel 봉투 가득 0.26 s 뒤, 입 넓어지기 0.32 s 전 = 최대 유량)
            let prog = match &spec.flat {
                Some(fs) => breath::BreathProgram::build_flat(fs, spec.mode, spec.lat, sim.z_f, sim.desk.z_e, sim.column_top()),
                None => breath::BreathProgram::build(&spec.raw(), spec.mode, sim.z_f, sim.desk.z_e),
            };
            let t_probe: f64 = std::env::var("PROBE_T").ok().and_then(|v| v.parse().ok()).unwrap_or(if spec.flat.is_some() { 0.30 } else { 0.15 });
            let k = ((t_probe / breath::JET_DT) as usize).min(prog.samples.len() - 1);
            let jet = jet::Jet::from_sample(&prog.samples[k]).unwrap();
            println!("jet t={:.4} m={:?} d={:?} j={:.2} pi0={:.1} d0={:.3}", (k as f64 + 0.5) * breath::JET_DT, jet.m, jet.d, jet.j, jet.pi0, jet.d0);
            let mut a = aero::Aero::new(spec.aero);
            a.debug = true;
            let (fr, ci) = a.compute(&sim, Some(&jet));
            for l in &a.dbg {
                println!("{l}");
            }
            let w = units::w_ref_sim();
            for i in 0..sim.n() {
                println!(
                    "disc {i:2} y={:.3} kind={} a={:.3} sup={:?} F=({:.2},{:.2},{:.2})W T=({:.2},{:.2},{:.2}) fext=({:.2},{:.2},{:.2}) jint={:.2}",
                    fr[i].c.y,
                    sim.props[i].kind.name(),
                    sim.props[i].a,
                    ci.support[i],
                    a.out.force[i].x / w,
                    a.out.force[i].y / w,
                    a.out.force[i].z / w,
                    a.out.torque[i].x / w,
                    a.out.torque[i].y / w,
                    a.out.torque[i].z / w,
                    a.out.f_ext[i].x / w,
                    a.out.f_ext[i].y / w,
                    a.out.f_ext[i].z / w,
                    a.out.j_int[i] / w
                );
            }
        }
        "version" => println!("{}", physics_version()),
        _ => {
            eprintln!("쓰는 법: puff_v2 settle|unit|spike S1..S6|shot k=v..|batch|probe k=v..|version");
            std::process::exit(1);
        }
    }
}
