//! F4 틈 공동 (§4.7). 순수 함수, 난수 없음(H4).
//!
//! 위 장 i 와 받침 s 사이 틈을 테두리 노드 24개로 본다. 노드마다
//!   입구 압력 Π_ext,k = Cp_in·Π_wall(P_k)   (보이는 입구만; 호출하는 쪽이 계산)
//!   Δp = ½ρ(Q/(Cd·A))² + 12μ·L·Q/(w·h³)    — 오리피스 + Poiseuille, SI 로 계산
//! Σ Q = 0 을 Π_c 에 대해 이분법 24회로 푼다(구간 [0, max Π_ext] → Π_c ≤ max Π_ext 가 구조적으로 성립, H1 둘째 줄).
//! 공동 압력은 입구 정체압을 넘지 못하고, 틈이 열릴수록 새는 면적이 늘어 압력이 떨어진다 — 옛 '틈 → 들기 1.35배' 양의 되먹임 없음.

use crate::units::{pa, MU_AIR, RHO, U_M};

pub const BISECT_ITERS: usize = 24;

#[derive(Clone, Copy, Debug, Default)]
pub struct Node {
    /// 입구 정체압 Π_ext (무차원)
    pub pi_ext: f64,
    /// 테두리 틈 높이 g_k (u) — 오리피스 면적 = 호 폭 × g_k
    pub gap_rim: f64,
    /// 통로 대표 틈 (u) — Poiseuille
    pub gap_ch: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct CavityParams {
    pub cd: f64,
    /// 노드 하나의 호 폭 (u)
    pub arc_w: f64,
    /// 통로 길이 (u)
    pub l_ch: f64,
}

/// 노드 유량 (m³/s), 바깥 → 공동이 + . Δp 는 Pa
#[inline]
fn node_flow(n: &Node, dp: f64, p: &CavityParams) -> f64 {
    if dp == 0.0 {
        return 0.0;
    }
    let w = p.arc_w * U_M;
    let a = w * n.gap_rim * U_M;
    let h = n.gap_ch * U_M;
    let l = p.l_ch * U_M;
    if a <= 0.0 || h <= 0.0 {
        return 0.0;
    }
    let ca = RHO / (2.0 * p.cd * p.cd * a * a);
    let cb = 12.0 * MU_AIR * l / (w * h * h * h);
    let m = libm::fabs(dp);
    let q = 2.0 * m / (cb + libm::sqrt(cb * cb + 4.0 * ca * m));
    if dp > 0.0 {
        q
    } else {
        -q
    }
}

/// Σ Q(Π_c) = 0 을 푼 공동 압력 Π_c (무차원)
pub fn solve(nodes: &[Node], p: &CavityParams) -> f64 {
    solve_power(nodes, p).0
}

/// (Π_c, 들어오는 흐름이 공동에 넣는 압력 일률 Σ Q⁺·p_ext [실물 W]) — H2c 의 에너지 예산
pub fn solve_power(nodes: &[Node], p: &CavityParams) -> (f64, f64) {
    let pc = solve_pc(nodes, p);
    let mut pw = 0.0;
    for n in nodes {
        let q = node_flow(n, pa(n.pi_ext - pc), p);
        if q > 0.0 {
            pw += q * pa(n.pi_ext);
        }
    }
    (pc, pw)
}

fn solve_pc(nodes: &[Node], p: &CavityParams) -> f64 {
    let mut hi = 0.0f64;
    let mut gsum = 0.0;
    for n in nodes {
        if n.pi_ext > hi {
            hi = n.pi_ext;
        }
        gsum += n.gap_rim;
    }
    if hi <= 0.0 || gsum <= 0.0 {
        return 0.0;
    }
    let f = |pc: f64| -> f64 {
        let mut s = 0.0;
        for n in nodes {
            s += node_flow(n, pa(n.pi_ext - pc), p);
        }
        s
    };
    let mut lo = 0.0f64;
    for _ in 0..BISECT_ITERS {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn prm() -> CavityParams {
        CavityParams { cd: 0.6, arc_w: 2.0 * core::f64::consts::PI / 24.0, l_ch: 0.5 }
    }
    #[test]
    fn wedge_front_open_beats_all_open() {
        // 앞이 열린 쐐기: 입구 3칸만 압력·큰 틈, 나머지는 g₀ 로 닫힘 → Π_c/Π_ext 높음
        let mut wedge = vec![Node { pi_ext: 0.0, gap_rim: 0.002, gap_ch: 0.002 }; 24];
        let mut open = vec![Node { pi_ext: 0.0, gap_rim: 0.03, gap_ch: 0.02 }; 24];
        for k in 0..3 {
            wedge[k] = Node { pi_ext: 100.0, gap_rim: 0.03, gap_ch: 0.02 };
            open[k].pi_ext = 100.0;
        }
        let pw = solve(&wedge, &prm());
        let po = solve(&open, &prm());
        assert!(pw <= 100.0 && po <= 100.0);
        assert!(pw / 100.0 > 0.25, "wedge ratio {}", pw / 100.0);
        assert!(po / 100.0 < 0.2, "all-open ratio {}", po / 100.0);
        assert!(pw > 2.0 * po);
    }
    #[test]
    fn zero_ext_zero_cavity() {
        let n = vec![Node { pi_ext: 0.0, gap_rim: 0.01, gap_ch: 0.01 }; 24];
        assert_eq!(solve(&n, &prm()), 0.0);
    }
}
