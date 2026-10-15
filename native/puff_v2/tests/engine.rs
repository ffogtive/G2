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

/// 평평한 바닥(pose=flat)은 opt-in: 옛 키 샷의 해시·JSON 은 그대로, 평평한 바닥 샷은 결정적이고 기록이 실린다.
/// 기대 해시 = 평평한 바닥을 넣기 전 바이너리(2026-10-15)로 기록한 값 (docs/research/v2-flatfloor.md §6).
#[test]
fn flat_scenario_is_opt_in() {
    assert!(!PileParams::new(30, 11).key().contains("tk"), "기본 두께·질량 배율이면 옛 더미 열쇠");
    for (line, want) in [
        ("n=6 seed=5 pose=under breath=puff q=0.8 inset=-0.3 h=0.2", "3225da5f5e5358f2"),
        ("n=4 seed=6 pose=under breath=puff q=1 inset=-0.45 h=0.3 edge=0", "edc23eb196a9afb5"),
        ("n=20 seed=4 pose=eye breath=puff q=0.85 h=0.9", "e1c92efe80c1e3b2"),
        ("n=30 seed=3 pose=chin breath=pueok q=0.9 dur=0.8 sweep=9 delay=0.3 mode=b h=1.3 lat=0.25", "f5acb00e8de4f07f"),
    ] {
        let s = ShotSpec::parse_kv(line).unwrap();
        assert!(s.flat.is_none());
        let r = run_shot(&s);
        assert_eq!(format!("{:016x}", r.hash), want, "{line}");
        assert!(r.flat.is_none() && !r.to_json().contains("\"flat\""));
    }
    let s = ShotSpec::parse_kv("n=8 seed=2 pose=flat q=0.85 w=120 t0=0.1 a=top rel=top max_after=1.5").unwrap();
    let a = run_shot(&s);
    let b = run_shot(&s);
    assert_eq!(a.hash, b.hash);
    let f = a.flat.as_ref().unwrap();
    assert!((f.a_deg - f.alpha_top - 0.5).abs() < 1e-12);
    assert!((f.d - (0.1 + f.a_deg / 120.0 + 0.04)).abs() < 1e-9);
    assert!(a.to_json().contains("\"flat\":{"));
    // 원시 입력 자세 코드 3(평평한 바닥)은 원시 입력 계약(PvP 기록) 밖 → from_bytes 가 거부
    let raw = BreathSpec::puff(1.0).to_raw(Pose::Flat, 0.0, 0.5);
    assert!(puff_v2::breath::RawInput::from_bytes(&raw.to_bytes()).is_none());
    // 조용히 무시되던 키 조합은 오류: 평평한 바닥 키 + 다른 자세, pose=flat + 원시 숨 키, w>0 인데 a 없음, a=top 없이 ax, rel=top 없이 relx
    for bad in [
        "n=8 seed=2 pose=chin q=0.85 rel=0.8",
        "n=8 seed=2 pose=eye q=0.85 w=120 t0=0.1 a=top",
        "n=8 seed=2 tilt=1",
        "n=8 seed=2 pose=flat breath=pueok dur=0.8 q=0.85",
        "n=8 seed=2 pose=flat q=0.85 sweep=9 rel=0.6",
        "n=8 seed=2 pose=flat q=0.85 w=120 t0=0.1 rel=top",
        "n=8 seed=2 pose=flat q=0.85 w=120 a=10 ax=1 rel=0.6",
        "n=8 seed=2 pose=flat q=0.85 rel=0.6 relx=0.1",
    ] {
        assert!(ShotSpec::parse_kv(bad).is_err(), "오류여야 함: {bad}");
    }
    assert!(ShotSpec::parse_kv("n=8 seed=2 pose=flat q=0.85 w=100000 t0=0 a=top ax=-1 rel=0.6 tk=2.1 mk=2.1 cp_in=0.56 f2=2").is_ok());
    // 두께 배율: 명목 높이가 그 배율만큼, 열쇠가 달라짐
    let mut p2 = PileParams::new(30, 11);
    p2.thick_scale = 1.5;
    p2.mass_scale = 1.5;
    let l1 = puff_v2::pile::make_layout(&PileParams::new(30, 11));
    let l2 = puff_v2::pile::make_layout(&p2);
    assert!((l2.nominal / l1.nominal - 1.5).abs() < 1e-9);
    assert!((l2.props[0].mass / l1.props[0].mass - 1.5).abs() < 1e-12);
    assert_ne!(p2.key(), PileParams::new(30, 11).key());
}
