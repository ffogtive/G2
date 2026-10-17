//! 게이트: G1 쌓임(settle), S0 = A0.8 단위(unit) + 부록(A0.7·H3·쐐기), 스파이크 S1~S6 실험 정의(spike).
//!
//! 측정 원칙(§7.1): 같은 시드 = 같은 더미(CRN, 팔끼리 공통), 오라클 조준은 앞 절반 시드로 고르고 뒤 절반으로 보고,
//! 짝지은 부트스트랩 2000회(결정적 난수). 스레드는 최대 3개.

use crate::aero::{frame_at, plate_force, Aero, AeroParams};
use crate::breath::{BreathProgram, BreathSpec, Kind};
use crate::geom::{rad, Qt, V3};
use crate::jet::Jet;
use crate::json::{arr, num, Obj};
use crate::pile::{PileParams, Sim, SolverCfg};
use crate::pose::{Pose, SweepMode};
use crate::rng::Mulberry32;
use crate::shot::{run_batch, ShotResult, ShotSpec};
use crate::units::w_ref_sim;

// ───────────────────────── G1 쌓임 ─────────────────────────

#[derive(Clone, Debug, Default)]
pub struct SettleRow {
    pub n: usize,
    pub seeds: u32,
    pub top_min: f64,
    pub top_mean: f64,
    pub bottom_margin_min: f64,
    pub vmax_3s: f64,
    pub collapsed: u32,
    pub step_us_mean: f64,
    pub step_us_p99: f64,
    pub step_us_max: f64,
    pub pass: bool,
}

/// G1: N 장 더미를 정직한 접촉으로 3 s (120 Hz × 12) 세운 뒤
/// 꼭대기/명목, 맨 아래 중심 − (두께/2 − 0.003), 3 s 뒤 최대 점 속력, 무너짐(꼭대기 < 90% 또는 수평 0.5 u 넘게 밀림)
pub fn settle_gate(ns: &[usize], seeds: u32, threads: usize, cfg: SolverCfg) -> Vec<SettleRow> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;
    let jobs: Vec<(usize, u32)> = ns.iter().flat_map(|&n| (1..=seeds).map(move |s| (n, s))).collect();
    let next = AtomicUsize::new(0);
    type Rec = (f64, f64, f64, bool, Vec<f64>);
    let out: Mutex<Vec<Option<Rec>>> = Mutex::new(vec![None; jobs.len()]);
    std::thread::scope(|sc| {
        for _ in 0..threads.clamp(1, 3) {
            sc.spawn(|| loop {
                let k = next.fetch_add(1, Ordering::SeqCst);
                if k >= jobs.len() {
                    break;
                }
                let (n, seed) = jobs[k];
                let p = PileParams::new(n, seed);
                let mut sim = Sim::build(&p, cfg);
                let start: Vec<V3> = (0..n).map(|i| sim.pos(i)).collect();
                let mut us = Vec::with_capacity(360);
                for _ in 0..360 {
                    let t0 = std::time::Instant::now();
                    sim.step();
                    us.push(t0.elapsed().as_secs_f64() * 1e6);
                }
                let top = sim.column_top() / sim.nominal;
                // 맨 아래 딱지 = 가장 낮은 중심
                let mut lo = 0usize;
                for i in 0..n {
                    if sim.pos(i).y < sim.pos(lo).y {
                        lo = i;
                    }
                }
                let margin = sim.pos(lo).y - (sim.props[lo].h * 0.5 - 0.003);
                let vmax = sim.max_speed();
                let mut moved = false;
                for i in 0..n {
                    let p = sim.pos(i);
                    if libm::sqrt((p.x - start[i].x) * (p.x - start[i].x) + (p.z - start[i].z) * (p.z - start[i].z)) > 0.5 {
                        moved = true;
                    }
                }
                let collapsed = top < 0.9 || moved;
                out.lock().unwrap()[k] = Some((top, margin, vmax, collapsed, us));
            });
        }
    });
    let res: Vec<Rec> = out.into_inner().unwrap().into_iter().map(|r| r.unwrap()).collect();
    let mut rows = Vec::new();
    for &n in ns {
        let mut row = SettleRow { n, seeds, top_min: 9.0, bottom_margin_min: 9.0, ..Default::default() };
        let mut all_us = Vec::new();
        let mut ssum = 0.0;
        for (k, &(nn, _)) in jobs.iter().enumerate() {
            if nn != n {
                continue;
            }
            let (top, margin, vmax, coll, ref us) = res[k];
            row.top_min = row.top_min.min(top);
            ssum += top;
            row.bottom_margin_min = row.bottom_margin_min.min(margin);
            row.vmax_3s = row.vmax_3s.max(vmax);
            if coll {
                row.collapsed += 1;
            }
            all_us.extend_from_slice(us);
        }
        row.top_mean = ssum / seeds as f64;
        all_us.sort_by(|a, b| a.partial_cmp(b).unwrap());
        row.step_us_mean = all_us.iter().sum::<f64>() / all_us.len().max(1) as f64;
        row.step_us_p99 = all_us[((all_us.len() as f64 * 0.99) as usize).min(all_us.len() - 1)];
        row.step_us_max = *all_us.last().unwrap_or(&0.0);
        let need = if n > 64 { 0.95 } else { 0.97 };
        row.pass = row.top_min >= need && row.bottom_margin_min >= 0.0 && row.vmax_3s < 0.05 && row.collapsed == 0;
        rows.push(row);
    }
    rows
}

pub fn settle_json(rows: &[SettleRow]) -> String {
    let items: Vec<String> = rows
        .iter()
        .map(|r| {
            let mut o = Obj::new();
            o.u("n", r.n as u64)
                .u("seeds", r.seeds as u64)
                .f("top_min", r.top_min, 4)
                .f("top_mean", r.top_mean, 4)
                .f("bottom_margin_min", r.bottom_margin_min, 4)
                .f("vmax_3s", r.vmax_3s, 4)
                .u("collapsed", r.collapsed as u64)
                .f("step_us_mean", r.step_us_mean, 0)
                .f("step_us_p99", r.step_us_p99, 0)
                .f("step_us_max", r.step_us_max, 0)
                .b("pass", r.pass);
            o.end()
        })
        .collect();
    let all = rows.iter().all(|r| r.pass);
    let mut o = Obj::new();
    o.s("gate", "G1").b("pass", all).raw("rows", &arr(&items));
    o.end()
}

// ───────────────────────── S0 = A0.8 ─────────────────────────

#[derive(Clone, Debug)]
pub struct S0Row {
    pub path: &'static str,
    pub area_cm2: f64,
    pub x: f64,
    pub angle_deg: f64,
    pub plate_r: f64,
    pub width_ratio: f64,
    pub n_pts: usize,
    pub f_over_j: f64,
    pub band: (f64, f64),
    pub pass: bool,
}

/// S0: 제트보다 3배 넓은 면에 수직 0.9~1.0·J, 45° 에서 0.65~0.75·J.
/// (1) 법칙 경로: 판 반지름 = 3·r½(x) (판 폭 = 제트 폭 2r½ 의 3배), 해바라기 4096점
/// (2) 엔진 경로: 실제 딱지(R 1) 아래 면을 F3 코드 그대로(128점·가림 광선) — 딱지 폭이 제트 폭의 3배 이상인 거리만
pub fn s0_gate() -> (Vec<S0Row>, bool) {
    let mut rows = Vec::new();
    let ap = AeroParams::default();
    for &a in &[1.1, 2.5] {
        for &x in &[1.0, 2.0, 3.0, 4.5, 6.0, 9.0] {
            for &ang in &[90.0, 45.0] {
                // 제트: 원점에서 +y 로. 판 중심은 축 위 x, 판 법선은 제트와 ang 각(90 = 정면)
                let jet = Jet::new(V3::ZERO, V3::Y, 3.9, a);
                let jf = jet.j_force();
                let rh = jet.r_half(x);
                let c = V3::new(0.0, x, 0.0);
                let th = rad(90.0 - ang);
                let n = V3::new(libm::sin(th), -libm::cos(th), 0.0); // 바깥 법선(제트 쪽)
                let rp = 3.0 * rh;
                let f = plate_force(&jet, c, n, rp, 4096, ap.cp0);
                let fj = f.len() / jf;
                let band = if ang == 90.0 { (0.9, 1.0) } else { (0.65, 0.75) };
                rows.push(S0Row {
                    path: "law",
                    area_cm2: a,
                    x,
                    angle_deg: ang,
                    plate_r: rp,
                    width_ratio: 3.0,
                    n_pts: 4096,
                    f_over_j: fj,
                    band,
                    pass: fj >= band.0 && fj <= band.1 + 1e-9,
                });
            }
        }
    }
    // 엔진 경로: 실제 딱지 아래 면(F3)
    let mut aero = Aero::new(ap);
    for &a in &[1.1, 2.5] {
        for &x in &[1.0, 1.5, 2.0, 3.0] {
            for &ang in &[90.0, 45.0] {
                let jet = Jet::new(V3::new(0.0, -x, 0.0), V3::Y, 3.9, a);
                let jf = jet.j_force();
                let rh = jet.r_half(x);
                let ratio = 2.0 / (2.0 * rh);
                if ratio < 3.0 {
                    continue;
                }
                // 딱지: 중심 원점, 아래 면이 제트를 향하게(그림-아래 자세에서 x 축으로 90−ang 기울임)
                let q = Qt::axis_angle(V3::new(0.0, 0.0, 1.0), rad(90.0 - ang)).mul(Qt::axis_angle(V3::new(1.0, 0.0, 0.0), core::f64::consts::PI));
                let h = 0.05;
                // 아래 면 중심이 축 위 x 거리에 오도록 딱지 중심을 h/2 올림(기울어도 면 중심이 원점)
                let up = {
                    let ly = q.rotate(V3::Y);
                    if ly.y >= 0.0 {
                        ly
                    } else {
                        -ly
                    }
                };
                let fr = frame_at(up * (0.5 * h), q, h);
                let f = aero.s0_bottom_face(&jet, fr);
                let fj = f.len() / jf;
                let band = if ang == 90.0 { (0.9, 1.0) } else { (0.65, 0.75) };
                rows.push(S0Row {
                    path: "engine_F3",
                    area_cm2: a,
                    x,
                    angle_deg: ang,
                    plate_r: 1.0,
                    width_ratio: ratio,
                    n_pts: ap.n_face,
                    f_over_j: fj,
                    band,
                    pass: fj >= band.0 && fj <= band.1 + 1e-9,
                });
            }
        }
    }
    let ok = rows.iter().all(|r| r.pass);
    (rows, ok)
}

/// unit 부록: A0.7(책상에 가려진 쪽 공력 0), H3(정지 공기 F6 = 0), 더미 옆면 F1 합(기록), 말림 쐐기 Π_c/Π_ext(기록)
pub fn unit_extras() -> Vec<String> {
    let mut lines = Vec::new();
    let ap = AeroParams::default();
    // F1 더미 옆면: 40장 원기둥(정지 자세), 제트 수평으로 가운데 높이, 거리 3 → 원통이라 판보다 작게(c² 때문에) 나와야
    {
        let mut fr = Vec::new();
        let qd = Qt::axis_angle(V3::new(1.0, 0.0, 0.0), core::f64::consts::PI);
        for i in 0..40 {
            fr.push(frame_at(V3::new(0.0, 0.025 + 0.05 * i as f64, 0.0), qd, 0.05));
        }
        let jet = Jet::new(V3::new(0.0, 1.0, 4.0), V3::new(0.0, 0.0, -1.0), 3.9, 1.1);
        let mut a = Aero::new(ap);
        let desk = crate::pile::Desk::new(20.0);
        let f = a.f1_only(&jet, &fr, &desk);
        let mut o = Obj::new();
        o.s("check", "F1_pile_side_record").f("x_to_face", 3.0, 1).f("f_over_j", f.len() / jet.j_force(), 4).s("note", "원통 옆면(c² 감소) — 판 S0 보다 작게, 기록만");
        lines.push(o.end());
    }
    // A0.7: 책상 밑 자세, 더미를 깊이 들여 놓음(s = 3) → 입에서 더미가 보이지 않음 → F1·F3·F4 = 0
    {
        let mut spec = ShotSpec::new(10, 1, Pose::Under, BreathSpec::puff(1.0), 0.0, 0.3);
        spec.pile.inset = 3.0;
        let snap = crate::shot::settle_pile(&spec.pile, spec.solver);
        let sim = Sim::restore(&snap);
        let raw = spec.raw();
        let prog = BreathProgram::build(&raw, SweepMode::Native, sim.z_f, sim.desk.z_e);
        let mut a = Aero::new(ap);
        let mut worst = 0.0f64;
        let mut cnt = 0;
        for s in prog.samples.iter().step_by(8) {
            if let Some(j) = Jet::from_sample(s) {
                a.compute(&sim, Some(&j));
                // F6 은 정지 딱지라 0, 나머지(외부형·공동)도 0 이어야
                let mut tot = 0.0;
                for i in 0..sim.n() {
                    tot += a.out.force[i].len();
                }
                worst = worst.max(tot);
                cnt += 1;
            }
        }
        let mut o = Obj::new();
        o.s("check", "A0.7_desk_occluded_zero").u("updates", cnt).f("max_total_force_w", worst / w_ref_sim(), 6).b("pass", worst == 0.0);
        lines.push(o.end());
    }
    // H3: 정지 공기 속 정지 딱지 F6 = 0 (가라앉힌 20장)
    {
        let snap = crate::shot::settle_pile(&PileParams::new(20, 3), SolverCfg::default());
        let mut sim = Sim::restore(&snap);
        for i in 0..sim.n() {
            let b = &mut sim.world.bodies[sim.discs[i].body];
            b.set_linvel(rapier3d::prelude::Vector::ZERO, false);
            b.set_angvel(rapier3d::prelude::Vector::ZERO, false);
        }
        let mut a = Aero::new(ap);
        a.compute(&sim, None);
        let mut tot = 0.0;
        for i in 0..sim.n() {
            tot += a.out.force[i].len() + a.out.torque[i].len();
        }
        let mut o = Obj::new();
        o.s("check", "H3_still_air_zero").f("sum_force_torque", tot, 12).u("h3_violations", a.out.h3_violations as u64).b("pass", tot == 0.0 && a.out.h3_violations == 0);
        lines.push(o.end());
    }
    // A0.3b 말림 쐐기 Π_c/Π_ext (기록): 한 장, 입 쪽 말림 a 0.03, 턱 꽉 퍽 최대 유량 순간
    {
        let mut spec = ShotSpec::new(1, 1, Pose::Chin, BreathSpec::puff(1.0), 0.0, 0.03);
        spec.pile.force_warp = Some((crate::pile::WarpKind::Curl, 0.03, 90.0));
        let snap = crate::shot::settle_pile(&spec.pile, spec.solver);
        let sim = Sim::restore(&snap);
        let prog = BreathProgram::build(&spec.raw(), SweepMode::Native, sim.z_f, sim.desk.z_e);
        let s = prog.samples[(0.15 / crate::breath::JET_DT) as usize];
        // 공동 단위 시험이라 해부 범위(턱 −25°)로 자르지 않은 제트로 표적(앞면 0.03 u)을 직접 겨눈다 (약 −30°)
        let rig = &prog.rig;
        let (phi, _) = crate::pose::solve_phi0(rig.pivot, rig.m0, rig.d_ref, rig.target);
        let m = rig.pivot + crate::geom::rot_x(rig.m0 - rig.pivot, phi);
        let d = crate::geom::rot_x(rig.d_ref, phi);
        let j = Jet::new(m, d, s.q_lps, s.a_cm2);
        let mut a = Aero::new(ap);
        a.compute(&sim, Some(&j));
        let r = a.out.max_pic_over_ext;
        let mut o = Obj::new();
        o.s("check", "A0.3b_curl_wedge_record").f("pic_over_ext", r, 3).s("band", "0.25~0.6").b("in_band", (0.25..=0.6).contains(&r));
        lines.push(o.end());
    }
    lines
}

pub fn s0_json(rows: &[S0Row], ok: bool) -> String {
    let items: Vec<String> = rows
        .iter()
        .map(|r| {
            let mut o = Obj::new();
            o.s("path", r.path)
                .f("area_cm2", r.area_cm2, 1)
                .f("x", r.x, 2)
                .f("angle_deg", r.angle_deg, 0)
                .f("plate_r", r.plate_r, 3)
                .f("width_ratio", r.width_ratio, 2)
                .u("n_pts", r.n_pts as u64)
                .f("f_over_j", r.f_over_j, 4)
                .raw("band", &format!("[{},{}]", r.band.0, r.band.1))
                .b("pass", r.pass);
            o.end()
        })
        .collect();
    let mut o = Obj::new();
    o.s("gate", "S0=A0.8").b("pass", ok).raw("rows", &arr(&items));
    o.end()
}

// ───────────────────────── 스파이크 S1~S6 ─────────────────────────

/// 명목 더미 높이 (u) — 조준 격자용
pub fn nominal_height(n: usize, seed: u32) -> f64 {
    crate::pile::make_layout(&PileParams::new(n, seed)).nominal
}

#[derive(Clone, Debug)]
pub struct SpikeCfg {
    pub seeds: u32,
    pub threads: usize,
    /// 조준 격자 (더미 높이 비율)
    pub hfrac: Vec<f64>,
    pub ns: Option<Vec<usize>>,
}

impl Default for SpikeCfg {
    fn default() -> Self {
        Self { seeds: 8, threads: 3, hfrac: vec![0.15, 0.35, 0.55, 0.75, 0.9], ns: None }
    }
}

/// 팔 = (이름, 샷 만들기)
type ArmFn = Box<dyn Fn(usize, u32, f64) -> ShotSpec + Sync>;

pub struct Arm {
    pub name: String,
    pub make: ArmFn,
}

fn arm<F: Fn(usize, u32, f64) -> ShotSpec + Sync + 'static>(name: &str, f: F) -> Arm {
    Arm { name: name.into(), make: Box::new(f) }
}

/// 결정적 부트스트랩: 짝지은 비 (mean b / mean a) 의 2.5·97.5 백분위.
/// 두 팔이 모두 0 이면 비가 정의되지 않으므로 (NaN, NaN, NaN) — 판정은 실패로 본다.
/// 재표본에서 둘 다 0 이면 1.0(차이 없음), a 만 0 이면 +∞.
pub fn paired_ratio_ci(a: &[f64], b: &[f64], reps: usize) -> (f64, f64, f64) {
    let n = a.len().min(b.len());
    if n == 0 {
        return (f64::NAN, f64::NAN, f64::NAN);
    }
    let ma: f64 = a.iter().sum::<f64>() / n as f64;
    let mb: f64 = b.iter().sum::<f64>() / n as f64;
    if ma == 0.0 && mb == 0.0 {
        return (f64::NAN, f64::NAN, f64::NAN);
    }
    let ratio = |sa: f64, sb: f64| -> f64 {
        if sa > 0.0 {
            sb / sa
        } else if sb > 0.0 {
            f64::INFINITY
        } else {
            1.0
        }
    };
    let point = ratio(ma, mb);
    let mut rng = Mulberry32::new(0x5eed_b007);
    let mut rs = Vec::with_capacity(reps);
    for _ in 0..reps {
        let (mut sa, mut sb) = (0.0, 0.0);
        for _ in 0..n {
            let k = (rng.next_f64() * n as f64) as usize;
            sa += a[k];
            sb += b[k];
        }
        rs.push(ratio(sa, sb));
    }
    rs.sort_by(|x, y| x.total_cmp(y));
    (point, rs[(reps as f64 * 0.025) as usize], rs[((reps as f64 * 0.975) as usize).min(reps - 1)])
}

/// 오라클 조준: 앞 절반 시드에서 팔·N 마다 평균 뒤집힘이 가장 큰 높이를 고르고, 뒤 절반 시드 결과를 돌려준다
pub struct ArmResult {
    pub arm: String,
    pub n: usize,
    pub h_best: f64,
    /// 보고 시드 결과 (시드 순)
    pub report: Vec<ShotResult>,
    pub select_mean: f64,
}

pub fn run_oracle(arms: &[Arm], ns: &[usize], cfg: &SpikeCfg, all: &mut Vec<ShotResult>) -> Vec<ArmResult> {
    let half = (cfg.seeds / 2).max(1);
    let mut specs = Vec::new();
    for (ai, a) in arms.iter().enumerate() {
        for &n in ns {
            for seed in 1..=cfg.seeds {
                let hh = nominal_height(n, seed);
                for &f in &cfg.hfrac {
                    let mut s = (a.make)(n, seed, hh * f);
                    s.tag = format!("{}|{}|{}|{:.3}", ai, n, seed, f);
                    specs.push(s);
                }
            }
        }
    }
    let res = run_batch(&specs, cfg.threads);
    all.extend(res.iter().cloned());
    let mut out = Vec::new();
    for (ai, a) in arms.iter().enumerate() {
        for &n in ns {
            let mut best = (f64::NEG_INFINITY, 0.0);
            for &f in &cfg.hfrac {
                let tag_end = format!("|{:.3}", f);
                let sel: Vec<&ShotResult> = res
                    .iter()
                    .filter(|r| r.tag.starts_with(&format!("{}|{}|", ai, n)) && r.tag.ends_with(&tag_end) && r.seed <= half)
                    .collect();
                let m = sel.iter().map(|r| r.flipped as f64).sum::<f64>() / sel.len().max(1) as f64;
                if m > best.0 {
                    best = (m, f);
                }
            }
            let tag_end = format!("|{:.3}", best.1);
            let mut rep: Vec<ShotResult> = res
                .iter()
                .filter(|r| r.tag.starts_with(&format!("{}|{}|", ai, n)) && r.tag.ends_with(&tag_end) && r.seed > half)
                .cloned()
                .collect();
            if rep.is_empty() {
                rep = res.iter().filter(|r| r.tag.starts_with(&format!("{}|{}|", ai, n)) && r.tag.ends_with(&tag_end)).cloned().collect();
            }
            rep.sort_by_key(|r| r.seed);
            out.push(ArmResult { arm: a.name.clone(), n, h_best: best.1, report: rep, select_mean: best.0 });
        }
    }
    out
}

fn mean(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len().max(1) as f64
}

fn summarize(r: &ArmResult) -> String {
    let fl: Vec<f64> = r.report.iter().map(|x| x.flipped as f64).collect();
    let p0 = r.report.iter().filter(|x| x.zero).count() as f64 / r.report.len().max(1) as f64;
    let outm = mean(&r.report.iter().map(|x| x.out as f64).collect::<Vec<_>>());
    let aud: u32 = r.report.iter().map(|x| x.audit.h1 + x.audit.h1_cavity + x.audit.h2 + x.audit.h2c + x.audit.h3 + x.audit.h4_nan).sum();
    let mut o = Obj::new();
    o.s("arm", &r.arm)
        .u("n", r.n as u64)
        .f("h_frac_best", r.h_best, 2)
        .f("select_mean", r.select_mean, 3)
        .u("report_shots", r.report.len() as u64)
        .f("mean_flipped", mean(&fl), 3)
        .f("p0", p0, 3)
        .f("mean_out", outm, 3)
        .u("audit_violations", aud as u64);
    o.end()
}

/// 스파이크 한 게이트. 반환 = (요약 JSON, 샷 전부)
pub fn spike(gate: &str, cfg: &SpikeCfg) -> Result<(String, Vec<ShotResult>), String> {
    let mut all = Vec::new();
    let mut lines: Vec<String> = Vec::new();
    let mut verdict = Obj::new();
    match gate {
        "S1" => {
            // 같은 최고 j, N ≥ 20: 푸어억 1.93 s 고정(쓸기 없음) / 최대 퍽 ≥ 1.15, 짝지은 CI 하한 > 1.0
            let ns = cfg.ns.clone().unwrap_or(vec![20, 30, 40]);
            let arms = vec![
                arm("puff_q1", |n, s, h| ShotSpec::new(n, s, Pose::Chin, BreathSpec::puff(1.0), 0.0, h)),
                arm("pueok_q1_1.93", |n, s, h| ShotSpec::new(n, s, Pose::Chin, BreathSpec::pueok(1.0, 1.93), 0.0, h)),
            ];
            let rs = run_oracle(&arms, &ns, cfg, &mut all);
            for r in &rs {
                lines.push(summarize(r));
            }
            let mut ok = true;
            for &n in &ns {
                let a: Vec<f64> = rs.iter().find(|r| r.arm == "puff_q1" && r.n == n).unwrap().report.iter().map(|x| x.flipped as f64).collect();
                let b: Vec<f64> = rs.iter().find(|r| r.arm == "pueok_q1_1.93" && r.n == n).unwrap().report.iter().map(|x| x.flipped as f64).collect();
                let (pt, lo, hi) = paired_ratio_ci(&a, &b, 2000);
                let pass = !pt.is_nan() && pt >= 1.15 && lo > 1.0;
                ok &= pass;
                let mut o = Obj::new();
                o.s("compare", "pueok/puff").u("n", n as u64).f("ratio", pt, 3).raw("ci95", &format!("[{},{}]", num(lo, 3), num(hi, 3))).b("pass", pass);
                lines.push(o.end());
            }
            verdict.b("pass", ok);
        }
        "S2" => {
            // 비용 ±10%, N 30~40: 푸어억(+쓸기) ≥ 최대 퍽 × 1.15 또는 P(0) ≤ 0.5배
            let ns = cfg.ns.clone().unwrap_or(vec![30, 40]);
            let c_ref = BreathProgram::build(&BreathSpec::puff(1.0).to_raw(Pose::Chin, 0.0, 0.5), SweepMode::Native, 1.0, 9.0).cost;
            let mut combos = Vec::new();
            for &q in &[0.85, 0.9, 0.95, 1.0] {
                for k in 0..14 {
                    let dur = 0.6 + 0.1 * k as f64;
                    let c = BreathProgram::build(&BreathSpec::pueok(q, dur).to_raw(Pose::Chin, 0.0, 0.5), SweepMode::Native, 1.0, 9.0).cost;
                    if (c - c_ref).abs() <= 0.1 * c_ref {
                        combos.push((q, dur, c));
                    }
                }
            }
            // 대표 셋: 비용 기준에 가장 가까운 q 별 하나
            let mut picks: Vec<(f64, f64, f64)> = Vec::new();
            for &q in &[0.85, 0.9, 0.95, 1.0] {
                if let Some(b) = combos.iter().filter(|c| c.0 == q).min_by(|a, b| (a.2 - c_ref).abs().partial_cmp(&(b.2 - c_ref).abs()).unwrap()) {
                    picks.push(*b);
                }
            }
            let mut arms = vec![arm("puff_q1", |n, s, h| ShotSpec::new(n, s, Pose::Chin, BreathSpec::puff(1.0), 0.0, h))];
            for &(q, dur, _) in &picks {
                for &sw in &[0.0, 9.0] {
                    arms.push(arm(&format!("pueok_q{q}_d{dur:.1}_sw{sw}"), move |n, s, h| {
                        ShotSpec::new(n, s, Pose::Chin, BreathSpec::pueok(q, dur).with_sweep(sw, 0.3), 0.0, h)
                    }));
                }
            }
            let rs = run_oracle(&arms, &ns, cfg, &mut all);
            for r in &rs {
                lines.push(summarize(r));
            }
            let mut o = Obj::new();
            o.f("cost_ref_puff_q1", c_ref, 3).raw(
                "pueok_combos",
                &arr(&picks.iter().map(|c| format!("{{\"q\":{},\"dur\":{:.1},\"cost\":{:.3}}}", c.0, c.1, c.2)).collect::<Vec<_>>()),
            );
            lines.push(o.end());
            let mut ok_any = false;
            for &n in &ns {
                let base = rs.iter().find(|r| r.arm == "puff_q1" && r.n == n).unwrap();
                let bm = mean(&base.report.iter().map(|x| x.flipped as f64).collect::<Vec<_>>());
                let bp0 = base.report.iter().filter(|x| x.zero).count() as f64 / base.report.len().max(1) as f64;
                for r in rs.iter().filter(|r| r.arm != "puff_q1" && r.n == n) {
                    let m = mean(&r.report.iter().map(|x| x.flipped as f64).collect::<Vec<_>>());
                    let p0 = r.report.iter().filter(|x| x.zero).count() as f64 / r.report.len().max(1) as f64;
                    let pass = (bm > 0.0 && m >= 1.15 * bm) || (bm == 0.0 && m > 0.0) || (bp0 > 0.0 && p0 <= 0.5 * bp0);
                    ok_any |= pass;
                    let mut o = Obj::new();
                    o.u("n", n as u64).s("arm", &r.arm).f("mean_ratio_vs_maxpuff", if bm > 0.0 { m / bm } else { f64::NAN }, 3).f("p0", p0, 3).f("p0_maxpuff", bp0, 3).b("pass", pass);
                    lines.push(o.end());
                }
            }
            verdict.b("pass_any_arm", ok_any);
        }
        "S3" => {
            // N 20~40, 사람 조준 분포(오라클 높이 + N(0, 0.15 u)), 쓸기 (a)(b)(c) × 속도. 최선/고정 ≥ 1.15, 너무 빠름 ≤ 고정, 퍽 효과 ≤ 5%
            let ns = cfg.ns.clone().unwrap_or(vec![20, 30, 40]);
            let rates = [0.0, 3.0, 6.0, 9.0, 13.0, 21.0, 26.0];
            let mut arms = Vec::new();
            for mode in [SweepMode::Native, SweepMode::Angle, SweepMode::Height] {
                for &r in &rates {
                    arms.push(arm(&format!("pueok_{}_{}", mode.name(), r), move |n, s, h| {
                        let mut sp = ShotSpec::new(n, s, Pose::Chin, BreathSpec::pueok(1.0, 1.93).with_sweep(r, 0.3), 0.0, human_h(h, s));
                        sp.mode = mode;
                        sp
                    }));
                }
            }
            for &r in &[0.0, 9.0] {
                arms.push(arm(&format!("puff_c_{}", r), move |n, s, h| ShotSpec::new(n, s, Pose::Chin, BreathSpec::puff(1.0).with_sweep(r, 0.0), 0.0, human_h(h, s))));
            }
            let rs = run_oracle(&arms, &ns, cfg, &mut all);
            for r in &rs {
                lines.push(summarize(r));
            }
            let mut ok = true;
            for &n in &ns {
                for mode in ["c", "a", "b"] {
                    let fixed = rs.iter().find(|r| r.arm == format!("pueok_{mode}_0") && r.n == n).unwrap();
                    let fa: Vec<f64> = fixed.report.iter().map(|x| x.flipped as f64).collect();
                    let mut best = (f64::NEG_INFINITY, 0.0, 0.0, 0.0);
                    for &rt in &rates[1..] {
                        let r = rs.iter().find(|r| r.arm == format!("pueok_{mode}_{rt}") && r.n == n).unwrap();
                        let fb: Vec<f64> = r.report.iter().map(|x| x.flipped as f64).collect();
                        let (pt, lo, _) = paired_ratio_ci(&fa, &fb, 2000);
                        if !pt.is_nan() && pt > best.0 {
                            best = (pt, lo, rt, 0.0);
                        }
                    }
                    let fast_rate = (best.2 * 2.0).min(26.0);
                    let fast = rs.iter().find(|r| r.arm == format!("pueok_{mode}_{}", nearest(&rates, fast_rate)) && r.n == n).unwrap();
                    let fm = mean(&fast.report.iter().map(|x| x.flipped as f64).collect::<Vec<_>>());
                    let pass = !best.0.is_nan() && best.0 >= 1.15 && best.1 > 1.0 && fm <= mean(&fa) + 1e-9;
                    if mode == "c" {
                        ok &= pass;
                    }
                    let mut o = Obj::new();
                    o.u("n", n as u64).s("mode", mode).f("best_rate", best.2, 1).f("best_over_fixed", best.0, 3).f("ci_lo", best.1, 3).f("too_fast_mean", fm, 3).f("fixed_mean", mean(&fa), 3).b("pass", pass);
                    lines.push(o.end());
                }
                let p0 = rs.iter().find(|r| r.arm == "puff_c_0" && r.n == n).unwrap();
                let p9 = rs.iter().find(|r| r.arm == "puff_c_9" && r.n == n).unwrap();
                let (pt, _, _) = paired_ratio_ci(
                    &p0.report.iter().map(|x| x.flipped as f64).collect::<Vec<_>>(),
                    &p9.report.iter().map(|x| x.flipped as f64).collect::<Vec<_>>(),
                    2000,
                );
                // 둘 다 0 이면 효과 없음(통과), 아니면 |비 − 1| ≤ 5%
                let pass = pt.is_nan() || (pt.is_finite() && (pt - 1.0).abs() <= 0.05);
                ok &= pass;
                let mut o = Obj::new();
                o.u("n", n as u64).s("check", "puff_sweep_effect").f("ratio", pt, 3).b("pass_le_5pct", pass);
                lines.push(o.end());
            }
            verdict.b("pass", ok);
        }
        "S4" => {
            // 책상 밑: s·0.89 > 높이면 0. o 0.30, N 4~8 에서 통째 성공 > 0, 성공의 ≥ 50% 에서 정점 ≥ 0.8 u
            let ns = cfg.ns.clone().unwrap_or(vec![4, 6, 8, 12, 16]);
            let insets = [0.5, 0.0, -0.15, -0.30, -0.45];
            let mut specs = Vec::new();
            for &n in &ns {
                for &s_in in &insets {
                    for seed in 1..=cfg.seeds {
                        let hh = nominal_height(n, seed);
                        for &q in &[0.6, 0.8, 1.0] {
                            for &f in &[0.0, 0.3, 0.6] {
                                let mut sp = ShotSpec::new(n, seed, Pose::Under, BreathSpec::puff(q), 0.0, hh * f);
                                sp.pile.inset = s_in;
                                sp.tag = format!("{n}|{s_in}|{q}|{f}");
                                specs.push(sp);
                            }
                        }
                    }
                }
            }
            let res = run_batch(&specs, cfg.threads);
            all.extend(res.iter().cloned());
            let mut u1_ok = true;
            let mut s4_ok = false;
            for &n in &ns {
                for &s_in in &insets {
                    let sel: Vec<&ShotResult> = res.iter().filter(|r| r.n == n && (r.inset - s_in).abs() < 1e-9).collect();
                    let hh = nominal_height(n, 1);
                    let m = mean(&sel.iter().map(|r| r.flipped as f64).collect::<Vec<_>>());
                    let whole: Vec<&&ShotResult> = sel.iter().filter(|r| r.whole).collect();
                    let apex_ok = whole.iter().filter(|r| r.apex_rise >= 0.8).count();
                    let hidden = s_in * 0.89 > hh;
                    if hidden && m > 0.0 {
                        u1_ok = false;
                    }
                    if (s_in + 0.30).abs() < 1e-9 && (4..=8).contains(&n) && !whole.is_empty() && apex_ok * 2 >= whole.len() {
                        s4_ok = true;
                    }
                    let avail = sel.iter().filter(|r| r.available).count();
                    let mut o = Obj::new();
                    o.u("n", n as u64)
                        .f("inset", s_in, 2)
                        .b("s089_gt_height", hidden)
                        .u("available_shots", avail as u64)
                        .u("shots", sel.len() as u64)
                        .f("mean_flipped", m, 3)
                        .f("p_whole", whole.len() as f64 / sel.len().max(1) as f64, 3)
                        .f("whole_apex_ge_0.8_frac", apex_ok as f64 / whole.len().max(1) as f64, 3)
                        .f("mean_out", mean(&sel.iter().map(|r| r.out as f64).collect::<Vec<_>>()), 3);
                    lines.push(o.end());
                }
            }
            verdict.b("u1_pass", u1_ok).b("s4_pass", s4_ok && u1_ok);
        }
        "S5" => {
            // N 10~60 평균 곡선 (턱 최대 퍽, 오라클 조준). N40 ≥ N20. kmax 모델 비교는 다음 단계(기록)
            let ns = cfg.ns.clone().unwrap_or(vec![10, 20, 30, 40, 50, 60]);
            let arms = vec![
                arm("puff_q1", |n, s, h| ShotSpec::new(n, s, Pose::Chin, BreathSpec::puff(1.0), 0.0, h)),
                arm("pueok_q1_1.93", |n, s, h| ShotSpec::new(n, s, Pose::Chin, BreathSpec::pueok(1.0, 1.93), 0.0, h)),
            ];
            let rs = run_oracle(&arms, &ns, cfg, &mut all);
            for r in &rs {
                lines.push(summarize(r));
            }
            let get = |a: &str, n: usize| rs.iter().find(|r| r.arm == a && r.n == n).map(|r| mean(&r.report.iter().map(|x| x.flipped as f64).collect::<Vec<_>>()));
            let ok = match (get("puff_q1", 40), get("puff_q1", 20)) {
                (Some(a), Some(b)) => a >= b,
                _ => true,
            };
            verdict.b("n40_ge_n20", ok).s("kmax_model", "미구현 — 다음 단계(기록만)");
        }
        "S6" => {
            // 학습자 봇(사람 잡음) 턱 퍽, N 30~46: 중앙값 ≥ 4, P(≥ 10) ≥ 15%
            let ns = cfg.ns.clone().unwrap_or(vec![30, 34, 38, 42, 46]);
            let mut specs = Vec::new();
            for &n in &ns {
                for seed in 1..=cfg.seeds {
                    let hh = nominal_height(n, seed);
                    let mut rng = Mulberry32::new(0xb07 ^ seed.wrapping_mul(2654435761) ^ n as u32);
                    // 봇 의도: 위에서 3장째(옛 공략) + 사람 잡음 σ_h 0.2 u, σ_lat 0.15, σ_q 0.08 (미검증 인구 모델)
                    let h = hh - 2.5 * 0.0516 + 0.2 * rng.gauss();
                    let lat = (0.15 * rng.gauss()).clamp(-0.9, 0.9);
                    let q = (0.9 + 0.08 * rng.gauss()).clamp(0.3, 1.0);
                    let mut sp = ShotSpec::new(n, seed, Pose::Chin, BreathSpec::puff(q), lat, h.max(0.02));
                    sp.tag = format!("S6|{n}");
                    specs.push(sp);
                }
            }
            let res = run_batch(&specs, cfg.threads);
            all.extend(res.iter().cloned());
            let mut fl: Vec<f64> = res.iter().map(|r| r.flipped as f64).collect();
            fl.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let med = if fl.is_empty() { 0.0 } else { fl[fl.len() / 2] };
            let p10 = fl.iter().filter(|&&x| x >= 10.0).count() as f64 / fl.len().max(1) as f64;
            for &n in &ns {
                let sel: Vec<f64> = res.iter().filter(|r| r.n == n).map(|r| r.flipped as f64).collect();
                let mut o = Obj::new();
                o.u("n", n as u64).u("shots", sel.len() as u64).f("mean_flipped", mean(&sel), 3);
                lines.push(o.end());
            }
            verdict.f("median", med, 1).f("p_ge_10", p10, 3).b("pass", med >= 4.0 && p10 >= 0.15).s(
                "baseline",
                if med >= 6.0 {
                    "P=46"
                } else if med >= 4.0 && p10 >= 0.15 {
                    "P=40"
                } else {
                    "P=30"
                },
            );
        }
        _ => return Err(format!("모르는 게이트 '{gate}' (S1..S6)")),
    }
    let shots = all.len();
    let aud: u32 = all.iter().map(|x| x.audit.h1 + x.audit.h1_cavity + x.audit.h2 + x.audit.h2c + x.audit.h3 + x.audit.h4_nan).sum();
    let cpu: f64 = all.iter().map(|x| x.cpu_ms).sum();
    verdict.u("shots", shots as u64).u("audit_violations_total", aud as u64).f("cpu_s", cpu / 1000.0, 1).u("seeds", cfg.seeds as u64);
    let mut o = Obj::new();
    o.s("gate", gate).raw("verdict", &verdict.end()).raw("rows", &arr(&lines));
    Ok((o.end(), all))
}

fn nearest(v: &[f64], x: f64) -> f64 {
    let mut b = v[0];
    for &y in v {
        if (y - x).abs() < (b - x).abs() {
            b = y;
        }
    }
    b
}

/// 사람 조준 분포: 의도 높이 + N(0, 0.15 u), 시드로 결정
fn human_h(h: f64, seed: u32) -> f64 {
    let mut r = Mulberry32::new(0x00a1_7e5d ^ seed.wrapping_mul(0x9e37_79b9));
    (h + 0.15 * r.gauss()).max(0.02)
}

/// Kind 이름
pub fn kind_name(k: Kind) -> &'static str {
    match k {
        Kind::Puff => "puff",
        Kind::Pueok => "pueok",
    }
}
