//! puff_v2 — PUFF! 물리 v2 · 3D 제트 스파이크 엔진 (설계서 docs/design/v2-physics-gameplay.md, 백로그 #1).
//!
//! 🧭 가설: 정직한 접촉(300 Hz·ζ 10) 원기둥 더미 위에, 숨(유량·입 면적) → 준정상 원형 제트 → 벽 압력 법칙(F1·F3) + 틈 공동(F4)
//!   + 비행 항력(F6)만 480 Hz 로 걸면, 자세·숨별 손익이 보너스 없이 물리에서 나온다(D8). S0(A0.8) 단위 시험이 법칙의 첫 관문.
//!
//! 모듈 ↔ 설계서
//!  - [`units`]  §4.1 단위 표 (D1·D2)       - [`pile`]   §4.2·§4.3 정직한 더미·휨 상태·rapier 월드 (D3·D4·D11·D12·D15)
//!  - [`breath`] §4.4 원시 입력 → BreathProgram (D5·D14)   - [`pose`]   §4.5 세 자세 기하·쓸기 (D8)
//!  - [`jet`]    §4.6 준정상 원형 제트 (D6)               - [`aero`]   §4.7·§4.8 F1·F3·F4·F6, 해석적 가림(D9), 감사 묶음
//!  - [`cavity`] §4.7 F4 공동 압력 (오리피스 + Poiseuille, 이분법 24회)
//!  - [`shot`]   샷 하나 API (480 Hz 제트 일정 D15, 판정, 감사 H1~H4)   - [`gates`] G1·S0·S1~S6

pub mod aero;
pub mod breath;
pub mod cavity;
pub mod gates;
pub mod geom;
pub mod jet;
pub mod json;
pub mod pile;
pub mod pose;
pub mod rng;
pub mod shot;
pub mod units;

pub use shot::{run_batch, run_shot, ShotResult, ShotSpec};

/// 물리 버전 문자열 (보정표·기록의 열쇠 후보)
pub fn physics_version() -> String {
    format!("puff_v2 {} rapier3d 0.36.0 libm 0.2.16 K_breath 3.9L/s", env!("CARGO_PKG_VERSION"))
}
