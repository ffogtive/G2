//! 앱(dart:ffi) 연결용 C ABI 테스트 — 구조체 없는 길이 구조체 길·Table 직접 호출과 같은 해시를 내는가.
//!  - puff_fire_v  ≡ fire_turn(Table) ≡ (resolve_shot → set_rng_state → puff_blow_v)  ← Dart 가 실제로 하는 순서
//!  - puff_blow_v  ≡ puff_blow(구조체, dist 2.6 · pitch 0.1)
//!  - puff_settle_begin/step 을 스텝마다 ≡ puff_settle(600)
//!  - puff_resolve_v ≡ rules::resolve_shot, puff_info ≡ 개별 읽기 함수

use puff_sim::ffi::*;
use puff_sim::rng::Mulberry32;
use puff_sim::rules::{resolve_shot, sweet_hi_for, Shot};
use puff_sim::{aim_point, fire_turn, Table};

unsafe fn res(p: *const f64) -> [f64; PUFF_RES_LEN] {
    let mut o = [0.0; PUFF_RES_LEN];
    o.copy_from_slice(core::slice::from_raw_parts(p, PUFF_RES_LEN));
    o
}

unsafe fn pile(seed: u32, n: u32) -> *mut PuffSim {
    let s = puff_new(seed);
    puff_add_pile(s, n, 0.07, 0.0, 0.0, 0);
    puff_settle(s, 600);
    s
}

unsafe fn judge_steps(s: *mut PuffSim) -> u32 {
    let mut k = 0;
    while puff_step_judge(s) == 0 {
        k += 1;
        assert!(k < 700);
    }
    k
}

/// (층 k, lat, 숨 비율) — 초록 · 옆 · 가운데 · 약함 · 돌풍(넘쳐서 gauss 흔들림) · 센 돌풍
const SHOTS: &[(u32, f64, f64)] = &[(2, 0.0, 0.9), (2, 0.45, 0.95), (6, 0.0, 0.85), (0, 0.0, 0.55), (2, 0.0, 1.15), (2, -0.4, 1.32)];

#[test]
fn fire_v_equals_dart_order() {
    for (i, &(k, lat, ratio)) in SHOTS.iter().enumerate() {
        let seed = 100 + i as u32;
        let puff_seed = 7000 + i as u32;
        unsafe {
            // 길 A: 한 번에 (Rust fire_turn)
            let a = pile(seed, 16);
            let h = puff_layer_y(a, k);
            let breath = ratio * puff_sweet_hi_for(16);
            let ra = res(puff_fire_v(a, lat, h, breath, 0.0, -1.0, 0.0, 0, puff_seed));
            // 길 B: Dart 가 하는 순서 — 숨 해석(puff_resolve_v 를 Dart 포팅 대신) → 난수 넘기기 → 조준 기하 → puff_blow_v
            let b = pile(seed, 16);
            let info = core::slice::from_raw_parts(puff_info(b), PUFF_INFO_LEN).to_vec();
            let rb = res(puff_resolve_v(b, info[3] as u32, info[0], lat, h, breath, puff_seed));
            puff_set_rng_state(b, rb[9] as u32);
            let lat_c = rb[3].clamp(-0.95, 0.95);
            let aim = aim_point((info[1], info[2]), (0.0, -1.0), lat_c, rb[4]);
            assert_eq!(puff_blow_v(b, aim.x, aim.y, aim.z, 0.0, -1.0, rb[1], rb[2], 0.0, 0), 1);
            for j in 0..5 {
                assert_eq!(ra[j].to_bits(), rb[j].to_bits(), "shot {i} 칸 {j}");
            }
            assert_eq!((ra[6], ra[7], ra[8]), (aim.x, aim.y, aim.z), "shot {i} 조준점");
            assert_eq!(puff_rng_state(a), puff_rng_state(b), "shot {i} blow 뒤 난수");
            let (sa, sb) = (judge_steps(a), judge_steps(b));
            assert_eq!((sa, puff_state_hash(a)), (sb, puff_state_hash(b)), "shot {i}");
            if ratio > 1.0 {
                assert_eq!(ra[5], 1.0, "넘침 표시");
            }
            // 길 C: Table 직접
            let mut t = Table::new(seed);
            t.add_pile(16, 0.07, (0.0, 0.0), &[]);
            t.settle(600);
            let ys = t.layer_ys();
            let (r, _) = fire_turn(&mut t, Shot { lat, h: ys[k as usize], power: breath }, (0.0, -1.0), None, puff_seed);
            assert_eq!(r.power.to_bits(), ra[1].to_bits());
            let mut js = puff_sim::table::JudgeState::default();
            let mut n = 0;
            loop {
                t.step();
                if t.step_judge(&mut js) {
                    break;
                }
                n += 1;
            }
            assert_eq!((n, t.state_hash()), (sa, puff_state_hash(a)), "shot {i} Table 길");
            puff_free(a);
            puff_free(b);
        }
    }
}

#[test]
fn blow_v_equals_struct_blow() {
    unsafe {
        let a = pile(5, 12);
        let b = pile(5, 12);
        let args = PuffBlowArgs { aim_x: 0.1, aim_y: puff_layer_y(a, 2), aim_z: 0.95, dir_x: 0.0, dir_z: -1.0, power: 0.95, blast: 0.2, dist: 2.6, pitch: 0.1, mouth_y: 0.0, use_mouth_y: 0 };
        puff_blow(a, &args);
        puff_blow_v(b, args.aim_x, args.aim_y, args.aim_z, 0.0, -1.0, 0.95, 0.2, 0.0, 0);
        assert_eq!((judge_steps(a), puff_state_hash(a)), (judge_steps(b), puff_state_hash(b)));
        // 입술 높이 길도
        puff_restack(a, 0.0, 0.0);
        puff_restack(b, 0.0, 0.0);
        puff_settle(a, 600);
        puff_settle(b, 600);
        let lip = PuffBlowArgs { use_mouth_y: 1, mouth_y: 0.15, ..args };
        puff_blow(a, &lip);
        puff_blow_v(b, args.aim_x, args.aim_y, args.aim_z, 0.0, -1.0, 0.95, 0.2, 0.15, 1);
        assert_eq!((judge_steps(a), puff_state_hash(a)), (judge_steps(b), puff_state_hash(b)));
        puff_free(a);
        puff_free(b);
    }
}

#[test]
fn settle_step_equals_settle() {
    for (seed, n) in [(1u32, 20u32), (9, 7), (4, 1)] {
        unsafe {
            let a = puff_new(seed);
            let b = puff_new(seed);
            puff_add_pile(a, n, 0.07, 0.0, 0.0, 0);
            puff_add_pile(b, n, 0.07, 0.0, 0.0, 0);
            let sa = puff_settle(a, 600);
            puff_settle_begin(b);
            let mut sb = 0;
            while puff_settle_step(b, 600) == 0 {
                sb += 1;
            }
            assert_eq!((sa, puff_state_hash(a)), (sb, puff_state_hash(b)), "seed {seed} n {n}");
            // 다 끝난 뒤 더 부르면 스텝을 안 한다
            let h = puff_state_hash(b);
            puff_settle_begin(b);
            puff_settle_step(b, 0);
            assert_eq!(puff_state_hash(b), h);
            puff_free(a);
            puff_free(b);
        }
    }
}

#[test]
fn resolve_v_and_info() {
    unsafe {
        let s = pile(3, 20);
        let mut rng = Mulberry32::new(1);
        for i in 0..2000u32 {
            let n = 1 + (rng.next_f64() * 30.0) as u32;
            let top = 0.1 + rng.next_f64() * 2.0;
            let lat = rng.next_f64() * 1.8 - 0.9;
            let h = rng.next_f64() * top;
            let breath = rng.next_f64() * 1.25;
            let st = (rng.next_f64() * 4294967296.0) as u32;
            let r = res(puff_resolve_v(s, n, top, lat, h, breath, st));
            let mut g = Mulberry32::new(st);
            let w = resolve_shot(Shot { lat, h, power: breath }, n as usize, top, &mut g, 1.0);
            assert_eq!([r[0], r[1], r[2], r[3], r[4]].map(f64::to_bits), [w.ratio, w.power, w.blast, w.lat, w.h].map(f64::to_bits), "case {i}");
            assert_eq!((r[5] != 0.0, r[9] as u32), (w.over, g.state()));
        }
        let info = core::slice::from_raw_parts(puff_info(s), PUFF_INFO_LEN);
        assert_eq!(info[0], puff_column_top(s));
        assert_eq!(info[3], 20.0);
        let mut c = [0.0; 2];
        puff_pile_center(s, c.as_mut_ptr());
        assert_eq!((info[1], info[2]), (c[0], c[1]));
        assert_eq!(info[6], 0.0);
        let p0 = puff_info(s);
        puff_step(s, 3);
        assert_eq!(p0, puff_info(s), "info 버퍼 주소 고정");
        assert!((sweet_hi_for(20) - 0.95).abs() < 1e-12);
        puff_free(s);
    }
}

#[test]
fn new_exports_null_safe() {
    unsafe {
        let n = core::ptr::null_mut();
        assert_eq!(puff_blow_v(n, 0.0, 0.0, 0.0, 0.0, -1.0, 1.0, 0.0, 0.0, 0), 0);
        assert!(puff_fire_v(n, 0.0, 0.1, 0.5, 0.0, -1.0, 0.0, 0, 1).is_null());
        assert!(puff_resolve_v(n, 3, 0.3, 0.0, 0.1, 0.5, 1).is_null());
        assert!(puff_info(n).is_null());
        assert_eq!(puff_rng_state(n), 0);
        puff_set_rng_state(n, 5);
        puff_settle_begin(n);
        assert_eq!(puff_settle_step(n, 10), 1);
        assert_eq!(puff_math_v(0, 1.0), 0.0);
        assert!(puff_math_v(99, 1.0).is_nan());
        let v = core::ffi::CStr::from_ptr(puff_version_cstr()).to_str().unwrap();
        assert_eq!(v, puff_sim::sim_version());
        assert_eq!(puff_version_cstr(), puff_version_cstr(), "정적 주소");
    }
}
