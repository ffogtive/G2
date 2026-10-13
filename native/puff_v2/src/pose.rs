//! 세 자세 기하 — 고정 해부 치수 하나 (D8, §4.5). 결과 계수 0: 자세는 입 위치·회전축·제트 방향만 바꾼다.
//!
//! 좌표: 책상 윗면 y = 0, 플레이어 쪽 +z, 부는 방향 −z. 더미 앞면 z_f, 책상 앞 모서리 z_e (s = z_e − z_f).
//!
//! | 자세 | 입 M (φ=0) | 회전축·쓸기 | 머리 기준 제트 (φ=0) |
//! |---|---|---|---|
//! | 눈높이 EYE | (lat, 5.6, z_f + 5.6) | 목 축 N = M + (0, −2.4, +3.2) 둘레 x 회전 | −50° (내려 붊; 조준 범위 −50~−26°) |
//! | 턱 CHIN | C + (0, 1.8, −0.6), C = (lat, 0, z_f + 3.6) | 턱 접점 C 둘레 x 회전 | −25° (조준 범위 −25~0°) |
//! | 책상 밑 UNDER | (lat, −1.6, z_e + 1.8) | 몸 들기: 입이 위로 0.1 u/° (24° = 2.4 u), 제트 각 유지 | 조준으로 +30~+60° |
//!
//! 조준 → 시작 각: 표적 T(앞면 위 띠의 중심)에 제트 축이 닿는 φ₀ 를 닫힌 식(libm atan2)으로 푼다. 쓸기는 φ₀ 에서 시작한다.

use crate::geom::{rad, rot_x, V3};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pose {
    Eye,
    Chin,
    Under,
}

impl Pose {
    pub fn code(self) -> u8 {
        match self {
            Pose::Eye => 0,
            Pose::Chin => 1,
            Pose::Under => 2,
        }
    }
    pub fn from_code(c: u8) -> Pose {
        match c {
            0 => Pose::Eye,
            2 => Pose::Under,
            _ => Pose::Chin,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Pose::Eye => "eye",
            Pose::Chin => "chin",
            Pose::Under => "under",
        }
    }
    pub fn parse(s: &str) -> Option<Pose> {
        match s {
            "eye" | "EYE" | "e" => Some(Pose::Eye),
            "chin" | "CHIN" | "c" => Some(Pose::Chin),
            "under" | "UNDER" | "u" => Some(Pose::Under),
            _ => None,
        }
    }
}

/// 진단용 쓸기 3종 (§4.5): 게임에는 Native(자세 고유)만
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SweepMode {
    /// (c) 자세 고유
    Native,
    /// (a) 각도만: 입 고정, 제트 회전
    Angle,
    /// (b) 높이만: 제트 평행 이동 (조준점이 각도 쓸기와 같은 속도로 오르게 Δy = D·Δφ)
    Height,
}

impl SweepMode {
    pub fn parse(s: &str) -> Option<SweepMode> {
        match s {
            "c" | "native" => Some(SweepMode::Native),
            "a" | "angle" => Some(SweepMode::Angle),
            "b" | "height" => Some(SweepMode::Height),
            _ => None,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            SweepMode::Native => "c",
            SweepMode::Angle => "a",
            SweepMode::Height => "b",
        }
    }
}

/// 해부 치수 (고정)
pub const CHIN_FWD: f64 = 3.6;
pub const CHIN_MOUTH: V3 = V3 { x: 0.0, y: 1.8, z: -0.6 };
pub const CHIN_REF_DEG: f64 = -25.0;
pub const EYE_UP: f64 = 5.6;
pub const EYE_FWD: f64 = 5.6;
pub const EYE_NECK: V3 = V3 { x: 0.0, y: -2.4, z: 3.2 };
pub const EYE_REF_DEG: f64 = -50.0;
pub const UNDER_Y: f64 = -1.6;
pub const UNDER_FWD: f64 = 1.8;
pub const UNDER_LIFT_PER_DEG: f64 = 0.1;
pub const UNDER_MIN_DEG: f64 = 30.0;
pub const UNDER_MAX_DEG: f64 = 60.0;
/// 쓸기 전체 범위 24° (s = 1)
pub const SWEEP_FULL_DEG: f64 = 24.0;

/// −z 방향을 기준으로 수평에서 deg 만큼 든 방향 (deg > 0 = 위)
pub fn dir_deg(deg: f64) -> V3 {
    let a = rad(deg);
    V3::new(0.0, libm::sin(a), -libm::cos(a))
}

/// 자세 기하가 풀어 놓은 샷 하나의 정적 부분
#[derive(Clone, Copy, Debug)]
pub struct PoseRig {
    pub pose: Pose,
    pub mode: SweepMode,
    /// 회전축 위의 점 (턱 C, 목 N). 책상 밑은 쓰지 않음
    pub pivot: V3,
    /// φ = 0 일 때 입
    pub m0: V3,
    /// φ = 0 일 때 머리 기준 제트 방향
    pub d_ref: V3,
    /// 조준이 푼 시작 각 φ₀ (rad). 책상 밑은 제트 각 자체
    pub phi0: f64,
    /// 조준 표적
    pub target: V3,
    /// 표적까지 못 닿아 가장 가까운 각을 쓴 경우 true
    pub aim_clamped: bool,
    /// 높이 쓸기용 거리 D = |T − M(φ₀)|
    pub reach: f64,
}

impl PoseRig {
    /// lat = 옆걸음, h = 앞면 위 표적 높이. z_f = 더미 앞면, z_e = 책상 앞 모서리
    pub fn new(pose: Pose, mode: SweepMode, lat: f64, h: f64, z_f: f64, z_e: f64) -> PoseRig {
        let target = V3::new(lat, h, z_f);
        match pose {
            Pose::Chin | Pose::Eye => {
                let (pivot, m0, d_ref) = if pose == Pose::Chin {
                    let c = V3::new(lat, 0.0, z_f + CHIN_FWD);
                    (c, c + CHIN_MOUTH, dir_deg(CHIN_REF_DEG))
                } else {
                    let m0 = V3::new(lat, EYE_UP, z_f + EYE_FWD);
                    (m0 + EYE_NECK, m0, dir_deg(EYE_REF_DEG))
                };
                let (phi0, clamped) = solve_phi0(pivot, m0, d_ref, target);
                let mut rig = PoseRig { pose, mode, pivot, m0, d_ref, phi0, target, aim_clamped: clamped, reach: 0.0 };
                let (m, _) = rig.mouth_dir(0.0);
                rig.reach = (target - m).len();
                rig
            }
            Pose::Under => {
                let m0 = V3::new(lat, UNDER_Y, z_e + UNDER_FWD);
                let dy = target.y - m0.y;
                let dz = m0.z - target.z;
                let mut th = crate::geom::deg(libm::atan2(dy, dz));
                let mut clamped = false;
                if th < UNDER_MIN_DEG {
                    th = UNDER_MIN_DEG;
                    clamped = true;
                }
                if th > UNDER_MAX_DEG {
                    th = UNDER_MAX_DEG;
                    clamped = true;
                }
                let reach = (target - m0).len();
                PoseRig { pose, mode, pivot: m0, m0, d_ref: dir_deg(th), phi0: rad(th), target, aim_clamped: clamped, reach }
            }
        }
    }

    /// 쓸기 각 Δφ(rad) 에서 입 위치와 제트 방향 (단위)
    pub fn mouth_dir(&self, dphi: f64) -> (V3, V3) {
        match self.pose {
            Pose::Chin | Pose::Eye => {
                let at = |phi: f64| -> (V3, V3) {
                    (self.pivot + rot_x(self.m0 - self.pivot, phi), rot_x(self.d_ref, phi))
                };
                match self.mode {
                    SweepMode::Native => at(self.phi0 + dphi),
                    SweepMode::Angle => {
                        let (m, _) = at(self.phi0);
                        let (_, d) = at(self.phi0 + dphi);
                        (m, d)
                    }
                    SweepMode::Height => {
                        let (m, d) = at(self.phi0);
                        (m + V3::new(0.0, self.reach * dphi, 0.0), d)
                    }
                }
            }
            Pose::Under => {
                let ddeg = crate::geom::deg(dphi);
                match self.mode {
                    SweepMode::Angle => (self.m0, rot_x(self.d_ref, dphi)),
                    _ => (self.m0 + V3::new(0.0, UNDER_LIFT_PER_DEG * ddeg, 0.0), self.d_ref),
                }
            }
        }
    }

    /// 시작 제트 각 (수평 기준 deg, + = 위)
    pub fn jet_deg0(&self) -> f64 {
        let (_, d) = self.mouth_dir(0.0);
        crate::geom::deg(libm::atan2(d.y, -d.z))
    }
}

/// 닫힌 식: 머리 기준 직선 L₀(M₀ 지나 d_ref 방향)을 축 P 둘레로 φ 돌려 T 를 지나게.
/// ⇔ R(−φ)(T − P) 가 L₀ − P 위 → |m + λu| = |T − P| 를 λ 에 대해 풀고(입 앞쪽 근) 두 벡터 사이 각.
/// (y, z) 평면 2D, rot_x 와 같은 방향.
pub fn solve_phi0(pivot: V3, m0: V3, d_ref: V3, t: V3) -> (f64, bool) {
    let m = (m0.y - pivot.y, m0.z - pivot.z);
    let u = (d_ref.y, d_ref.z);
    let v = (t.y - pivot.y, t.z - pivot.z);
    let rho2 = v.0 * v.0 + v.1 * v.1;
    let mu = m.0 * u.0 + m.1 * u.1;
    let mm = m.0 * m.0 + m.1 * m.1;
    let disc = mu * mu - mm + rho2;
    let (lam, clamped) = if disc >= 0.0 { (-mu + libm::sqrt(disc), false) } else { (-mu, true) };
    let w = (m.0 + lam * u.0, m.1 + lam * u.1);
    // w → v 회전각 (rot_x 와 같은 (y, z) 방향)
    let cr = w.0 * v.1 - w.1 * v.0;
    let dt = w.0 * v.0 + w.1 * v.1;
    (libm::atan2(cr, dt), clamped)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chin_raise_24_moves_mouth_back_and_up() {
        let rig = PoseRig::new(Pose::Chin, SweepMode::Native, 0.0, 0.0, 1.0, 9.0);
        // 머리 기준 각 0 → 24° 비교 (φ₀ 무관하게 회전축 기하만)
        let c = rig.pivot;
        let m0 = c + CHIN_MOUTH;
        let m24 = c + rot_x(CHIN_MOUTH, rad(24.0));
        let dy = m24.y - m0.y;
        let dz = m24.z - m0.z;
        assert!((dy - 0.088).abs() < 0.01, "dy {dy}");
        assert!(dz > 0.75 && dz < 0.85, "dz {dz}");
    }
    #[test]
    fn aim_solve_hits_target() {
        for pose in [Pose::Chin, Pose::Eye] {
            for h in [0.3, 0.8, 1.5] {
                let rig = PoseRig::new(pose, SweepMode::Native, 0.2, h, 1.0, 9.0);
                let (m, d) = rig.mouth_dir(0.0);
                // 제트 축과 표적 사이 거리
                let w = rig.target - m;
                let x = w.dot(d);
                let r = (w - d * x).len();
                assert!(x > 0.0 && r < 1e-9, "{pose:?} h {h}: x {x} r {r}");
            }
        }
    }
}
