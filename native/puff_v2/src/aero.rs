//! 공력 (D7·D9·D15, §4.7·§4.8). 이 모듈은 난수를 쓰지 않는다(H4). 계산은 f64 + libm, rapier 로 넘길 때만 f32.
//!
//! 힘 항 (스파이크 범위 §7.2):
//! - **F1 옆면**: 딱지 테두리 띠 방위 24칸, 입에서 보이는 칸만. 벽 압력 법칙, 안쪽으로. 넓이 = 호 × 콜라이더 두께.
//! - **F3 노출 밑면**: 아래를 향한 면의 표본(해바라기 128점) 중 받침 접촉 영역(F4 몫)이 아니고 아래 틈 > 0.004 u 이며
//!   입에서 보이는 점. 벽 압력 법칙, 면 바깥 법선의 반대(위로).
//! - **F4 틈 공동**: 접촉 중인 (위 장, 받침) 경계면. 노드 24개 틈 g_k = g_rb,k + δ_i + (a_s − δ_s) + g₀ (휨 = 가상 기하),
//!   입구 Π_ext,k = Cp_in·Π_wall(P_k) (입구 보임은 가상 기하: 두 장 자신은 가리지 않음), [`cavity::solve`] 로 Π_c,
//!   위 장에 +Π_c·A'_open (열린 영역 중심에), 받침에 반대.
//! - **F6 비행 항력**: 접촉 중 = 정지 공기(v_rel = v), 공중(접촉 0) = v − u_air 이고 F1~F4 끔. 법선 Cd 1.17, 접선 0.03,
//!   압력 중심 e_cp = 0.5R(1 − α/90°) 앞, 회전 저항 C_ω 0.20.
//! - (선택, 기본 끔) F2 윗면 충돌 몫(벽 법칙, 아래로) — 스파이크 범위 밖이라 `f2_impact` 로만 켠다.
//! - 벽면 제트·F5 전단·윗면 흡입·코안다: 없음.
//!
//! 힘 = Π·A'·W_ref (자기 질량이 아님). 가림은 해석적 광선(원기둥·상자), parry 금지(§4.8). 꼬리 컷: Π < Π_min 이면
//! 힘도 걸지 않고 깨우지도 않는다. 제트 원뿔(r ≤ 3r½) 밖 딱지는 가리개 후보에서 뺀다(표적까지의 선분은 원뿔 안에 있다).

use crate::cavity::{self, CavityParams, Node};
use crate::geom::{ray_box, ray_cyl_local, vogel, Qt, V3};
use crate::jet::{Jet, ETA_CUT, X_MAX};
use crate::pile::{Desk, DiscProps, Sim};
use crate::units::{kappa, w_ref_sim, R};

/// 손잡이 (§4.11 범위 안)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AeroParams {
    pub cp0: f64,
    pub cp_in: f64,
    pub cd_orifice: f64,
    pub cd_n: f64,
    pub c_t: f64,
    pub c_omega: f64,
    pub n_rim: usize,
    pub n_face: usize,
    /// 입구·면 표본을 표면 밖으로 내는 ε (u)
    pub eps: f64,
    /// 틈 바닥 g₀ (u)
    pub g0: f64,
    /// 접촉으로 보는 틈 (u)
    pub gap_contact: f64,
    /// 틈 상한 (넘으면 활짝 열림)
    pub g_cap: f64,
    /// 꼬리 컷 Π_min
    pub pi_min: f64,
    /// F2 윗면 충돌 몫 (스파이크 범위 밖, 기본 끔)
    pub f2_impact: bool,
    /// F4 통로 길이 (u)
    pub l_ch: f64,
    /// 감사 광선 묶음 (고리 × 부채꼴)
    pub audit_rings: usize,
    pub audit_sectors: usize,
}

impl Default for AeroParams {
    fn default() -> Self {
        Self {
            cp0: 1.0,
            cp_in: 0.8,
            cd_orifice: 0.6,
            cd_n: 1.17,
            c_t: 0.03,
            c_omega: 0.20,
            n_rim: 24,
            n_face: 128,
            eps: 0.002,
            g0: 0.002,
            gap_contact: 0.004,
            g_cap: 0.25,
            pi_min: 0.01,
            f2_impact: false,
            l_ch: 0.5,
            audit_rings: 12,
            audit_sectors: 24,
        }
    }
}

/// 한 공력 갱신에서 쓰는 딱지 자세
#[derive(Clone, Copy, Debug)]
pub struct DiscFrame {
    pub live: bool,
    pub c: V3,
    pub q: Qt,
    pub lx: V3,
    pub ly: V3,
    pub lz: V3,
    /// 위를 향한 면 법선 (ly 또는 −ly)
    pub up: V3,
    pub h: f64,
    pub rb: f64,
    pub v: V3,
    pub w: V3,
    /// 휨이 세계 위로 들려 있나 (휨은 로컬 −y 쪽으로 정의: 처음 그림-아래 자세에서 위)
    pub warp_up: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Support {
    None,
    Desk,
    Disc(usize),
}

/// 접촉 그래프 (id 순으로 정렬해 순회)
#[derive(Clone, Debug, Default)]
pub struct ContactInfo {
    pub partners: Vec<Vec<usize>>,
    pub on_desk: Vec<bool>,
    pub airborne: Vec<bool>,
    pub support: Vec<Support>,
    pub comp: Vec<usize>,
}

pub fn frames(sim: &Sim) -> Vec<DiscFrame> {
    let mut out = Vec::with_capacity(sim.n());
    for i in 0..sim.n() {
        let pr = &sim.props[i];
        if sim.discs[i].removed {
            out.push(DiscFrame {
                live: false,
                c: V3::ZERO,
                q: Qt::ID,
                lx: V3::ZERO,
                ly: V3::ZERO,
                lz: V3::ZERO,
                up: V3::Y,
                h: pr.h,
                rb: 0.0,
                v: V3::ZERO,
                w: V3::ZERO,
                warp_up: true,
            });
            continue;
        }
        let q = sim.rot(i);
        let ly = q.rotate(V3::Y);
        let up = if ly.y >= 0.0 { ly } else { -ly };
        out.push(DiscFrame {
            live: true,
            c: sim.pos(i),
            q,
            lx: q.rotate(V3::new(1.0, 0.0, 0.0)),
            ly,
            lz: q.rotate(V3::new(0.0, 0.0, 1.0)),
            up,
            h: pr.h,
            rb: libm::sqrt(R * R + 0.25 * pr.h * pr.h),
            v: sim.linvel(i),
            w: sim.angvel(i),
            // 휨 방향 = 로컬 −y. 세계 위(up 쪽)와 같은 쪽이면 테두리가 위로 들림
            warp_up: (-ly).dot(up) > 0.0,
        });
    }
    out
}

/// 접촉 정보: rapier 좁은 단계의 활성 접촉쌍 → 짝·책상·공중·받침·덩어리
pub fn contacts(sim: &Sim, fr: &[DiscFrame]) -> ContactInfo {
    let n = sim.n();
    // 콜라이더 원시 인덱스 → 딱지 번호
    let mut maxi = 0u32;
    for d in &sim.discs {
        let (ix, _) = d.collider.into_raw_parts();
        if ix > maxi {
            maxi = ix;
        }
    }
    let mut map: Vec<i64> = vec![-1; maxi as usize + 1];
    for (i, d) in sim.discs.iter().enumerate() {
        if !d.removed {
            map[d.collider.into_raw_parts().0 as usize] = i as i64;
        }
    }
    let desk_ix = sim.desk_collider.into_raw_parts();
    let mut ci = ContactInfo {
        partners: vec![Vec::new(); n],
        on_desk: vec![false; n],
        airborne: vec![true; n],
        support: vec![Support::None; n],
        comp: (0..n).collect(),
    };
    for i in 0..n {
        if sim.discs[i].removed {
            continue;
        }
        let ch = sim.discs[i].collider;
        for pair in sim.world.narrow_phase.contact_pairs_with(ch) {
            if !pair.has_any_active_contact() {
                continue;
            }
            let other = if pair.collider1 == ch { pair.collider2 } else { pair.collider1 };
            let raw = other.into_raw_parts();
            if raw == desk_ix {
                ci.on_desk[i] = true;
            } else if (raw.0 as usize) < map.len() {
                let j = map[raw.0 as usize];
                if j >= 0 {
                    ci.partners[i].push(j as usize);
                }
            }
        }
        ci.partners[i].sort_unstable();
        ci.partners[i].dedup();
        ci.airborne[i] = ci.partners[i].is_empty() && !ci.on_desk[i];
    }
    // 받침: 아래에 있는 짝 중 수평으로 가장 가까운 것, 없으면 책상
    for i in 0..n {
        if !fr[i].live || ci.airborne[i] {
            continue;
        }
        let f = &fr[i];
        let mut best: Option<(f64, usize)> = None;
        for &j in &ci.partners[i] {
            let rel = fr[j].c - f.c;
            let vv = rel.dot(f.up);
            if vv < -0.25 * (f.h + fr[j].h) {
                let hd = (rel - f.up * vv).len();
                if best.map_or(true, |(b, _)| hd < b) {
                    best = Some((hd, j));
                }
            }
        }
        ci.support[i] = match best {
            Some((_, j)) => Support::Disc(j),
            None if ci.on_desk[i] => Support::Desk,
            None => Support::None,
        };
    }
    // 덩어리 = 딱지-딱지 접촉 연결 성분 (union-find, 작은 번호가 대표)
    fn find(p: &mut [usize], mut x: usize) -> usize {
        while p[x] != x {
            p[x] = p[p[x]];
            x = p[x];
        }
        x
    }
    let mut par: Vec<usize> = (0..n).collect();
    for i in 0..n {
        for &j in &ci.partners[i].clone() {
            let (a, b) = (find(&mut par, i), find(&mut par, j));
            if a != b {
                let (lo, hi) = if a < b { (a, b) } else { (b, a) };
                par[hi] = lo;
            }
        }
    }
    for i in 0..n {
        ci.comp[i] = find(&mut par, i);
    }
    ci
}

/// 한 갱신의 결과
#[derive(Clone, Debug, Default)]
pub struct AeroOut {
    /// 딱지별 총 힘·토크 (시뮬 단위, 중심 기준)
    pub force: Vec<V3>,
    pub torque: Vec<V3>,
    /// 외부형(F1·F2·F3) 합 (H1)
    pub f_ext: Vec<V3>,
    /// 외부형 공력 일률 Σ F·v(P) (F1·F3·F2, 제트 속 공중 F6) — H2
    pub power: Vec<f64>,
    /// 공동(F4) 일률: 경계면 주인(위 장 i)에게 위 장 + 받침 몫을 합쳐서 — H2c
    pub power_cav: Vec<f64>,
    /// 공동 에너지 예산: 들어오는 흐름의 압력 일률 (시뮬 일률 단위) — H2c
    pub cav_budget: Vec<f64>,
    /// 감사 묶음으로 잰 딱지별 가로챈 운동량(힘)·운동에너지 플럭스
    pub j_int: Vec<f64>,
    pub ke_int: Vec<f64>,
    /// 진단
    pub n_rays: u64,
    pub n_cavity: u32,
    pub max_pic_over_ext: f64,
    pub cavity_violations: u32,
    pub nan: u32,
    pub h3_violations: u32,
    pub sum_f1: V3,
    pub sum_f3: V3,
    pub sum_f4_up: f64,
}

impl AeroOut {
    fn reset(&mut self, n: usize) {
        self.force.clear();
        self.force.resize(n, V3::ZERO);
        self.torque.clear();
        self.torque.resize(n, V3::ZERO);
        self.f_ext.clear();
        self.f_ext.resize(n, V3::ZERO);
        self.power.clear();
        self.power.resize(n, 0.0);
        self.power_cav.clear();
        self.power_cav.resize(n, 0.0);
        self.cav_budget.clear();
        self.cav_budget.resize(n, 0.0);
        self.j_int.clear();
        self.j_int.resize(n, 0.0);
        self.ke_int.clear();
        self.ke_int.resize(n, 0.0);
        self.n_rays = 0;
        self.n_cavity = 0;
        self.max_pic_over_ext = 0.0;
        self.cavity_violations = 0;
        self.nan = 0;
        self.h3_violations = 0;
        self.sum_f1 = V3::ZERO;
        self.sum_f3 = V3::ZERO;
        self.sum_f4_up = 0.0;
    }
}

pub struct Aero {
    pub p: AeroParams,
    face: Vec<(f64, f64)>,
    /// 감사 광선 (η, ψ, 무게 몫)
    bundle: Vec<(f64, f64, f64)>,
    occ: Vec<usize>,
    pub out: AeroOut,
    pub audit: bool,
    /// 진단: 경계면별 한 줄 (probe 용)
    pub debug: bool,
    pub dbg: Vec<String>,
}

/// 가림 판정 환경
struct Scene<'a> {
    fr: &'a [DiscFrame],
    occ: &'a [usize],
    desk: &'a Desk,
}

impl<'a> Scene<'a> {
    /// 선분 M → P 가 다른 것에 막히는가. skip = 가리지 않는 딱지(입구의 두 장), desk = 책상도 가리나
    fn visible(&self, m: V3, p: V3, skip: (usize, usize), desk: bool) -> bool {
        let dv = p - m;
        let l = dv.len();
        if l <= 0.0 {
            return true;
        }
        let d = dv * (1.0 / l);
        let lim = l - 1e-6;
        for &j in self.occ {
            if j == skip.0 || j == skip.1 {
                continue;
            }
            let f = &self.fr[j];
            // 경계구 사전 거르기
            let oc = f.c - m;
            let mut t = oc.dot(d);
            if t < 0.0 {
                t = 0.0;
            }
            if t > l {
                t = l;
            }
            let dd = (oc - d * t).len2();
            if dd > f.rb * f.rb {
                continue;
            }
            let lo = f.q.inv_rotate(m - f.c);
            let ld = f.q.inv_rotate(d);
            if let Some(th) = ray_cyl_local(lo, ld, 0.5 * f.h, R, lim) {
                if th < lim {
                    return false;
                }
            }
        }
        if desk {
            if let Some(th) = ray_box(m, d, self.desk.lo, self.desk.hi, lim) {
                if th < lim {
                    return false;
                }
            }
        }
        true
    }

    /// 광선 (o, d) 의 첫 충돌 (딱지 번호, t). 책상이 먼저면 None
    fn first_hit(&self, o: V3, d: V3, tmax: f64) -> (Option<usize>, f64) {
        let mut best = tmax;
        let mut who: Option<usize> = None;
        for &j in self.occ {
            let f = &self.fr[j];
            let oc = f.c - o;
            let t = oc.dot(d).clamp(0.0, tmax);
            if (oc - d * t).len2() > f.rb * f.rb {
                continue;
            }
            let lo = f.q.inv_rotate(o - f.c);
            let ld = f.q.inv_rotate(d);
            if let Some(th) = ray_cyl_local(lo, ld, 0.5 * f.h, R, best) {
                if th < best {
                    best = th;
                    who = Some(j);
                }
            }
        }
        if let Some(th) = ray_box(o, d, self.desk.lo, self.desk.hi, best) {
            if th < best {
                return (None, th);
            }
        }
        (who, best)
    }
}

#[inline]
fn bottom_offset(pr: &DiscProps, warp_up: bool, phi: f64) -> f64 {
    let dl = pr.delta(phi);
    if warp_up {
        dl
    } else {
        pr.a - dl
    }
}
#[inline]
fn top_empty(pr: &DiscProps, warp_up: bool, phi: f64) -> f64 {
    let dl = pr.delta(phi);
    if warp_up {
        pr.a - dl
    } else {
        dl
    }
}

impl Aero {
    pub fn new(p: AeroParams) -> Aero {
        // 감사 묶음: 벽 압력 모양(∝ e^{−ln2 η²})에서 무게가 같은 고리, 고리 대표 = 중앙값
        let k = p.audit_rings.max(1);
        let s = p.audit_sectors.max(1);
        let mut bundle = Vec::with_capacity(k * s);
        for ri in 0..k {
            let u = (ri as f64 + 0.5) / k as f64;
            let eta = libm::sqrt(-libm::log(1.0 - u) / core::f64::consts::LN_2);
            for si in 0..s {
                let off = if ri % 2 == 0 { 0.0 } else { 0.5 };
                let psi = (si as f64 + off) * 2.0 * core::f64::consts::PI / s as f64;
                bundle.push((eta, psi, 1.0 / (k * s) as f64));
            }
        }
        Aero { face: vogel(p.n_face), bundle, occ: Vec::new(), out: AeroOut::default(), audit: true, debug: false, dbg: Vec::new(), p }
    }

    /// 제트 원뿔과 겹치는 딱지 (가리개·표적 후보)
    fn relevant(&mut self, jet: &Jet, fr: &[DiscFrame]) {
        self.occ.clear();
        for (j, f) in fr.iter().enumerate() {
            if !f.live {
                continue;
            }
            let w = f.c - jet.m;
            let x = w.dot(jet.d);
            if x < -f.rb || x > X_MAX + f.rb {
                continue;
            }
            let r = (w - jet.d * x).len();
            let xr = (x + f.rb).max(0.0);
            if r - f.rb > ETA_CUT * jet.r_half(xr) {
                continue;
            }
            self.occ.push(j);
        }
    }

    /// 공력 한 번: 제트(없으면 None = 정지 공기)로 힘을 계산해 `self.out` 에 쓴다
    pub fn compute(&mut self, sim: &Sim, jet: Option<&Jet>) -> (Vec<DiscFrame>, ContactInfo) {
        let n = sim.n();
        let fr = frames(sim);
        let ci = contacts(sim, &fr);
        self.out.reset(n);
        let wref = w_ref_sim();
        if let Some(jet) = jet {
            self.relevant(jet, &fr);
            let occ = core::mem::take(&mut self.occ);
            {
                let scene = Scene { fr: &fr, occ: &occ, desk: &sim.desk };
                for &i in &occ {
                    if ci.airborne[i] {
                        continue;
                    }
                    self.f1(i, jet, &fr, &scene, wref);
                    self.f3(i, jet, &fr, &ci, &sim.desk, &scene, wref);
                    self.f4(i, jet, &fr, &ci, sim, &scene, wref);
                }
                if self.audit {
                    self.bundle_audit(jet, &scene);
                }
                // F6 공중 + 제트 (가림 포함)
                for &i in &occ {
                    if ci.airborne[i] {
                        self.f6_jet(i, &fr[i], jet, &scene, wref);
                    }
                }
            }
            self.occ = occ;
        }
        // F6 — 모든 살아 있는 딱지. 제트 원뿔 안의 공중 딱지는 상대 바람을 면 표본마다(국소 바람·ω×r) 적분
        for i in 0..n {
            if !fr[i].live {
                continue;
            }
            if jet.is_some() && ci.airborne[i] && self.occ.contains(&i) {
                continue; // 위에서 f6_jet 으로 처리
            }
            self.f6(i, &fr[i], V3::ZERO, wref);
        }
        // NaN (H4)
        for i in 0..n {
            if !self.out.force[i].is_finite() || !self.out.torque[i].is_finite() {
                self.out.nan += 1;
                self.out.force[i] = V3::ZERO;
                self.out.torque[i] = V3::ZERO;
            }
        }
        (fr, ci)
    }

    /// 힘 더하기. owner = None → 외부형(F1·F3·F2), Some(k) → 경계면 k 의 공동(F4) 몫
    #[inline]
    fn add(&mut self, i: usize, f: &DiscFrame, p: V3, force: V3, owner: Option<usize>) {
        self.out.force[i] += force;
        self.out.torque[i] += (p - f.c).cross(force);
        let vp = f.v + f.w.cross(p - f.c);
        match owner {
            None => {
                self.out.f_ext[i] += force;
                self.out.power[i] += force.dot(vp);
            }
            Some(k) => self.out.power_cav[k] += force.dot(vp),
        }
    }

    /// F1 옆면 (테두리 띠 24칸, 보이는 칸만)
    fn f1(&mut self, i: usize, jet: &Jet, fr: &[DiscFrame], scene: &Scene, wref: f64) {
        let f = fr[i];
        let nr = self.p.n_rim;
        let da = 2.0 * core::f64::consts::PI * R / nr as f64 * f.h / core::f64::consts::PI;
        for k in 0..nr {
            let ph = (k as f64 + 0.5) * 2.0 * core::f64::consts::PI / nr as f64;
            let e = f.lx * libm::cos(ph) + f.lz * libm::sin(ph);
            let ps = f.c + e * (R + self.p.eps);
            let pi = jet.wall(ps, e, self.p.cp0);
            if pi < self.p.pi_min {
                continue;
            }
            self.out.n_rays += 1;
            if !scene.visible(jet.m, ps, (usize::MAX, usize::MAX), true) {
                continue;
            }
            let force = e * (-pi * da * wref);
            self.out.sum_f1 += force;
            self.add(i, &f, f.c + e * R, force, None);
        }
    }

    /// F3 노출 밑면 (+ 선택 F2 윗면 충돌)
    #[allow(clippy::too_many_arguments)]
    fn f3(&mut self, i: usize, jet: &Jet, fr: &[DiscFrame], ci: &ContactInfo, desk: &Desk, scene: &Scene, wref: f64) {
        let f = fr[i];
        let faces: &[f64] = if self.p.f2_impact { &[-1.0, 1.0] } else { &[-1.0] };
        let nf = self.face.len();
        let da = 1.0 / nf as f64; // (πR²/N)/πR²
        for &side in faces {
            let n = f.up * side;
            if -jet.d.dot(n) <= 0.0 {
                continue;
            }
            // 면 전체가 꼬리 밖이면 건너뜀
            let fc = f.c + n * (0.5 * f.h);
            let w = fc - jet.m;
            let x = w.dot(jet.d);
            if x + R < 0.0 || x - R > X_MAX {
                continue;
            }
            let r = (w - jet.d * x).len();
            if r - R > ETA_CUT * jet.r_half((x + R).max(0.0)) {
                continue;
            }
            for m in 0..nf {
                let (rr, ph) = self.face[m];
                let p = fc + (f.lx * libm::cos(ph) + f.lz * libm::sin(ph)) * (rr * R);
                if side < 0.0 {
                    if !self.exposed_below(i, p, fr, ci, desk, scene.occ) {
                        continue;
                    }
                } else if self.covered_above(i, p, fr, ci) {
                    continue;
                }
                let ps = p + n * self.p.eps;
                let pi = jet.wall(ps, n, self.p.cp0);
                if pi < self.p.pi_min {
                    continue;
                }
                self.out.n_rays += 1;
                if !scene.visible(jet.m, ps, (usize::MAX, usize::MAX), true) {
                    continue;
                }
                let force = n * (-pi * da * wref);
                self.out.sum_f3 += force;
                self.add(i, &f, p, force, None);
            }
        }
    }

    /// 밑면 점 p 가 F3 몫인가: 받침 접촉 영역(F4 몫)이 아니고, 아래 면까지 틈 > gap_contact
    fn exposed_below(&self, i: usize, p: V3, fr: &[DiscFrame], ci: &ContactInfo, desk: &Desk, occ: &[usize]) -> bool {
        match ci.support[i] {
            Support::Disc(s) => {
                let fs = &fr[s];
                let rel = p - fs.c;
                let along = rel.dot(fs.up);
                if (rel - fs.up * along).len() <= R {
                    return false; // 경계면 안 → F4
                }
            }
            Support::Desk => {
                if desk.over(p.x, p.z) {
                    return false;
                }
            }
            Support::None => {}
        }
        // 아래 틈: 책상, 그리고 아래에 있는 다른 딱지
        let mut gap = f64::INFINITY;
        if desk.over(p.x, p.z) && p.y >= -1e-9 {
            gap = p.y;
        }
        for &j in occ {
            if j == i {
                continue;
            }
            let fj = &fr[j];
            let top = fj.c + fj.up * (0.5 * fj.h);
            let rel = p - top;
            let along = rel.dot(fj.up);
            if along < -0.5 * fj.h || along >= gap {
                continue;
            }
            if (rel - fj.up * along).len() <= R {
                gap = along.max(0.0);
            }
        }
        gap > self.p.gap_contact
    }

    /// 윗면 점 p 를 위의 접촉 짝이 덮는가 (F2 용)
    fn covered_above(&self, i: usize, p: V3, fr: &[DiscFrame], ci: &ContactInfo) -> bool {
        for &j in &ci.partners[i] {
            if let Support::Disc(s) = ci.support[j] {
                if s == i {
                    let fj = &fr[j];
                    let rel = p - fj.c;
                    let along = rel.dot(fj.up);
                    if (rel - fj.up * along).len() <= R {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// F4 틈 공동: 경계면 (i 위, 받침 아래)
    #[allow(clippy::too_many_arguments)]
    fn f4(&mut self, i: usize, jet: &Jet, fr: &[DiscFrame], ci: &ContactInfo, sim: &Sim, scene: &Scene, wref: f64) {
        let sup = ci.support[i];
        if sup == Support::None {
            return;
        }
        let f = fr[i];
        if f.up.y < 0.5 {
            return; // 거의 서 있는 딱지엔 공동이 없다
        }
        let pi_ = &sim.props[i];
        let nr = self.p.n_rim;
        let mut nodes = [Node::default(); 64];
        let nr = nr.min(64);
        let mut maxext = 0.0f64;
        let mut gaps = [0.0f64; 64];
        let (skip, desk_occ) = match sup {
            Support::Disc(s) => ((i, s), true),
            _ => ((i, usize::MAX), true),
        };
        for k in 0..nr {
            let ph = k as f64 * 2.0 * core::f64::consts::PI / nr as f64;
            let e = f.lx * libm::cos(ph) + f.lz * libm::sin(ph);
            let pk = f.c - f.up * (0.5 * f.h) + e * R;
            let (g_rb, top_e) = match sup {
                Support::Disc(s) => {
                    let fs = &fr[s];
                    let top = fs.c + fs.up * (0.5 * fs.h);
                    let rel = pk - top;
                    let along = rel.dot(fs.up);
                    let hd = (pk - fs.c - fs.up * (pk - fs.c).dot(fs.up)).len();
                    let g = if hd > R + 0.15 { self.p.g_cap } else { along };
                    let es = e - fs.up * e.dot(fs.up);
                    let phs = libm::atan2(es.dot(fs.lz), es.dot(fs.lx));
                    (g, top_empty(&sim.props[s], fs.warp_up, phs))
                }
                _ => {
                    let g = if sim.desk.over(pk.x, pk.z) { pk.y } else { self.p.g_cap };
                    (g, 0.0)
                }
            };
            let g_rb = g_rb.clamp(0.0, self.p.g_cap);
            let bo = bottom_offset(pi_, f.warp_up, ph);
            let g = (g_rb + bo + top_e + self.p.g0).min(self.p.g_cap);
            gaps[k] = g;
            // 입구: 가상 틈의 가운데, 받침 면보다 살짝 위
            let mid = 0.5 * (bo - g_rb - top_e);
            let ek = pk + e * self.p.eps + f.up * (if mid > 1e-4 { mid } else { 1e-4 });
            let mut pe = self.p.cp_in * jet.wall(ek, e, self.p.cp0);
            if pe >= self.p.pi_min {
                self.out.n_rays += 1;
                if !scene.visible(jet.m, ek, skip, desk_occ) {
                    pe = 0.0;
                }
            } else {
                pe = 0.0;
            }
            if pe > maxext {
                maxext = pe;
            }
            let gch = self.p.g0 + (g - self.p.g0) * 0.5625;
            nodes[k] = Node { pi_ext: pe, gap_rim: g, gap_ch: gch };
        }
        if maxext < self.p.pi_min {
            return;
        }
        let prm = CavityParams { cd: self.p.cd_orifice, arc_w: 2.0 * core::f64::consts::PI * R / nr as f64, l_ch: self.p.l_ch };
        let (pc, pin) = cavity::solve_power(&nodes[..nr], &prm);
        // 실물 W → 시뮬 일률: (W_ref_sim/W_ref_N)·(1/U_M) 줄 환산 ÷ S (화면 초)
        self.out.cav_budget[i] += pin * (wref / crate::units::W_REF_N) / crate::units::U_M / crate::units::time_scale();
        self.out.n_cavity += 1;
        if pc > maxext * (1.0 + 1e-9) {
            self.out.cavity_violations += 1;
        }
        let ratio = pc / maxext;
        if ratio > self.out.max_pic_over_ext {
            self.out.max_pic_over_ext = ratio;
        }
        if pc < self.p.pi_min {
            return;
        }
        // 열린 영역 (h > gap_contact) 의 넓이와 중심
        let nf = self.face.len();
        let mut cnt = 0usize;
        let mut cen = V3::ZERO;
        let bottom = f.c - f.up * (0.5 * f.h);
        for m in 0..nf {
            let (rr, ph) = self.face[m];
            let p = bottom + (f.lx * libm::cos(ph) + f.lz * libm::sin(ph)) * (rr * R);
            match sup {
                Support::Disc(s) => {
                    let fs = &fr[s];
                    let rel = p - fs.c;
                    if (rel - fs.up * rel.dot(fs.up)).len() > R {
                        continue;
                    }
                }
                _ => {
                    if !sim.desk.over(p.x, p.z) {
                        continue;
                    }
                }
            }
            let u = ph / (2.0 * core::f64::consts::PI) * nr as f64;
            let k0 = (libm::floor(u) as usize) % nr;
            let k1 = (k0 + 1) % nr;
            let fr_ = u - libm::floor(u);
            let g = gaps[k0] * (1.0 - fr_) + gaps[k1] * fr_;
            let h = self.p.g0 + (g - self.p.g0) * rr * rr;
            if h > self.p.gap_contact {
                cnt += 1;
                cen += p;
            }
        }
        if cnt == 0 {
            return;
        }
        let a_open = cnt as f64 / nf as f64;
        let cen = cen * (1.0 / cnt as f64);
        let force = f.up * (pc * a_open * wref);
        if self.debug {
            let sid = match sup {
                Support::Disc(s) => s as i64,
                _ => -1,
            };
            let gf: Vec<String> = (0..nr).map(|k| format!("{:.3}", gaps[k])).collect();
            let pe: Vec<String> = (0..nr).map(|k| format!("{:.0}", nodes[k].pi_ext)).collect();
            self.dbg.push(format!(
                "F4 i={i} s={sid} y={:.3} pc={pc:.2} maxext={maxext:.1} open={a_open:.3} lever_fwd={:.3} F={:.2}W gaps=[{}] ext=[{}]",
                f.c.y,
                (cen - f.c).z,
                force.y / wref,
                gf.join(","),
                pe.join(",")
            ));
        }
        self.out.sum_f4_up += force.y;
        self.add(i, &f, cen, force, Some(i));
        if let Support::Disc(s) = sup {
            let fs = fr[s];
            self.add(s, &fs, cen, -force, Some(i));
        }
    }

    /// F6 비행 항력
    fn f6(&mut self, i: usize, f: &DiscFrame, u_air: V3, wref: f64) {
        let k = kappa();
        let vrel = f.v - u_air;
        let n = f.ly;
        let vn = vrel.dot(n);
        let vt = vrel - n * vn;
        let vtl = vt.len();
        let fnv = n * (-self.p.cd_n * k * libm::fabs(vn) * vn * wref);
        let ftv = vt * (-self.p.c_t * k * vtl * wref);
        // 압력 중심: 받음각 α (판 평면 기준) 에 따라 앞쪽(접선 이동 방향)으로
        let mut tq = V3::ZERO;
        if vtl > 1e-12 {
            let alpha = libm::atan2(libm::fabs(vn), vtl) * 180.0 / core::f64::consts::PI;
            let ecp = 0.5 * R * (1.0 - alpha / 90.0);
            tq += (vt * (ecp / vtl)).cross(fnv);
        }
        let wn = f.w.dot(n);
        let wt = f.w - n * wn;
        let wtl = wt.len();
        if wtl > 1e-12 {
            let s = wtl * R;
            tq += wt * (-self.p.c_omega * k * s * s * wref * R / wtl);
        }
        let force = fnv + ftv;
        // H3: 정지 공기 속 정지 딱지 → 0
        if u_air.len2() == 0.0 && f.v.len2() == 0.0 && f.w.len2() == 0.0 && (force.len2() > 0.0 || tq.len2() > 0.0) {
            self.out.h3_violations += 1;
        }
        self.out.force[i] += force;
        self.out.torque[i] += tq;
    }

    /// F6 공중 + 제트: 같은 식(법선 1.17·κ|v_n|v_n, 접선 0.03)을 면 표본마다 국소 상대 속도 (v + ω×r − u_air(P)) 로 적분.
    /// 원판이 제트보다 넓어 중심 바람을 원판 전체에 쓰면 힘이 J 를 넘는다(H1·H2 위반) → 면 적분이 정직한 짝.
    /// ω×r 이 표본 속도에 들어가므로 회전 저항(C_ω = 8/15π·Cd_n 의 유도값)은 따로 더하지 않는다. 압력 중심 앞당김 e_cp 만 평균 흐름으로 더한다.
    fn f6_jet(&mut self, i: usize, f: &DiscFrame, jet: &Jet, scene: &Scene, wref: f64) {
        let k = kappa();
        let n = f.ly;
        let nf = self.face.len();
        let wa = wref / nf as f64;
        let (cdn, ct) = (self.p.cd_n, self.p.c_t);
        let drag = |w: V3| -> (V3, V3) {
            let vn = w.dot(n);
            let vt = w - n * vn;
            (n * (-cdn * k * libm::fabs(vn) * vn * wa), vt * (-ct * k * vt.len() * wa))
        };
        let mut force = V3::ZERO;
        let mut tq = V3::ZERO;
        let mut fn_tot = V3::ZERO;
        let mut vt_avg = V3::ZERO;
        let mut vn_abs = 0.0;
        // 제트가 준 몫 = F6(v − u) − F6(v) (H1 외부형, 자기 운동의 정지 공기 항력은 빼고)
        let mut f_jet = V3::ZERO;
        for m in 0..nf {
            let (rr, ph) = self.face[m];
            let r = (f.lx * libm::cos(ph) + f.lz * libm::sin(ph)) * (rr * R);
            let p = f.c + r;
            // 국소 바람: 입에서 이 점까지 다른 딱지·책상에 가리면 0 (D9). 자기 자신은 가리개에서 뺀다(면 위의 점)
            let mut ua = jet.u_air(p);
            if ua.len2() > 0.0 {
                self.out.n_rays += 1;
                if !scene.visible(jet.m, p, (i, usize::MAX), true) {
                    ua = V3::ZERO;
                }
            }
            let vb = f.v + f.w.cross(r);
            let w = vb - ua;
            let (fnv, ftv) = drag(w);
            force += fnv + ftv;
            tq += r.cross(fnv + ftv);
            fn_tot += fnv;
            let vn = w.dot(n);
            vt_avg += w - n * vn;
            vn_abs += libm::fabs(vn);
            if ua.len2() > 0.0 {
                let (fn0, ft0) = drag(vb);
                f_jet += (fnv + ftv) - (fn0 + ft0);
            }
        }
        let vtl = vt_avg.len() / nf as f64;
        if vtl > 1e-12 {
            let alpha = libm::atan2(vn_abs / nf as f64, vtl) * 180.0 / core::f64::consts::PI;
            let ecp = 0.5 * R * (1.0 - alpha / 90.0);
            tq += (vt_avg.norm() * ecp).cross(fn_tot);
        }
        self.out.force[i] += force;
        self.out.torque[i] += tq;
        // 제트에서 받은 운동량 → H1 외부형에 포함(설계서 H1 목록 F1·F2·F3·F5 보다 엄격), 일 → H2
        self.out.f_ext[i] += f_jet;
        self.out.power[i] += force.dot(f.v) + tq.dot(f.w);
    }

    /// 감사 묶음: 벽 압력 모양으로 무게 매긴 광선(합 = J)을 쏴 첫 충돌 딱지에 J·KE 몫을 준다 (H1·H2 의 '가로챈' 쪽)
    fn bundle_audit(&mut self, jet: &Jet, scene: &Scene) {
        // 축에 수직인 두 단위 벡터
        let a = if libm::fabs(jet.d.y) < 0.9 { V3::Y } else { V3::new(1.0, 0.0, 0.0) };
        let e1 = jet.d.cross(a).norm();
        let e2 = jet.d.cross(e1).norm();
        let xc = jet.x_core();
        let rcore = crate::jet::CORE_K * jet.d0;
        let jf = jet.j_force();
        for b in 0..self.bundle.len() {
            let (eta, psi, wt) = self.bundle[b];
            let e = e1 * libm::cos(psi) + e2 * libm::sin(psi);
            // 1구간: 코어 안 평행 (x ∈ [0, x_c]), 2구간: x_c 부터 기울기 η·c_s 로 퍼짐
            let p0 = jet.m + e * (eta * rcore);
            let (who, t) = scene.first_hit(p0, jet.d, xc);
            let (who, x_hit) = if who.is_some() || t < xc {
                (who, t)
            } else {
                let p1 = p0 + jet.d * xc;
                let dir = (jet.d + e * (eta * crate::jet::C_SPREAD)).norm();
                let len = (X_MAX - xc) / dir.dot(jet.d);
                let (w2, t2) = scene.first_hit(p1, dir, len);
                (w2, xc + t2 * dir.dot(jet.d))
            };
            if let Some(j) = who {
                let g2 = libm::exp(-2.0 * core::f64::consts::LN_2 * eta * eta);
                self.out.j_int[j] += wt * jf;
                self.out.ke_int[j] += wt * jf * jet.uc(x_hit.max(1e-6)) * g2;
            }
        }
    }
}

impl Aero {
    /// S0 엔진 경로: 딱지 한 장의 아래 면(F3 코드 그대로, 해바라기 n_face 점·가림 광선 포함)에 걸리는 힘.
    /// 딱지는 '접촉 중·받침 없음'(F1~F4 켜짐)으로 두고 책상은 멀리 둔다.
    pub fn s0_bottom_face(&mut self, jet: &Jet, f: DiscFrame) -> V3 {
        let fr = [f];
        let ci = ContactInfo {
            partners: vec![Vec::new()],
            on_desk: vec![true],
            airborne: vec![false],
            support: vec![Support::None],
            comp: vec![0],
        };
        let desk = Desk::new(-100.0);
        self.out.reset(1);
        let occ = [0usize];
        let scene = Scene { fr: &fr, occ: &occ, desk: &desk };
        self.f3(0, jet, &fr, &ci, &desk, &scene, w_ref_sim());
        self.out.force[0]
    }

    /// 단위 시험용: 주어진 자세들(정지)에 대해 F1 만 합한 힘 (S0 부록: 더미 옆면)
    pub fn f1_only(&mut self, jet: &Jet, fr: &[DiscFrame], desk: &Desk) -> V3 {
        self.out.reset(fr.len());
        let occ: Vec<usize> = (0..fr.len()).collect();
        let scene = Scene { fr, occ: &occ, desk };
        for i in 0..fr.len() {
            self.f1(i, jet, fr, &scene, w_ref_sim());
        }
        self.out.sum_f1
    }
}

/// 정지한 딱지 자세 하나 만들기 (단위 시험용)
pub fn frame_at(c: V3, q: Qt, h: f64) -> DiscFrame {
    let ly = q.rotate(V3::Y);
    let up = if ly.y >= 0.0 { ly } else { -ly };
    DiscFrame {
        live: true,
        c,
        q,
        lx: q.rotate(V3::new(1.0, 0.0, 0.0)),
        ly,
        lz: q.rotate(V3::new(0.0, 0.0, 1.0)),
        up,
        h,
        rb: libm::sqrt(R * R + 0.25 * h * h),
        v: V3::ZERO,
        w: V3::ZERO,
        warp_up: (-ly).dot(up) > 0.0,
    }
}

/// S0 등 단위 시험용: 판(중심 c, 바깥 법선 n, 반지름 rp)에 벽 압력 법칙을 해바라기 N 점으로 적분한 힘 (시뮬 단위)
pub fn plate_force(jet: &Jet, c: V3, n: V3, rp: f64, n_pts: usize, cp0: f64) -> V3 {
    let n = n.norm();
    let a = if libm::fabs(n.y) < 0.9 { V3::Y } else { V3::new(1.0, 0.0, 0.0) };
    let ex = n.cross(a).norm();
    let ez = n.cross(ex).norm();
    let pts = vogel(n_pts);
    let da = core::f64::consts::PI * rp * rp / n_pts as f64 / core::f64::consts::PI; // A' = dA/πR² (R = 1)
    let mut f = V3::ZERO;
    for (rr, ph) in pts {
        let p = c + (ex * libm::cos(ph) + ez * libm::sin(ph)) * (rr * rp);
        let pi = jet.wall(p, n, cp0);
        f += n * (-pi * da * w_ref_sim());
    }
    f
}
