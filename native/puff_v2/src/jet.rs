//! 준정상 원형 제트 (D6, §4.6). 평균장, 난류 요동 없음. 이 모듈은 난수를 쓰지 않는다(H4).
//!
//! 점 P 에 대해 x = (P − M)·d, r = 축까지 거리, d₀ = 2√(A/π).
//!   Uc = U₀·min(1, B·d₀/x), B = 5.8
//!   r½ = max(0.589·d₀, 0.1015·x)           — 코어 안에서도 운동량 보존(두 식은 x = 5.8·d₀ 에서 이어짐)
//!   Π_c(x) = min(Π₀, 2B²·j·R²/x²) (= 67.3·j/ξ²),  Π₀ = j·πR²/(2A)
//!   벽 압력 법칙 Π_wall = Cp₀·Π_c·c²·exp(−ln2·(r/r½)²),  c = max(0, −d·n)   — 막힌 큰 면 적분 = J·c (S0)
//!   국소 동압 Π_loc = Π_c·exp(−2 ln2·(r/r½)²),  국소 속도 u = Uc·exp(−ln2·(r/r½)²)·d
//!   유효 범위 x ∈ (0, 12] u (x < 0.5 는 코어 값 그대로), r > 3·r½ 는 꼬리 컷.

use crate::breath::{j_of, BreathSample};
use crate::geom::V3;
use crate::units::{v_sim_per_mps, R};

pub const B_JET: f64 = 5.8;
pub const C_SPREAD: f64 = 0.1015;
pub const CORE_K: f64 = 0.589;
pub const X_MAX: f64 = 12.0;
pub const ETA_CUT: f64 = 3.0;
pub const LN2: f64 = core::f64::consts::LN_2;

#[derive(Clone, Copy, Debug)]
pub struct Jet {
    pub m: V3,
    pub d: V3,
    /// 힘 비 j = J/W
    pub j: f64,
    /// 코어 동압 Π₀
    pub pi0: f64,
    /// 입 지름 d₀ (u)
    pub d0: f64,
    /// 입 속도 U₀ (시뮬 u/s)
    pub u0: f64,
    pub q_lps: f64,
    pub a_cm2: f64,
}

/// 한 점의 제트장
#[derive(Clone, Copy, Debug)]
pub struct Field {
    pub x: f64,
    pub r: f64,
    pub rh: f64,
    /// exp(−ln2 η²) (속도 모양)
    pub g: f64,
    pub pi_c: f64,
    pub uc: f64,
    /// 축에서 이 점으로의 단위 반지름 방향
    pub eta: f64,
}

impl Jet {
    pub fn from_sample(s: &BreathSample) -> Option<Jet> {
        if s.q_lps <= 0.0 || s.a_cm2 <= 0.0 {
            return None;
        }
        Some(Jet::new(s.m, s.d, s.q_lps, s.a_cm2))
    }

    pub fn new(m: V3, d: V3, q_lps: f64, a_cm2: f64) -> Jet {
        let a_u2 = a_cm2 * 1e-4 / (crate::units::U_M * crate::units::U_M);
        let j = j_of(q_lps, a_cm2);
        let d0 = 2.0 * libm::sqrt(a_u2 / core::f64::consts::PI);
        let pi0 = j * core::f64::consts::PI * R * R / (2.0 * a_u2);
        let u0 = (q_lps * 1e-3) / (a_cm2 * 1e-4) * v_sim_per_mps();
        Jet { m, d: d.norm(), j, pi0, d0, u0, q_lps, a_cm2 }
    }

    /// 축 동압 Π_c(x)
    #[inline]
    pub fn pi_c(&self, x: f64) -> f64 {
        let far = 2.0 * B_JET * B_JET * self.j * R * R / (x * x);
        if far < self.pi0 {
            far
        } else {
            self.pi0
        }
    }
    #[inline]
    pub fn r_half(&self, x: f64) -> f64 {
        let a = CORE_K * self.d0;
        let b = C_SPREAD * x;
        if a > b {
            a
        } else {
            b
        }
    }
    #[inline]
    pub fn uc(&self, x: f64) -> f64 {
        let k = B_JET * self.d0 / x;
        self.u0 * if k < 1.0 { k } else { 1.0 }
    }
    /// 코어 끝 x_c = B·d₀
    pub fn x_core(&self) -> f64 {
        B_JET * self.d0
    }

    /// 점 P 의 제트장 (범위 밖·꼬리면 None)
    #[inline]
    pub fn field(&self, p: V3) -> Option<Field> {
        let w = p - self.m;
        let x = w.dot(self.d);
        if x <= 0.0 || x > X_MAX {
            return None;
        }
        let r = (w - self.d * x).len();
        let rh = self.r_half(x);
        let eta = r / rh;
        if eta > ETA_CUT {
            return None;
        }
        let g = libm::exp(-LN2 * eta * eta);
        Some(Field { x, r, rh, g, pi_c: self.pi_c(x), uc: self.uc(x), eta })
    }

    /// 벽 압력 법칙 Π_wall (면 법선 n, 바깥 방향)
    #[inline]
    pub fn wall(&self, p: V3, n: V3, cp0: f64) -> f64 {
        let c = -self.d.dot(n);
        if c <= 0.0 {
            return 0.0;
        }
        match self.field(p) {
            Some(f) => cp0 * f.pi_c * c * c * f.g,
            None => 0.0,
        }
    }

    /// 국소 바람 속도 (시뮬 u/s)
    #[inline]
    pub fn u_air(&self, p: V3) -> V3 {
        match self.field(p) {
            Some(f) => self.d * (f.uc * f.g),
            None => V3::ZERO,
        }
    }

    /// 운동량 플럭스 J 의 시뮬 힘 (= j·W_ref_sim)
    pub fn j_force(&self) -> f64 {
        self.j * crate::units::w_ref_sim()
    }
}
