//! 샷 하나 = 더미(N·시드) + 자세 + 숨 프로그램 + 조준 → 뒤집힌 장수·원 밖·0장·감사 위반 (다음 단계가 쓰는 API).
//!
//! 흐름: 더미 생성 → 가라앉히기 → 사본 → (사본에서 새 월드) → 제트 동안 480 Hz × 3 (공력 매 바깥 스텝, 고정 지연 2스텝)
//!       → 제트 뒤 120 Hz × 12 (F6 정지 공기) → 판정 정지(최대 점 속력 < 0.05 u/s 가 0.25 s) → 판정.
//! 판정: 원 안(분필 원 r 3.2, 책상 위, y ≥ −1.2) + 그림 면 위(로컬 +y·세계 y > 0.2) = 뒤집힘.

use crate::aero::{Aero, AeroParams};
use crate::breath::{BreathProgram, BreathSpec, FlatEnd, FlatRel, FlatSpec, Kind, RawInput, JET_DT};
use crate::geom::{deg, V3};
use crate::jet::Jet;
use crate::json::Obj;
use crate::pile::{to_vec, PileParams, Rate, Sim, Snapshot, SolverCfg};
use crate::pose::{Pose, SweepMode};
use crate::units::{w_ref_sim, R};

pub const CIRCLE_R: f64 = 3.2;
pub const FALL_Y: f64 = -1.2;
pub const STILL_SPEED: f64 = 0.05;
pub const STILL_TIME: f64 = 0.25;

#[derive(Clone, Debug, PartialEq)]
pub struct ShotSpec {
    pub pile: PileParams,
    pub pose: Pose,
    pub breath: BreathSpec,
    /// 옆걸음 (u, ±0.95)
    pub lat: f64,
    /// 앞면 위 조준 높이 (u)
    pub h: f64,
    /// 진단용 쓸기 종류 (게임 = Native)
    pub mode: SweepMode,
    pub aero: AeroParams,
    pub solver: SolverCfg,
    /// 제트 고정 지연 (바깥 스텝)
    pub delay_steps: usize,
    pub audit: bool,
    /// 제트 뒤 최대 시간 (화면 초)
    pub max_after: f64,
    /// 스텝별 기록 (trace)
    pub trace: bool,
    /// 이름표 (실험 팔)
    pub tag: String,
    /// 평평한 바닥 측정 숨 (pose = flat 일 때만, 원시 입력 길 대신). None = 옛 길 그대로
    pub flat: Option<FlatSpec>,
    /// 평평한 바닥: 위·아래 절반 기울기 시계열을 결과에 싣는다 (1/60 s 간격, 1.2 s 까지)
    pub tilt_series: bool,
}

impl ShotSpec {
    pub fn new(n: usize, seed: u32, pose: Pose, breath: BreathSpec, lat: f64, h: f64) -> ShotSpec {
        ShotSpec {
            pile: PileParams::new(n, seed),
            pose,
            breath,
            lat,
            h,
            mode: SweepMode::Native,
            aero: AeroParams::default(),
            solver: SolverCfg::default(),
            delay_steps: 2,
            audit: true,
            max_after: 6.0,
            trace: false,
            tag: String::new(),
            flat: None,
            tilt_series: false,
        }
    }

    /// "n=40 seed=3 pose=chin breath=pueok q=1 dur=1.93 sweep=9 delay=0.3 mode=c h=0.8 lat=0 inset=8 ..." 꼴
    pub fn parse_kv(line: &str) -> Result<ShotSpec, String> {
        let mut s = ShotSpec::new(20, 1, Pose::Chin, BreathSpec::puff(1.0), 0.0, 0.5);
        let mut kind = Kind::Puff;
        let (mut q, mut dur, mut sweep, mut delay, mut smax) = (1.0, 1.93, 0.0, 0.0, 1.0);
        // 평평한 바닥 (pose=flat): rel=D|top, relx (top 일 때 도달 뒤 초, 0.04), off (0.04), w (°/s), t0, a=도|top, ax (top + 0.5°), area=pueok|puff
        let mut fl = FlatSpec::fixed(1.0, 0.6);
        let mut fl_rel_top = false;
        let mut fl_relx = 0.04;
        let mut fl_a_top = false;
        let mut fl_ax = 0.5;
        let mut fl_a = 0.0;
        // 조용히 무시되는 조합을 막기 위해 쓴 키를 모은다 (평평한 바닥 전용 / 원시 숨 전용)
        let mut flat_keys: Vec<String> = Vec::new();
        let mut raw_keys: Vec<String> = Vec::new();
        let (mut has_a, mut has_ax, mut has_relx) = (false, false, false);
        for tok in line.split_whitespace() {
            let (k, v) = tok.split_once('=').ok_or_else(|| format!("'{tok}' 는 key=value 가 아님"))?;
            match k {
                "rel" | "relx" | "off" | "w" | "t0" | "a" | "ax" | "area" | "tilt" => flat_keys.push(k.to_string()),
                "breath" | "kind" | "dur" | "sweep" | "delay" | "smax" => raw_keys.push(k.to_string()),
                _ => {}
            }
            match k {
                "a" => has_a = true,
                "ax" => has_ax = true,
                "relx" => has_relx = true,
                _ => {}
            }
            let num = || v.parse::<f64>().map_err(|_| format!("'{tok}' 값이 숫자가 아님"));
            match k {
                "n" => s.pile.n = num()? as usize,
                "seed" => s.pile.seed = num()? as u32,
                "sigma" | "sigma_s" => s.pile.sigma_s = num()?,
                "warp" | "warp_scale" => s.pile.warp_scale = num()?,
                "inset" | "s" => s.pile.inset = num()?,
                "fwarp" => {
                    // fwarp=curl:0.02:90  (종류:a:세계 방위°, 90 = 입 쪽)
                    let parts: Vec<&str> = v.split(':').collect();
                    if parts.len() != 3 {
                        return Err(format!("fwarp 는 종류:a:방위 ('{v}')"));
                    }
                    let k = match parts[0] {
                        "flat" => crate::pile::WarpKind::Flat,
                        "bend" => crate::pile::WarpKind::Bend,
                        "curl" => crate::pile::WarpKind::Curl,
                        "dish" => crate::pile::WarpKind::Dish,
                        _ => return Err(format!("모르는 휨 '{}'", parts[0])),
                    };
                    let a: f64 = parts[1].parse().map_err(|_| "fwarp a".to_string())?;
                    let az: f64 = parts[2].parse().map_err(|_| "fwarp az".to_string())?;
                    s.pile.force_warp = Some((k, a, az));
                }
                "ftop" => s.pile.force_top = num()? as usize,
                "pose" => s.pose = Pose::parse(v).ok_or_else(|| format!("모르는 자세 '{v}'"))?,
                "breath" | "kind" => {
                    kind = match v {
                        "puff" | "p" => Kind::Puff,
                        "pueok" | "long" | "l" => Kind::Pueok,
                        _ => return Err(format!("모르는 숨 '{v}'")),
                    }
                }
                "q" => q = num()?,
                "dur" => dur = num()?,
                "sweep" => sweep = num()?,
                "delay" => delay = num()?,
                "smax" => smax = num()?,
                "mode" => s.mode = SweepMode::parse(v).ok_or_else(|| format!("모르는 쓸기 '{v}'"))?,
                "h" => s.h = num()?,
                "lat" => s.lat = num()?,
                "cp0" => s.aero.cp0 = num()?,
                "cp_in" => s.aero.cp_in = num()?,
                "cd" => s.aero.cd_orifice = num()?,
                "f2" => {
                    // f2=1 충돌만 (옛 선택), f2=2 충돌 + 흡입 (§4.7 F2 전체)
                    let v = num()?;
                    s.aero.f2_impact = v > 0.5;
                    s.aero.f2_suction = v > 1.5;
                }
                "cs" => s.aero.cs = num()?,
                "edge" => s.aero.edge_inlet = num()? > 0.5,
                "audit" => s.audit = num()? > 0.5,
                "trace" => s.trace = num()? > 0.5,
                "max_after" => s.max_after = num()?,
                "mu_pp" => s.solver.mu_pp = num()?,
                "mu_pt" => s.solver.mu_pt = num()?,
                "pgs" => s.solver.pgs_iters = num()? as usize,
                "stab" => s.solver.stab_iters = num()? as usize,
                "solver" => {
                    s.solver = match v {
                        "1440" | "default" => SolverCfg::default(),
                        "1920" | "fallback" => SolverCfg::fallback_1920(),
                        _ => return Err(format!("모르는 solver '{v}' (1440|1920)")),
                    }
                }
                "tag" => s.tag = v.to_string(),
                "rel" => {
                    if v == "top" {
                        fl_rel_top = true;
                    } else {
                        fl.rel = FlatRel::At(num()?);
                    }
                }
                "relx" => fl_relx = num()?,
                "off" => fl.off = num()?,
                "w" => fl.w = num()?,
                "t0" => fl.t0 = num()?,
                "a" => {
                    if v == "top" {
                        fl_a_top = true;
                    } else {
                        fl_a = num()?;
                    }
                }
                "ax" => fl_ax = num()?,
                "area" => {
                    fl.area_puff = match v {
                        "puff" => true,
                        "pueok" => false,
                        _ => return Err(format!("모르는 area '{v}' (pueok|puff)")),
                    }
                }
                "tk" => s.pile.thick_scale = num()?,
                "mk" => s.pile.mass_scale = num()?,
                "tilt" => s.tilt_series = num()? > 0.5,
                _ => return Err(format!("모르는 키 '{k}'")),
            }
        }
        s.breath = BreathSpec { kind, q, dur, sweep_dps: sweep, sweep_delay: delay, sweep_max: smax };
        if s.pose != Pose::Flat && !flat_keys.is_empty() {
            return Err(format!("{} 는 pose=flat 전용 키 (지금 pose={})", flat_keys.join(","), s.pose.name()));
        }
        if s.pose == Pose::Flat {
            if !raw_keys.is_empty() {
                return Err(format!("pose=flat 은 원시 숨 키 {} 를 쓰지 않는다 (rel·w·t0·a 를 쓴다)", raw_keys.join(",")));
            }
            if fl.w > 0.0 && !has_a {
                return Err("pose=flat w>0 이면 a=도|top 가 있어야 한다 (없으면 쓸기 없이 돈다)".into());
            }
            if has_ax && !fl_a_top {
                return Err("ax 는 a=top 일 때만 쓴다".into());
            }
            if has_relx && !fl_rel_top {
                return Err("relx 는 rel=top 일 때만 쓴다".into());
            }
            fl.q = q;
            if fl_rel_top {
                fl.rel = FlatRel::Reach(fl_relx);
            }
            fl.end = if fl_a_top { FlatEnd::Top(fl_ax) } else { FlatEnd::Deg(fl_a) };
            s.flat = Some(fl);
        }
        Ok(s)
    }

    pub fn raw(&self) -> RawInput {
        self.breath.to_raw(self.pose, self.lat, self.h)
    }
}

#[derive(Clone, Debug, Default)]
pub struct Audit {
    pub h1: u32,
    pub h1_worst: f64,
    pub h1_cavity: u32,
    pub h2: u32,
    pub h2_worst: f64,
    /// H2c: 경계면별 공동 일 ≤ 들어오는 흐름의 압력 일 (스파이크 보강, README)
    pub h2c: u32,
    pub h2c_worst: f64,
    pub h3: u32,
    pub h4_nan: u32,
}

#[derive(Clone, Debug, Default)]
pub struct ShotResult {
    pub tag: String,
    pub n: usize,
    pub seed: u32,
    pub pose: String,
    pub kind: String,
    pub q: f64,
    pub dur: f64,
    pub sweep: f64,
    pub mode: String,
    pub lat: f64,
    pub h: f64,
    pub inset: f64,
    /// 판정
    pub flipped: usize,
    pub out: usize,
    pub zero: bool,
    pub whole: bool,
    /// 뒤집혀 원 밖 (무효)
    pub flipped_out: usize,
    /// 뒤집히지 않은 딱지 중 최대 수평 이동 (통째 미끄럼 판단)
    pub slide_max: f64,
    /// 뒤집힌 딱지의 최대 상승 (u)
    pub apex_rise: f64,
    /// 자세 사용 가능 (턱: s ≥ 3.6, 책상 밑: 입에서 앞면·밑면이 보임)
    pub available: bool,
    pub aim_clamped: bool,
    pub phi0_deg: f64,
    pub jet_deg0: f64,
    /// 쓸기가 해부 범위 끝에서 멈췄나, 숨 동안 최대 제트 각 (°)
    pub sweep_stop: bool,
    pub jet_deg_max: f64,
    pub j_peak: f64,
    pub cost: f64,
    pub vol_l: f64,
    pub audit: Audit,
    /// 공동 갱신 수, 최대 Π_c/Π_ext
    pub n_cavity: u64,
    pub max_pic_ratio: f64,
    /// 제트 동안 F1·F3 의 −z 성분, F4 위 성분 평균 (j 단위)
    pub mean_f1_push: f64,
    pub mean_f4_up: f64,
    pub steps_jet: u32,
    pub steps_after: u32,
    pub sim_time: f64,
    pub settle_steps: u32,
    pub nominal: f64,
    pub cpu_ms: f64,
    pub hash: u64,
    pub raw_bytes: usize,
    pub trace: Vec<String>,
    /// 평평한 바닥 측정 기록 (pose = flat 일 때만 JSON 에 실린다)
    pub flat: Option<FlatRecord>,
}

/// 평평한 바닥 측정 기록: 더미·고개 값 + 위·아래 절반 기울기 (v1 `tools/sweepmap.mjs shot` 의 halves()·tLift·tTop 과 같은 정의)
/// - 절반 기울기 = 그 절반(아래 = 번호 < ⌊N/2⌋, 위 = 나머지; 번호는 아래부터 쌓은 순서) 딱지의 '그림-아래에서 돈 각' acos(−u_y) 평균(°).
///   처음 그림-아래면 0°, 완전히 뒤집히면 180°. 빠진(책상 밖으로 떨어진) 딱지는 뺀다.
/// - 시각은 숨 시작(제트 명령 0) 기준 화면 초. 제트는 고정 지연 2스텝(1/240 s) 뒤에 켜진다.
#[derive(Clone, Debug, Default)]
pub struct FlatRecord {
    pub top: f64,
    pub alpha_top: f64,
    pub a_deg: f64,
    pub d: f64,
    pub t_reach: f64,
    /// 위 절반 평균 기울기가 처음 5°·10°·20° 를 넘은 시각 (−1 = 못 넘음)
    pub t5: f64,
    pub t10: f64,
    pub t20: f64,
    /// 맨 아래 딱지 기울기(수평면 기준) > 5° 시각 (v1 tLift)
    pub t_lift: f64,
    /// 위 절반 기울기 at 0.05·0.1·0.2·0.3·0.4 s
    pub tt_at: [f64; 5],
    pub max_tt: f64,
    pub max_tb: f64,
    pub end_tb: f64,
    /// 바람 축이 앞면에서 꼭대기를 아래 → 위로 넘은 시각과 그때 위 절반 기울기 (v1 tTop·ttAtTop)
    pub t_cross: f64,
    pub tt_at_cross: f64,
    /// 뒤집힘 ≥ 70% (v1 '통째')
    pub whole70: bool,
    /// (t, 아래, 위) 1/60 s 간격 (tilt=1 일 때만)
    pub series: Vec<(f64, f64, f64)>,
}

/// 절반 기울기 (아래, 위) °
fn halves(sim: &Sim, half: usize) -> (f64, f64) {
    let (mut sb, mut nb, mut st, mut nt) = (0.0f64, 0usize, 0.0f64, 0usize);
    for i in 0..sim.n() {
        if sim.discs[i].removed {
            continue;
        }
        let u = sim.rot(i).rotate(V3::Y);
        let a = deg(libm::acos((-u.y).clamp(-1.0, 1.0)));
        if i < half {
            sb += a;
            nb += 1;
        } else {
            st += a;
            nt += 1;
        }
    }
    (if nb > 0 { sb / nb as f64 } else { 0.0 }, if nt > 0 { st / nt as f64 } else { 0.0 })
}

/// 스텝마다 부르는 기울기 추적기 (읽기만 — 물리 상태를 바꾸지 않는다)
struct TiltTrack {
    half: usize,
    top0: f64,
    z_f: f64,
    below: bool,
    next_series: f64,
    rec: FlatRecord,
    want_series: bool,
}

impl TiltTrack {
    fn new(sim: &Sim, top0: f64, want_series: bool) -> Self {
        let rec = FlatRecord { t5: -1.0, t10: -1.0, t20: -1.0, t_lift: -1.0, tt_at: [-1.0; 5], t_cross: -1.0, tt_at_cross: -1.0, ..Default::default() };
        TiltTrack { half: sim.n() / 2, top0, z_f: sim.z_f, below: false, next_series: 0.0, rec, want_series }
    }
    /// 스텝 뒤. jet_md = 이번 스텝 제트의 (입, 방향) — 꼭대기 넘음 판정용 (제트 없으면 None)
    fn update(&mut self, sim: &Sim, jet_md: Option<(V3, V3)>) {
        let t = sim.time;
        let (tb, tt) = halves(sim, self.half);
        if let Some((m, d)) = jet_md {
            if self.rec.t_cross < 0.0 && d.z < -1e-6 {
                let s = (self.z_f - m.z) / d.z;
                if m.y + s * d.y <= self.top0 {
                    self.below = true;
                } else if self.below {
                    self.rec.t_cross = t;
                    self.rec.tt_at_cross = tt;
                }
            }
        }
        if !sim.discs[0].removed {
            let up = sim.rot(0).rotate(V3::Y);
            let tilt = deg(libm::acos(libm::fabs(up.y).min(1.0)));
            if self.rec.t_lift < 0.0 && tilt > 5.0 {
                self.rec.t_lift = t;
            }
        }
        for (th, slot) in [(5.0, 0usize), (10.0, 1), (20.0, 2)] {
            let v = match slot {
                0 => &mut self.rec.t5,
                1 => &mut self.rec.t10,
                _ => &mut self.rec.t20,
            };
            if *v < 0.0 && tt > th {
                *v = t;
            }
        }
        for (k, at) in [0.05, 0.1, 0.2, 0.3, 0.4].iter().enumerate() {
            if self.rec.tt_at[k] < 0.0 && t >= *at - 1e-9 {
                self.rec.tt_at[k] = tt;
            }
        }
        if tt > self.rec.max_tt {
            self.rec.max_tt = tt;
        }
        if tb > self.rec.max_tb {
            self.rec.max_tb = tb;
        }
        self.rec.end_tb = tb;
        if self.want_series && t >= self.next_series - 1e-9 && t <= 1.2 + 1e-9 {
            self.rec.series.push((t, tb, tt));
            self.next_series += 1.0 / 60.0;
        }
    }
}

impl ShotResult {
    pub fn to_json(&self) -> String {
        let mut o = Obj::new();
        if !self.tag.is_empty() {
            o.s("tag", &self.tag);
        }
        o.u("n", self.n as u64)
            .u("seed", self.seed as u64)
            .s("pose", &self.pose)
            .s("kind", &self.kind)
            .f("q", self.q, 3)
            .f("dur", self.dur, 3)
            .f("sweep", self.sweep, 2)
            .s("mode", &self.mode)
            .f("lat", self.lat, 3)
            .f("h", self.h, 3)
            .f("inset", self.inset, 3)
            .u("flipped", self.flipped as u64)
            .u("out", self.out as u64)
            .b("zero", self.zero)
            .b("whole", self.whole)
            .u("flipped_out", self.flipped_out as u64)
            .f("slide_max", self.slide_max, 3)
            .f("apex_rise", self.apex_rise, 3)
            .b("available", self.available)
            .b("aim_clamped", self.aim_clamped)
            .f("phi0_deg", self.phi0_deg, 2)
            .f("jet_deg0", self.jet_deg0, 2)
            .b("sweep_stop", self.sweep_stop)
            .f("jet_deg_max", self.jet_deg_max, 2)
            .f("j_peak", self.j_peak, 3)
            .f("cost", self.cost, 3)
            .f("vol_l", self.vol_l, 3);
        let a = &self.audit;
        let mut ao = Obj::new();
        ao.u("h1", a.h1 as u64)
            .f("h1_worst", a.h1_worst, 3)
            .u("h1_cavity", a.h1_cavity as u64)
            .u("h2", a.h2 as u64)
            .f("h2_worst", a.h2_worst, 4)
            .u("h2c", a.h2c as u64)
            .f("h2c_worst", a.h2c_worst, 4)
            .u("h3", a.h3 as u64)
            .u("h4_nan", a.h4_nan as u64)
            .u("total", (a.h1 + a.h1_cavity + a.h2 + a.h2c + a.h3 + a.h4_nan) as u64);
        o.raw("audit", &ao.end());
        o.u("n_cavity", self.n_cavity)
            .f("max_pic_ratio", self.max_pic_ratio, 3)
            .f("mean_f1_push_j", self.mean_f1_push, 3)
            .f("mean_f4_up_j", self.mean_f4_up, 3)
            .u("steps_jet", self.steps_jet as u64)
            .u("steps_after", self.steps_after as u64)
            .f("sim_time", self.sim_time, 3)
            .u("settle_steps", self.settle_steps as u64)
            .f("nominal", self.nominal, 4)
            .f("cpu_ms", self.cpu_ms, 1)
            .s("hash", &format!("{:016x}", self.hash))
            .u("raw_bytes", self.raw_bytes as u64);
        if let Some(f) = &self.flat {
            let mut fo = Obj::new();
            fo.f("top", f.top, 4)
                .f("alpha_top", f.alpha_top, 3)
                .f("a", f.a_deg, 3)
                .f("d", f.d, 4)
                .f("t_reach", f.t_reach, 4)
                .f("t5", f.t5, 4)
                .f("t10", f.t10, 4)
                .f("t20", f.t20, 4)
                .f("t_lift", f.t_lift, 4)
                .raw("tt_at", &format!("[{}]", f.tt_at.iter().map(|v| format!("{:.2}", v)).collect::<Vec<_>>().join(",")))
                .f("max_tt", f.max_tt, 2)
                .f("max_tb", f.max_tb, 2)
                .f("end_tb", f.end_tb, 2)
                .f("t_cross", f.t_cross, 4)
                .f("tt_at_cross", f.tt_at_cross, 2)
                .b("whole70", f.whole70);
            if !f.series.is_empty() {
                fo.raw("series", &format!("[{}]", f.series.iter().map(|(t, b, u)| format!("[{:.4},{:.2},{:.2}]", t, b, u)).collect::<Vec<_>>().join(",")));
            }
            o.raw("flat", &fo.end());
        }
        o.end()
    }
}

/// 더미를 만들고 가라앉혀 사본으로
pub fn settle_pile(p: &PileParams, cfg: SolverCfg) -> Snapshot {
    let mut sim = Sim::build(p, cfg);
    let steps = sim.settle(1.0, 4.0, 0.005);
    sim.snapshot(steps)
}

/// 책상 밑 자세 사용 가능: 입(기본 위치)에서 더미 앞면이나 밑면의 일부가 책상에 가리지 않고 보이는가 (D9, 기하적 가시성)
fn under_available(sim: &Sim, lat: f64, height: f64) -> bool {
    let m = V3::new(lat, crate::pose::UNDER_Y, sim.desk.z_e + crate::pose::UNDER_FWD);
    let mut pts = Vec::new();
    for k in 0..=20 {
        let y = height * k as f64 / 20.0;
        pts.push(V3::new(lat, y, sim.z_f + 1e-3));
    }
    // 돌출 밑면
    for k in 0..=10 {
        let z = sim.z_f - 2.0 * R * k as f64 / 10.0;
        pts.push(V3::new(lat, -1e-3, z));
    }
    for p in pts {
        if p.y < 0.0 && sim.desk.over(p.x, p.z) {
            continue; // 책상 속
        }
        let dv = p - m;
        let l = dv.len();
        let d = dv * (1.0 / l);
        match crate::geom::ray_box(m, d, sim.desk.lo, sim.desk.hi, l - 1e-6) {
            Some(t) if t < l - 1e-6 => {}
            _ => return true,
        }
    }
    false
}

/// 샷 하나 (사본에서)
pub fn run_shot_from(snap: &Snapshot, spec: &ShotSpec) -> ShotResult {
    let t0 = std::time::Instant::now();
    let mut sim = Sim::restore(snap);
    let n = sim.n();
    let raw = spec.raw();
    let top0 = sim.column_top();
    let prog = match &spec.flat {
        Some(fs) => BreathProgram::build_flat(fs, spec.mode, spec.lat, sim.z_f, sim.desk.z_e, top0),
        None => BreathProgram::build(&raw, spec.mode, sim.z_f, sim.desk.z_e),
    };
    let mut res = ShotResult {
        tag: spec.tag.clone(),
        n,
        seed: spec.pile.seed,
        pose: spec.pose.name().into(),
        kind: match (&spec.flat, spec.breath.kind) {
            (Some(_), _) => "rel".into(),
            (None, Kind::Puff) => "puff".into(),
            (None, Kind::Pueok) => "pueok".into(),
        },
        q: spec.flat.map(|f| f.q).unwrap_or(spec.breath.q),
        dur: if spec.flat.is_some() || spec.breath.kind == Kind::Pueok { prog.t_stop } else { 0.0 },
        sweep: spec.flat.map(|f| f.w).unwrap_or(spec.breath.sweep_dps),
        mode: spec.mode.name().into(),
        lat: raw.lat(),
        h: raw.h(),
        inset: spec.pile.inset,
        aim_clamped: prog.rig.aim_clamped,
        phi0_deg: deg(prog.rig.phi0),
        jet_deg0: prog.rig.jet_deg0(),
        sweep_stop: prog.sweep_stopped,
        jet_deg_max: prog.jet_deg_max,
        j_peak: prog.j_peak,
        cost: prog.cost,
        vol_l: prog.vol_l,
        settle_steps: snap.settle_steps,
        nominal: snap.nominal(),
        raw_bytes: raw.to_bytes().len(),
        ..Default::default()
    };
    let height = top0;
    res.available = match spec.pose {
        Pose::Chin => spec.pile.inset >= crate::pose::CHIN_FWD,
        Pose::Eye | Pose::Flat => true,
        Pose::Under => under_available(&sim, raw.lat(), height),
    };
    let mut tilt = if spec.flat.is_some() { Some(TiltTrack::new(&sim, top0, spec.tilt_series)) } else { None };
    let start: Vec<V3> = (0..n).map(|i| sim.pos(i)).collect();
    let mut apex: Vec<f64> = start.iter().map(|p| p.y).collect();
    let mut aero = Aero::new(spec.aero);
    aero.audit = spec.audit;
    let wref = w_ref_sim();

    // ── 제트 구간: 480 Hz × 3, 매 바깥 스텝 공력 ──
    sim.set_rate(Rate::Jet480);
    let jet_steps = prog.samples.len() + spec.delay_steps;
    let mut work = vec![0.0f64; n];
    let mut ke = vec![0.0f64; n];
    let mut work_cav = vec![0.0f64; n];
    let mut budget_cav = vec![0.0f64; n];
    let (mut sum_push, mut sum_up, mut cnt_on) = (0.0f64, 0.0f64, 0u32);
    for k in 0..jet_steps {
        let jet = if k >= spec.delay_steps { Jet::from_sample(&prog.samples[k - spec.delay_steps]) } else { None };
        let (_fr, _ci) = aero.compute(&sim, jet.as_ref());
        let ci = &_ci;
        apply(&mut sim, &aero.out.force, &aero.out.torque, wref * 1e-6);
        if let Some(j) = jet.as_ref() {
            cnt_on += 1;
            let jf = j.j_force();
            sum_push += -(aero.out.sum_f1.z + aero.out.sum_f3.z) / wref;
            sum_up += aero.out.sum_f4_up / wref;
            // H1: 덩어리별 외부형 힘 ≤ 1.3 × 가로챈 J (+ 묶음 양자화 여유 0.02 J + 바닥 0.01 W_ref)
            if spec.audit {
                let mut fsum: Vec<V3> = vec![V3::ZERO; n];
                let mut jsum = vec![0.0f64; n];
                for i in 0..n {
                    let c = ci.comp[i];
                    fsum[c] += aero.out.f_ext[i];
                    jsum[c] += aero.out.j_int[i];
                }
                for c in 0..n {
                    let fe = fsum[c].len();
                    if fe <= 0.0 {
                        continue;
                    }
                    if fe > 1.3 * jsum[c] + 0.02 * jf + 0.01 * wref {
                        res.audit.h1 += 1;
                        if std::env::var("PUFF_DEBUG_H1").is_ok() {
                            let members: Vec<String> = (0..n)
                                .filter(|&i| ci.comp[i] == c)
                                .map(|i| {
                                    let fe = aero.out.f_ext[i];
                                    format!(
                                        "{i}{}:F=({:.2},{:.2},{:.2})J_int={:.2} y={:.2} up.y={:.2}",
                                        if ci.airborne[i] { "A" } else { "" },
                                        fe.x / wref,
                                        fe.y / wref,
                                        fe.z / wref,
                                        aero.out.j_int[i] / wref,
                                        sim.pos(i).y,
                                        sim.rot(i).rotate(V3::Y).y
                                    )
                                })
                                .collect();
                            eprintln!("H1 k={k} comp={c} |F|={:.2}W J_int={:.2}W J={:.2}W :: {}", fe / wref, jsum[c] / wref, jf / wref, members.join(" "));
                        }
                    }
                    if jsum[c] > 0.05 * jf {
                        let r = fe / jsum[c];
                        if r > res.audit.h1_worst {
                            res.audit.h1_worst = r;
                        }
                    }
                }
                res.audit.h1_cavity += aero.out.cavity_violations;
            }
            for i in 0..n {
                work[i] += aero.out.power[i] * JET_DT;
                ke[i] += aero.out.ke_int[i] * JET_DT;
                work_cav[i] += aero.out.power_cav[i] * JET_DT;
                budget_cav[i] += aero.out.cav_budget[i] * JET_DT;
            }
        }
        res.n_cavity += aero.out.n_cavity as u64;
        if aero.out.max_pic_over_ext > res.max_pic_ratio {
            res.max_pic_ratio = aero.out.max_pic_over_ext;
        }
        res.audit.h3 += aero.out.h3_violations;
        res.audit.h4_nan += aero.out.nan;
        sim.step();
        track(&sim, &mut apex);
        if let Some(tk) = tilt.as_mut() {
            tk.update(&sim, jet.as_ref().map(|j| (j.m, j.d)));
        }
        if spec.trace {
            let jj = jet.as_ref().map(|j| j.j).unwrap_or(0.0);
            let (mut rise, mut tilt, mut air) = (0.0f64, 0.0f64, 0u32);
            for i in 0..n {
                if sim.discs[i].removed {
                    continue;
                }
                let dy = sim.pos(i).y - start[i].y;
                if dy > rise {
                    rise = dy;
                }
                let t = 1.0 - libm::fabs(sim.rot(i).rotate(V3::Y).y);
                if t > tilt {
                    tilt = t;
                }
                if _ci.airborne[i] {
                    air += 1;
                }
            }
            res.trace.push(format!(
                "{{\"t\":{:.4},\"j\":{:.3},\"f1z\":{:.3},\"f3\":[{:.3},{:.3}],\"f4y\":{:.3},\"pic\":{:.3},\"vmax\":{:.3},\"rise\":{:.4},\"tilt\":{:.4},\"air\":{}}}",
                sim.time,
                jj,
                aero.out.sum_f1.z / wref,
                aero.out.sum_f3.y / wref,
                aero.out.sum_f3.z / wref,
                aero.out.sum_f4_up / wref,
                aero.out.max_pic_over_ext,
                sim.max_speed(),
                rise,
                tilt,
                air
            ));
        }
    }
    res.steps_jet = jet_steps as u32;
    if cnt_on > 0 {
        res.mean_f1_push = sum_push / cnt_on as f64;
        res.mean_f4_up = sum_up / cnt_on as f64;
    }
    // H2: 숨 하나 동안 딱지별 공력 일 ≤ 0.6 × 가로챈 제트 운동에너지 (+ 여유 W_ref·0.01 u)
    if spec.audit {
        for i in 0..n {
            if work[i] > 0.6 * ke[i] + wref * 0.01 {
                res.audit.h2 += 1;
            }
            if ke[i] > wref * 0.01 {
                let r = work[i] / ke[i];
                if r > res.audit.h2_worst {
                    res.audit.h2_worst = r;
                }
            }
            if work_cav[i] > budget_cav[i] + wref * 0.01 {
                res.audit.h2c += 1;
            }
            if budget_cav[i] > wref * 0.01 {
                let r = work_cav[i] / budget_cav[i];
                if r > res.audit.h2c_worst {
                    res.audit.h2c_worst = r;
                }
            }
        }
    }

    // ── 제트 뒤: 120 Hz × 12, F6 정지 공기 ──
    sim.set_rate(Rate::Rest120);
    let dt = Rate::Rest120.dt();
    let max_steps = libm::ceil(spec.max_after / dt) as u32;
    let need = libm::ceil(STILL_TIME / dt) as u32;
    let mut quiet = 0u32;
    let mut k = 0u32;
    while k < max_steps {
        aero.compute(&sim, None);
        res.audit.h3 += aero.out.h3_violations;
        res.audit.h4_nan += aero.out.nan;
        apply(&mut sim, &aero.out.force, &aero.out.torque, wref * 1e-6);
        sim.step();
        track(&sim, &mut apex);
        if let Some(tk) = tilt.as_mut() {
            tk.update(&sim, None);
        }
        k += 1;
        if sim.max_speed() < STILL_SPEED {
            quiet += 1;
        } else {
            quiet = 0;
        }
        if quiet >= need {
            break;
        }
    }
    res.steps_after = k;
    res.sim_time = sim.time;
    // NaN 위치 (H4)
    for i in 0..n {
        if !sim.discs[i].removed && !sim.pos(i).is_finite() {
            res.audit.h4_nan += 1;
        }
    }
    // ── 판정 ──
    let (cx, cz) = sim.center;
    for i in 0..n {
        let out = if sim.discs[i].removed {
            true
        } else {
            let p = sim.pos(i);
            let dh = libm::sqrt((p.x - cx) * (p.x - cx) + (p.z - cz) * (p.z - cz));
            p.y < FALL_Y || dh > CIRCLE_R || !sim.desk.over(p.x, p.z)
        };
        let up = !sim.discs[i].removed && sim.face_up(i) > 0.2;
        if out {
            res.out += 1;
            if up {
                res.flipped_out += 1;
            }
        } else if up {
            res.flipped += 1;
            let rise = apex[i] - start[i].y;
            if rise > res.apex_rise {
                res.apex_rise = rise;
            }
        } else {
            let p = sim.pos(i);
            let s = libm::sqrt((p.x - start[i].x) * (p.x - start[i].x) + (p.z - start[i].z) * (p.z - start[i].z));
            if s > res.slide_max {
                res.slide_max = s;
            }
        }
    }
    res.zero = res.flipped == 0;
    res.whole = res.flipped == n;
    if let (Some(tk), Some(fr)) = (tilt, prog.flat) {
        let mut rec = tk.rec;
        rec.top = fr.top;
        rec.alpha_top = fr.alpha_top;
        rec.a_deg = fr.a_deg;
        rec.d = fr.d;
        rec.t_reach = fr.t_reach;
        rec.whole70 = res.flipped as f64 >= 0.7 * n as f64;
        res.flat = Some(rec);
    }
    res.hash = sim.state_hash() ^ (res.flipped as u64) << 56 ^ (res.out as u64) << 48;
    res.cpu_ms = t0.elapsed().as_secs_f64() * 1000.0;
    res
}

fn track(sim: &Sim, apex: &mut [f64]) {
    for i in 0..sim.n() {
        if sim.discs[i].removed {
            continue;
        }
        let y = sim.pos(i).y;
        if y > apex[i] {
            apex[i] = y;
        }
    }
}

/// 힘·토크 적용: reset 후 꼬리 컷(|F| < fmin 이고 |τ| 작음)이면 깨우지 않는다
fn apply(sim: &mut Sim, f: &[V3], t: &[V3], fmin: f64) {
    for i in 0..sim.n() {
        if sim.discs[i].removed {
            continue;
        }
        let b = &mut sim.world.bodies[sim.discs[i].body];
        b.reset_forces(false);
        b.reset_torques(false);
        if f[i].len() < fmin && t[i].len() < fmin {
            continue;
        }
        b.add_force(to_vec(f[i]), true);
        b.add_torque(to_vec(t[i]), true);
    }
}

/// 샷 하나 (더미부터)
pub fn run_shot(spec: &ShotSpec) -> ShotResult {
    let snap = settle_pile(&spec.pile, spec.solver);
    run_shot_from(&snap, spec)
}

/// 여러 샷: 같은 더미(같은 열쇠)끼리 묶어 한 번만 가라앉히고, 묶음을 최대 `threads` 개 스레드에 나눈다. 결과는 입력 순서
pub fn run_batch(specs: &[ShotSpec], threads: usize) -> Vec<ShotResult> {
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;
    let mut groups: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (i, s) in specs.iter().enumerate() {
        let key = format!("{}|{:?}", s.pile.key(), s.solver);
        groups.entry(key).or_default().push(i);
    }
    let groups: Vec<Vec<usize>> = groups.into_values().collect();
    let next = AtomicUsize::new(0);
    let out: Mutex<Vec<Option<ShotResult>>> = Mutex::new(vec![None; specs.len()]);
    let th = threads.clamp(1, 3);
    std::thread::scope(|sc| {
        for _ in 0..th {
            sc.spawn(|| loop {
                let g = next.fetch_add(1, Ordering::SeqCst);
                if g >= groups.len() {
                    break;
                }
                let idx = &groups[g];
                let snap = settle_pile(&specs[idx[0]].pile, specs[idx[0]].solver);
                for &i in idx {
                    let r = run_shot_from(&snap, &specs[i]);
                    out.lock().unwrap()[i] = Some(r);
                }
            });
        }
    });
    out.into_inner().unwrap().into_iter().map(|r| r.unwrap()).collect()
}
