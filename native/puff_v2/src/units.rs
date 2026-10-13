//! 시간·단위 표 하나 (설계서 §4.1, D1·D2).
//!
//! - 느린 세계: g = 38 u/s², 1 u = 25 mm = 딱지 반지름 R. 프루드 상사로 S = √(9.81/0.95) ≈ 3.21.
//! - **화면 초 = 시뮬 초 = 입력 초.** 실물 초 = 화면 초 ÷ S.
//! - 힘은 j = F/W_ref, 압력은 Π = p/w 로 다룬다(단위 변환에 불변, D2).
//! - 시뮬 질량 단위는 그램(딱지 1.18 g 를 직접 지정, D3). 시뮬 힘 = j · W_ref_sim, W_ref_sim = 1.18 · 38.

/// 1 u 가 몇 m 인가 (딱지 반지름 25 mm)
pub const U_M: f64 = 0.025;
/// 시뮬 중력 (u/s²)
pub const G_SIM: f64 = 38.0;
/// 실물 중력 (m/s²)
pub const G_REAL: f64 = 9.81;
/// 딱지 반지름 (u)
pub const R: f64 = 1.0;
/// 딱지 질량 (g = 시뮬 질량 단위). 테이프 딱지는 ×1.4 (이번 스파이크엔 없음)
pub const DISC_MASS: f64 = 1.18;
/// 기준 딱지 무게 (N) — j 의 분모
pub const W_REF_N: f64 = 0.0116;
/// 면적당 무게 w (Pa) — Π 의 분모
pub const W_AREA_PA: f64 = 5.9;
/// 공기 밀도 (kg/m³), 점성 (Pa·s)
pub const RHO: f64 = 1.2;
pub const MU_AIR: f64 = 1.8e-5;
/// 종이 두께 (u) = 0.8 mm. 딱지 콜라이더 두께 = max(0.040, 0.032 + a)
pub const PAPER_T: f64 = 0.032;
pub const MIN_T: f64 = 0.040;

/// 시간 비 S = √(9.81/0.95) (0.95 = 38 u/s² × 0.025 m/u). 실물 초 = 화면 초 / S
pub fn time_scale() -> f64 {
    libm::sqrt(G_REAL / (G_SIM * U_M))
}

/// 실물 1 m/s 가 시뮬 몇 u/s 인가 (≈ 12.45)
pub fn v_sim_per_mps() -> f64 {
    1.0 / (U_M * time_scale())
}

/// 시뮬 속도(u/s) → 동압 Π 계수 κ: Π_rel = κ·v² (≈ 6.56e-4 s²/u²)
pub fn kappa() -> f64 {
    let c = v_sim_per_mps();
    0.5 * RHO / W_AREA_PA / (c * c)
}

/// 기준 딱지 무게의 시뮬 힘 (g·u/s²)
pub fn w_ref_sim() -> f64 {
    DISC_MASS * G_SIM
}

/// u² → m²
pub fn area_m2(a_u2: f64) -> f64 {
    a_u2 * U_M * U_M
}

/// Π → Pa
pub fn pa(pi: f64) -> f64 {
    pi * W_AREA_PA
}
