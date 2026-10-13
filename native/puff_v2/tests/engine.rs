//! 단위·결정성 시험 (cargo test --release)
//!  - 단위 변환 S = 3.21, 속도 12.45, κ 6.56e-4, 종단속도 36 u/s(A0.4 해석), 꽉 퍽 j 14.3
//!  - 벽 압력 법칙 적분 = J·c (S0 법칙 경로·엔진 경로)
//!  - 제트 식이 코어 끝에서 이어짐 (r½·Π_c)
//!  - H3 정지 공기 F6 = 0, H4 공력 모듈 난수 0
//!  - 결정성: 같은 입력 → 같은 해시 (순차·스레드 묶음 모두), 다른 시드 → 다른 해시

use puff_v2::aero::{frame_at, plate_force, Aero, AeroParams};
use puff_v2::breath::BreathSpec;
use puff_v2::geom::{Qt, V3};
use puff_v2::jet::Jet;
use puff_v2::pile::{PileParams, Sim, SolverCfg};
use puff_v2::pose::Pose;
use puff_v2::units::*;
use puff_v2::{gates, run_batch, run_shot, ShotSpec};

#[test]
fn unit_conversion_s_321() {
    let s = time_scale();
    assert!((s - 3.21).abs() < 0.005, "S = {s}");
    assert!((v_sim_per_mps() - 12.45).abs() < 0.01, "v = {}", v_sim_per_mps());
    assert!((kappa() - 6.56e-4).abs() < 0.02e-4, "κ = {}", kappa());
    // W_ref = w·πR² 와 m·g 가 같은 딱지를 가리킨다
    let w_area = W_AREA_PA * core::f64::consts::PI * U_M * U_M;
    assert!((w_area - W_REF_N).abs() / W_REF_N < 0.01);
    assert!((DISC_MASS * 1e-3 * G_REAL - W_REF_N).abs() / W_REF_N < 0.01);
    // A0.4 종단속도 = 1/√(Cd_n·κ) ≈ 36 u/s
    let vt = 1.0 / libm::sqrt(1.17 * kappa());
    assert!((vt - 36.0).abs() < 0.5, "v_term {vt}");
    // 아바타 꽉 퍽: 3.9 L/s, 1.1 cm² → j ≈ 14.3, U₀ ≈ 35 m/s
    let jet = Jet::new(V3::ZERO, V3::Y, 3.9, 1.1);
    assert!((jet.j - 14.3).abs() < 0.05, "j {}", jet.j);
    assert!((jet.u0 / v_sim_per_mps() - 35.45).abs() < 0.1);
    assert!((jet.pi0 / jet.j - 8.92).abs() < 0.02, "Π₀/j {}", jet.pi0 / jet.j);
    assert!((jet.d0 - 0.473).abs() < 0.002);
}

#[test]
fn jet_formulas_join_at_core_end() {
    for a in [1.1, 1.8, 2.5] {
        let jet = Jet::new(V3::ZERO, V3::Y, 3.9, a);
        let xc = jet.x_core();
        let e = 1e-9;
        assert!((jet.r_half(xc - e) - jet.r_half(xc + e)).abs() < 1e-6, "r½ 이음 A {a}");
        assert!((jet.pi_c(xc - e) - jet.pi_c(xc + e)).abs() / jet.pi0 < 1e-6, "Π_c 이음 A {a}");
        // 원거리 운동량 보존: 2B²c_s² = ln2 (Gauss 면 적분 = J)
        let k = 2.0 * 5.8 * 5.8 * 0.1015 * 0.1015 / core::f64::consts::LN_2;
        assert!((k - 1.0).abs() < 1e-3, "2B²c²/ln2 = {k}");
    }
}

#[test]
fn wall_law_integral_is_j_sin_theta() {
    // 큰 판(제트 폭의 5배) — 정면 ≈ J, 45° ≈ J·sin45 (±2%), 30° ≈ J/2 (±8%: 코어 끝 x≈3 에서 비스듬한 발자국이
    // Π_c 의 min·r½ 의 max 모서리를 걸쳐 0.531 J 가 나온다 — 법칙의 성질로 기록, S0 는 90°·45° 만 본다)
    for x in [1.0, 3.0, 7.0] {
        for (ang, want, tol) in [(90.0f64, 1.0f64, 0.02f64), (45.0, 0.7071, 0.02), (30.0, 0.5, 0.04)] {
            let jet = Jet::new(V3::ZERO, V3::Y, 3.9, 1.1);
            let th = (90.0 - ang).to_radians();
            let n = V3::new(libm::sin(th), -libm::cos(th), 0.0);
            let rp = 5.0 * jet.r_half(x) / libm::sin(ang.to_radians());
            let f = plate_force(&jet, V3::new(0.0, x, 0.0), n, rp, 8192, 1.0).len() / jet.j_force();
            assert!((f - want).abs() < tol, "x {x} ang {ang}: F/J {f} (want {want})");
        }
    }
}

#[test]
fn s0_gate_passes() {
    let (rows, ok) = gates::s0_gate();
    for r in &rows {
        assert!(r.pass, "{} A {} x {} {}° → {}", r.path, r.area_cm2, r.x, r.angle_deg, r.f_over_j);
    }
    assert!(ok);
    // 엔진 경로(F3 코드 그대로)가 적어도 한 줄은 있어야
    assert!(rows.iter().any(|r| r.path == "engine_F3"));
}

#[test]
fn h3_still_air_still_disc_zero_f6() {
    let snap = puff_v2::shot::settle_pile(&PileParams::new(12, 5), SolverCfg::default());
    let mut sim = Sim::restore(&snap);
    for i in 0..sim.n() {
        let b = &mut sim.world.bodies[sim.discs[i].body];
        b.set_linvel(rapier3d::prelude::Vector::ZERO, false);
        b.set_angvel(rapier3d::prelude::Vector::ZERO, false);
    }
    let mut a = Aero::new(AeroParams::default());
    a.compute(&sim, None);
    for i in 0..sim.n() {
        assert_eq!(a.out.force[i], V3::ZERO);
        assert_eq!(a.out.torque[i], V3::ZERO);
    }
    assert_eq!(a.out.h3_violations, 0);
}

#[test]
fn h4_aero_modules_use_no_rng() {
    for f in ["src/aero.rs", "src/jet.rs", "src/cavity.rs"] {
        let src = std::fs::read_to_string(f).unwrap();
        // 주석을 뺀 코드에서 난수 흔적 찾기
        let code: String = src.lines().filter(|l| !l.trim_start().starts_with("//")).collect::<Vec<_>>().join("\n");
        for bad in ["Mulberry", "rng::", "rand", "gauss("] {
            assert!(!code.contains(bad), "{f} 에 '{bad}'");
        }
    }
}

#[test]
fn f1_disc_side_force_is_inward_and_bounded() {
    // 40장 원기둥 옆면에 수평 제트: 합 ≤ J, 대부분 −z (안쪽)
    let qd = Qt::axis_angle(V3::new(1.0, 0.0, 0.0), core::f64::consts::PI);
    let fr: Vec<_> = (0..40).map(|i| frame_at(V3::new(0.0, 0.025 + 0.05 * i as f64, 0.0), qd, 0.05)).collect();
    let jet = Jet::new(V3::new(0.0, 1.0, 4.0), V3::new(0.0, 0.0, -1.0), 3.9, 1.1);
    let mut a = Aero::new(AeroParams::default());
    let f = a.f1_only(&jet, &fr, &puff_v2::pile::Desk::new(20.0));
    let r = f.len() / jet.j_force();
    assert!(r > 0.85 && r <= 1.0, "F1/J {r}");
    assert!(-f.z / f.len() > 0.99);
}

fn small_spec(seed: u32) -> ShotSpec {
    let mut s = ShotSpec::new(5, seed, Pose::Chin, BreathSpec::puff(1.0), 0.0, 0.15);
    s.max_after = 2.0;
    s
}

#[test]
fn determinism_same_input_same_hash() {
    let a = run_shot(&small_spec(7));
    let b = run_shot(&small_spec(7));
    assert_eq!(a.hash, b.hash);
    assert_eq!(a.flipped, b.flipped);
    // 스레드 묶음(같은 더미 사본 공유)도 같은 해시
    let specs = vec![small_spec(7), small_spec(8), small_spec(7)];
    let rs = run_batch(&specs, 2);
    assert_eq!(rs[0].hash, a.hash);
    assert_eq!(rs[2].hash, a.hash);
    assert_ne!(rs[1].hash, a.hash, "다른 시드는 다른 해시");
}

#[test]
fn determinism_pueok_with_sweep() {
    let mut s = ShotSpec::new(6, 3, Pose::Chin, BreathSpec::pueok(0.9, 0.8).with_sweep(9.0, 0.2), 0.1, 0.2);
    s.max_after = 1.5;
    let a = run_shot(&s);
    let b = run_shot(&s);
    assert_eq!(a.hash, b.hash);
    assert!(a.raw_bytes <= 200);
}

#[test]
fn pile_is_seed_pure() {
    let a = puff_v2::pile::make_layout(&PileParams::new(30, 11));
    let b = puff_v2::pile::make_layout(&PileParams::new(30, 11));
    assert_eq!(a.nominal, b.nominal);
    // 평균 두께 ≈ 0.05 u (§4.2)
    let big = puff_v2::pile::make_layout(&PileParams::new(2000, 1));
    let mt = big.nominal / 2000.0;
    assert!((mt - 0.0515).abs() < 0.003, "평균 두께 {mt}");
    // 휨 종류 비율 30/35/25/10 ± 3%p
    let mut cnt = [0usize; 4];
    for p in &big.props {
        cnt[p.kind as usize] += 1;
    }
    for (k, want) in [0.30, 0.35, 0.25, 0.10].iter().enumerate() {
        let got = cnt[k] as f64 / 2000.0;
        assert!((got - want).abs() < 0.03, "종류 {k}: {got}");
    }
}

#[test]
fn bootstrap_ratio_undefined_when_both_zero() {
    let (p, lo, hi) = gates::paired_ratio_ci(&[0.0, 0.0, 0.0], &[0.0, 0.0, 0.0], 200);
    assert!(p.is_nan() && lo.is_nan() && hi.is_nan(), "0/0 은 정의되지 않음 → 판정 실패");
    let (p, _, _) = gates::paired_ratio_ci(&[0.0, 0.0], &[1.0, 2.0], 200);
    assert!(p.is_infinite() && p > 0.0);
    let (p, lo, hi) = gates::paired_ratio_ci(&[2.0, 4.0, 3.0, 5.0], &[3.0, 6.0, 4.5, 7.5], 500);
    assert!((p - 1.5).abs() < 1e-12 && lo <= p && p <= hi);
}
