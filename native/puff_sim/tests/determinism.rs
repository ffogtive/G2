//! 결정성·FFI 테스트.
//!  - 같은 시드·같은 입력 → 같은 해시 (한 프로세스 안에서 두 번, Table 과 C ABI 두 길)
//!  - 다른 시드 → 다른 해시
//!  - 황금 해시: x86_64 리눅스에서 잰 값. arm64(iOS·안드로이드)·wasm32 에서 돌려도 같아야 한다 = 기기 간 PvP 계약.
//!    TUNE 기본값·바람 모델·rapier 버전을 바꾸면 달라지는 게 맞다 → 그때는 값을 새로 박고 PvP simVersion 도 올린다.

use puff_sim::ffi::*;
use puff_sim::rng::Mulberry32;
use puff_sim::rules::{resolve_shot, sweet_hi_for, Shot};
use puff_sim::{aim_point, BlowArgs, Table};

/// 한 판 시나리오: 쌓기 → settle → (기본 경로 초록 숨, 옆 0.2) → 가져가기·다시 쌓기 → (책상 입 + 돌풍)
fn scenario(seed: u32, n: usize) -> Vec<u64> {
    let mut h = Vec::new();
    let mut t = Table::new(seed);
    t.add_pile(n, 0.07, (0.0, 0.0), &[]);
    h.push(t.state_hash());
    t.settle(600);
    h.push(t.state_hash());
    let ys = t.layer_ys();
    let c = t.pile_center();
    let sh = resolve_shot(Shot { lat: 0.2, h: ys[(n - 1).min(2)], power: sweet_hi_for(n) * 0.9 }, n, t.column_top(), &mut Mulberry32::new(seed), 1.0);
    t.blow(&BlowArgs::new(aim_point(c, (0.0, -1.0), sh.lat, sh.h), 0.0, -1.0, sh.power, sh.blast));
    for _ in 0..16 {
        t.step();
    }
    h.push(t.state_hash());
    t.run_until_settled(4.0);
    h.push(t.state_hash());
    for id in t.flipped_ids() {
        t.remove(id);
    }
    t.restack((0.0, 0.0));
    t.settle(600);
    h.push(t.state_hash());
    let live = t.live_ids().len();
    if live > 0 {
        let ys = t.layer_ys();
        let c = t.pile_center();
        let sh = resolve_shot(Shot { lat: -0.3, h: ys[(live - 1) / 2], power: sweet_hi_for(live) * 1.1 }, live, t.column_top(), &mut Mulberry32::new(seed ^ 0x55), 1.0);
        let mut b = BlowArgs::new(aim_point(c, (1.0, 0.0), sh.lat, sh.h), 1.0, 0.0, sh.power, sh.blast);
        b.mouth_y = Some(0.15);
        t.blow(&b);
        t.run_until_settled(4.0);
        h.push(t.state_hash());
    }
    h
}

#[test]
fn same_seed_same_hashes() {
    for (seed, n) in [(1u32, 1usize), (7, 12), (42, 20), (9, 30)] {
        let a = scenario(seed, n);
        let b = scenario(seed, n);
        assert_eq!(a, b, "seed {seed} n {n}");
    }
}

#[test]
fn different_seed_different_hashes() {
    assert_ne!(scenario(7, 12), scenario(8, 12));
}

/// C ABI 길도 같은 결과(같은 해시) — dart:ffi 가 보게 될 그대로
#[test]
fn ffi_roundtrip_deterministic() {
    let run = || unsafe {
        let s = puff_new(1234);
        assert_eq!(puff_add_pile(s, 14, 0.07, 0.0, 0.0, 0b100), 14);
        puff_settle(s, 600);
        let h0 = puff_state_hash(s);
        let a = PuffShotArgs { lat: 0.1, h: puff_layer_y(s, 2), breath: 0.9 * puff_sweet_hi_for(14), dir_x: 0.0, dir_z: -1.0, mouth_y: 0.0, use_mouth_y: 0, shake_seed: 5 };
        let mut r = PuffShotResult::default();
        assert_eq!(puff_shot(s, &a, &mut r), 1);
        assert!((r.ratio - 0.9).abs() < 1e-12 && r.blast == 0.0);
        let mut steps = 0;
        while puff_step_judge(s) == 0 {
            steps += 1;
            assert!(steps < 700);
        }
        let mut buf = vec![0f32; 14 * PUFF_FLOATS_PER_DISC as usize];
        assert_eq!(puff_transforms(s, buf.as_mut_ptr(), buf.len() as u32), 14);
        let mut j = PuffJudge::default();
        puff_judge(s, &mut j);
        let flags: Vec<u32> = buf.chunks(8).map(|c| c[7] as u32).collect();
        assert_eq!(flags.iter().filter(|&&f| f & PUFF_FLAG_FACE_UP != 0 && f & PUFF_FLAG_IN_CIRCLE != 0).count() as u32, j.flipped);
        assert_eq!(flags[2] & PUFF_FLAG_HEAVY, PUFF_FLAG_HEAVY);
        let taken = puff_take_flipped(s);
        assert_eq!(taken, j.flipped);
        puff_restack(s, 0.0, 0.0);
        puff_settle(s, 600);
        let h1 = puff_state_hash(s);
        puff_free(s);
        (h0, steps, h1, j.flipped)
    };
    assert_eq!(run(), run());
}

#[test]
fn ffi_null_safe() {
    unsafe {
        let n = core::ptr::null_mut();
        assert_eq!(puff_settle(n, 10), 0);
        assert_eq!(puff_state_hash(n), 0);
        assert_eq!(puff_step(n, 3), 0);
        puff_free(n);
        let mut buf = [0 as core::ffi::c_char; 128];
        let len = puff_version(buf.as_mut_ptr(), buf.len() as u32);
        assert!(len > 10);
        assert_eq!(puff_set_tune(n, c"lift".as_ptr(), 1.0), 0);
        let s = puff_new(1);
        assert_eq!(puff_set_tune(s, c"nope".as_ptr(), 1.0), 0);
        assert_eq!(puff_set_tune(s, c"lift".as_ptr(), 500.0), 1);
        puff_free(s);
    }
}

/// 기기 간 계약: x86_64 리눅스(release·debug 같음)에서 잰 값. 다른 아키텍처에서 이 테스트가 깨지면 그 빌드가 어긋난 것
#[test]
fn golden_cross_platform() {
    let got = scenario(7, 20);
    let want: &[u64] = GOLDEN_7_20;
    if want.is_empty() {
        eprintln!("황금 해시 미등록: {:#018x?}", got);
        return;
    }
    assert_eq!(got, want, "황금 해시 불일치 — TUNE·바람 모델·rapier 를 바꿨다면 새 값으로 갱신 (PvP 버전도 올릴 것)");
}

/// x86_64 리눅스 release 에서 잼 (2026-10-13, TUNE 기본값 = parity 로 맞춘 값). aarch64(qemu)·wasm32(node WASI) 에서 같은 값 확인
const GOLDEN_7_20: &[u64] = &[0x83e541126c2dca4d, 0xcee1fe30aa27edc7, 0xcafdbea663408bd3, 0xd88f6bafa5733029, 0xfa1523edcaccf740, 0xe166a6b286925554];
