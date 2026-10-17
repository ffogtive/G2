//! 숨 규칙 — mockup/src/rules.js 의 resolveShot·sweetHiFor·physSweetFor 포팅 (게임·봇·측정 도구가 공유하는 부분).

use crate::rng::{gauss, Mulberry32};

pub const POWER_MAX: f64 = 1.25;
pub const PHYS_SWEET: f64 = 0.95;
pub const PHYS_SWEET_ONE: f64 = 0.75;
pub const GREEN_LO: f64 = 0.78;
pub const WEAK_ZERO: f64 = 0.45;
pub const WEAK_FLOOR: f64 = 0.3;
pub const WEAK_EXP: f64 = 2.0;
pub const BLAST_SPAN: f64 = 0.4;
pub const POUCH_FULL: f64 = 1.12;
pub const LIP_BACK: f64 = 2.6;
pub const LIP_MIN: f64 = 0.15;

/// JS clamp(v, a, b) = max(a, min(b, v)) — a > b 여도 패닉 없이 JS 와 같은 값
#[inline]
pub fn jclamp(v: f64, a: f64, b: f64) -> f64 {
    a.max(b.min(v))
}

pub fn phys_sweet_for(n: usize) -> f64 {
    if n <= 1 {
        PHYS_SWEET_ONE
    } else {
        PHYS_SWEET
    }
}

pub fn sweet_hi_for(n: usize) -> f64 {
    let n = n.max(1) as f64;
    jclamp(0.45 + 0.5 * libm::sqrt((n - 1.0) / 19.0), 0.45, 1.12)
}

pub fn sweet_lo_for(n: usize) -> f64 {
    sweet_hi_for(n) * 0.78
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Shot {
    pub lat: f64,
    pub h: f64,
    pub power: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Resolved {
    pub lat: f64,
    pub h: f64,
    /// 물리 세기 (blow power)
    pub power: f64,
    pub ratio: f64,
    pub blast: f64,
    pub over: bool,
}

/// rules.js resolveShot(shot, n, top, rng, overShake)
pub fn resolve_shot(shot: Shot, n: usize, top: f64, rng: &mut Mulberry32, over_shake: f64) -> Resolved {
    let hi = sweet_hi_for(n);
    let ratio = shot.power / hi;
    let ps = phys_sweet_for(n);
    if ratio < GREEN_LO {
        let lift = libm::pow(jclamp((ratio - WEAK_ZERO) / (GREEN_LO - WEAK_ZERO), 0.0, 1.0), WEAK_EXP);
        return Resolved { lat: shot.lat, h: shot.h, power: WEAK_FLOOR + (ps - WEAK_FLOOR) * lift, ratio, blast: 0.0, over: false };
    }
    if ratio <= 1.0 {
        return Resolved { lat: shot.lat, h: shot.h, power: ps, ratio, blast: 0.0, over: false };
    }
    let ex = ratio - 1.0;
    let k = over_shake;
    // JS 객체 리터럴 평가 순서: blast, h(gauss), lat(gauss)
    let blast = jclamp(ex / BLAST_SPAN, 0.0, 1.4);
    let h = jclamp(shot.h + gauss(rng) * ex * 1.2 * k, 0.03, top);
    let lat = jclamp(shot.lat + gauss(rng) * ex * 1.0 * k, -0.95, 0.95);
    Resolved { lat, h, power: ps, ratio, blast, over: true }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sweet_curve() {
        assert!((sweet_hi_for(1) - 0.45).abs() < 1e-12);
        assert!((sweet_hi_for(20) - 0.95).abs() < 1e-12);
        assert_eq!(phys_sweet_for(1), 0.75);
        assert_eq!(phys_sweet_for(2), 0.95);
    }
}
