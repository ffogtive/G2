//! C ABI — dart:ffi(안드로이드 .so / iOS 정적 링크) · Swift · Kotlin 공용. 헤더: include/puff_sim.h
//!
//! 규칙
//!  - 핸들은 불투명 포인터(`PuffSim*`). puff_new 로 만들고 puff_free 로 지운다. 스레드 하나에서만 쓴다(동기화 없음).
//!  - 모든 함수는 null 핸들을 받으면 아무것도 안 하고 0/false 를 돌려준다.
//!  - 좌표는 sim.js 와 같다(딱지 반지름 1, +Y 위, 분필 원 r = 3.2). 출력 버퍼는 f32, 입력 실수는 f64.
//!  - 결정성: 같은 seed·같은 호출 순서 → 같은 puff_state_hash (x86·ARM·WASM 공통, enhanced-determinism).

use crate::rules::{self, Shot};
use crate::rng::Mulberry32;
use crate::table::{BlowArgs, JudgeState, Table, V3};
use core::ffi::{c_char, CStr};

pub struct PuffSim {
    table: Table,
    judge: JudgeState,
    /// puff_frame 이 채우는 자세 버퍼 (딱지마다 f32 8개). Dart 는 포인터를 asTypedList 로 복사 없이 읽는다
    frame: Vec<f32>,
    /// puff_info 가 채우는 판 상태 (PUFF_INFO_*). 핸들이 살아 있는 동안 주소가 안 바뀐다 → Dart 는 한 번 만든 뷰를 계속 본다
    info: [f64; PUFF_INFO_LEN],
    /// puff_fire_v · puff_resolve_v 결과 (PUFF_RES_*). 주소 고정
    res: [f64; PUFF_RES_LEN],
    /// puff_settle_step 의 진행 칸 (puff_settle 을 프레임마다 나눠 부르기)
    settle_i: u32,
}

/// puff_info 칸: 꼭대기 y · 더미 중심 x·z · 살아 있는 수 · 뒤집힘 · 원 밖 · 바람 부는 중 · 최대 속도 · 판정 스텝 · 전체 스텝 · 시각(초)
pub const PUFF_INFO_LEN: usize = 12;
/// puff_fire_v / puff_resolve_v 칸: 비율 · 물리 세기 · 돌풍 · lat · h · 넘침(0/1) · 조준점 x·y·z · 소비 뒤 난수 상태
pub const PUFF_RES_LEN: usize = 10;

/// 블로우 인자 (sim.js blow 와 같음). use_mouth_y ≠ 0 이면 9차 '입술 높이' 경로(mouth_y = 입 절대 높이)
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct PuffBlowArgs {
    pub aim_x: f64,
    pub aim_y: f64,
    pub aim_z: f64,
    pub dir_x: f64,
    pub dir_z: f64,
    pub power: f64,
    pub blast: f64,
    pub dist: f64,
    pub pitch: f64,
    pub mouth_y: f64,
    pub use_mouth_y: u32,
}

/// 게임 샷(숨 규칙 + 조준 기하 + 블로우를 한 번에). breath = 손가락이 정한 숨(rules.js power, 정답 = sweetHiFor(n)).
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct PuffShotArgs {
    pub lat: f64,
    /// 노릴 높이(절대 y)
    pub h: f64,
    pub breath: f64,
    pub dir_x: f64,
    pub dir_z: f64,
    pub mouth_y: f64,
    pub use_mouth_y: u32,
    /// 숨이 넘칠 때 조준 흔들림용 난수 시드 (rules.js resolveShot rng)
    pub shake_seed: u32,
}

/// 샷 해석 결과 (rules.js resolveShot)
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct PuffShotResult {
    pub ratio: f64,
    pub power: f64,
    pub blast: f64,
    pub lat: f64,
    pub h: f64,
    pub over: u32,
    pub aim_x: f64,
    pub aim_y: f64,
    pub aim_z: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct PuffJudge {
    /// 원 안에서 그림이 위 = 뒤집힘
    pub flipped: u32,
    /// 원 밖(책상 밖 포함) = 무효
    pub outs: u32,
    pub live: u32,
    pub puff_active: u32,
    pub max_speed: f64,
}

/// 딱지 한 장 렌더 정보: 자세(7) + 플래그(1) = f32 8개
pub const PUFF_FLOATS_PER_DISC: u32 = 8;
pub const PUFF_FLAG_REMOVED: u32 = 1;
pub const PUFF_FLAG_OFF: u32 = 2;
pub const PUFF_FLAG_FACE_UP: u32 = 4;
pub const PUFF_FLAG_IN_CIRCLE: u32 = 8;
pub const PUFF_FLAG_HEAVY: u32 = 16;
pub const PUFF_FLAG_WIND: u32 = 32;

#[inline]
unsafe fn sim<'a>(p: *mut PuffSim) -> Option<&'a mut PuffSim> {
    p.as_mut()
}

#[no_mangle]
pub extern "C" fn puff_new(seed: u32) -> *mut PuffSim {
    Box::into_raw(Box::new(PuffSim {
        table: Table::new(seed),
        judge: JudgeState::default(),
        frame: Vec::new(),
        info: [0.0; PUFF_INFO_LEN],
        res: [0.0; PUFF_RES_LEN],
        settle_i: 0,
    }))
}

/// # Safety
/// `p` 는 puff_new 가 준 포인터(또는 null). 두 번 지우면 안 된다.
#[no_mangle]
pub unsafe extern "C" fn puff_free(p: *mut PuffSim) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}

/// TUNE 손잡이 바꾸기 (이름 = sim.js camelCase 또는 snake_case). 더미를 쌓기 전에 부를 것. 성공 1, 모르는 이름 0
/// # Safety
/// `key` 는 NUL 로 끝나는 문자열.
#[no_mangle]
pub unsafe extern "C" fn puff_set_tune(p: *mut PuffSim, key: *const c_char, value: f64) -> u32 {
    let (Some(s), false) = (sim(p), key.is_null()) else { return 0 };
    let Ok(k) = CStr::from_ptr(key).to_str() else { return 0 };
    if !s.table.t.set(k, value) {
        return 0;
    }
    s.table.apply_solver();
    1
}

/// 원기둥 더미 n 장. heavy_mask 의 i 번째 비트 = i 번째 딱지가 테이프 딱지(밀도 ×3). 반환: 전체 딱지 수
/// # Safety
/// `p` 는 유효한 핸들 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_add_pile(p: *mut PuffSim, n: u32, spread: f64, at_x: f64, at_z: f64, heavy_mask: u64) -> u32 {
    let Some(s) = sim(p) else { return 0 };
    let heavy: Vec<bool> = (0..n).map(|i| i < 64 && (heavy_mask >> i) & 1 == 1).collect();
    s.table.add_pile(n as usize, spread, (at_x, at_z), &heavy);
    s.table.discs.len() as u32
}

/// # Safety
/// `p` 는 유효한 핸들 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_settle(p: *mut PuffSim, max_steps: u32) -> u32 {
    sim(p).map_or(0, |s| s.table.settle(max_steps))
}

/// # Safety
/// `p` 유효 또는 null, `a` 유효한 PuffBlowArgs 포인터.
#[no_mangle]
pub unsafe extern "C" fn puff_blow(p: *mut PuffSim, a: *const PuffBlowArgs) -> u32 {
    let (Some(s), Some(a)) = (sim(p), a.as_ref()) else { return 0 };
    let mut b = BlowArgs::new(V3::new(a.aim_x, a.aim_y, a.aim_z), a.dir_x, a.dir_z, a.power, a.blast);
    if a.dist > 0.0 {
        b.dist = a.dist;
    }
    b.pitch = a.pitch;
    if a.use_mouth_y != 0 {
        b.mouth_y = Some(a.mouth_y);
    }
    s.table.blow(&b);
    s.judge = JudgeState::default();
    1
}

/// 게임 샷: resolveShot(숨 → 물리 세기·돌풍·흔들림) + 조준점(c − D·√(1−lat²) + side·lat) + blow
/// # Safety
/// 포인터는 유효하거나 null.
#[no_mangle]
pub unsafe extern "C" fn puff_shot(p: *mut PuffSim, a: *const PuffShotArgs, out: *mut PuffShotResult) -> u32 {
    let (Some(s), Some(a)) = (sim(p), a.as_ref()) else { return 0 };
    let live = s.table.live_ids().len();
    let top = s.table.column_top();
    let mut rng = Mulberry32::new(a.shake_seed);
    let r = rules::resolve_shot(Shot { lat: a.lat, h: a.h, power: a.breath }, live, top, &mut rng, 1.0);
    let c = s.table.pile_center();
    let dl = libm::sqrt(a.dir_x * a.dir_x + a.dir_z * a.dir_z);
    let dir = if dl > 0.0 { (a.dir_x / dl, a.dir_z / dl) } else { (0.0, -1.0) };
    let aim = crate::aim_point(c, dir, r.lat, r.h);
    let mut b = BlowArgs::new(aim, dir.0, dir.1, r.power, r.blast);
    if a.use_mouth_y != 0 {
        b.mouth_y = Some(a.mouth_y);
    }
    s.table.blow(&b);
    s.judge = JudgeState::default();
    if let Some(o) = out.as_mut() {
        *o = PuffShotResult {
            ratio: r.ratio,
            power: r.power,
            blast: r.blast,
            lat: r.lat,
            h: r.h,
            over: r.over as u32,
            aim_x: aim.x,
            aim_y: aim.y,
            aim_z: aim.z,
        };
    }
    1
}

/// n 스텝 진행(1스텝 = 1/120초). 반환: 바람이 아직 부는가(1/0)
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_step(p: *mut PuffSim, n: u32) -> u32 {
    let Some(s) = sim(p) else { return 0 };
    for _ in 0..n {
        s.table.step();
    }
    s.table.puff.is_some() as u32
}

/// 스텝 + PvP 스텝 판정(sim.js stepJudge; 블로우 때 초기화). 판정 순간이면 1
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_step_judge(p: *mut PuffSim) -> u32 {
    let Some(s) = sim(p) else { return 0 };
    s.table.step();
    let mut j = s.judge;
    let done = s.table.step_judge(&mut j);
    s.judge = j;
    done as u32
}

/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_run_until_settled(p: *mut PuffSim, max_sec: f64) -> u32 {
    sim(p).map_or(0, |s| s.table.run_until_settled(max_sec))
}

/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_disc_count(p: *mut PuffSim) -> u32 {
    sim(p).map_or(0, |s| s.table.discs.len() as u32)
}

/// 딱지 자세를 f32 버퍼로: 딱지마다 [px, py, pz, qx, qy, qz, qw, flags]. cap = 버퍼 f32 개수. 반환: 쓴 딱지 수
/// flags 는 f32 로 담은 정수 비트(PUFF_FLAG_*)
/// # Safety
/// `out` 은 cap 개 f32 를 쓸 수 있는 버퍼.
#[no_mangle]
pub unsafe extern "C" fn puff_transforms(p: *mut PuffSim, out: *mut f32, cap: u32) -> u32 {
    let (Some(s), false) = (sim(p), out.is_null()) else { return 0 };
    let n = (s.table.discs.len() as u32).min(cap / PUFF_FLOATS_PER_DISC);
    let buf = core::slice::from_raw_parts_mut(out, (n * PUFF_FLOATS_PER_DISC) as usize);
    write_transforms(&s.table, buf)
}

/// 자세 버퍼 채우기 (buf 길이 / 8 장까지). 반환: 쓴 딱지 수
fn write_transforms(t: &Table, buf: &mut [f32]) -> u32 {
    let n = (t.discs.len()).min(buf.len() / PUFF_FLOATS_PER_DISC as usize);
    for i in 0..n {
        let d = &t.discs[i];
        let o = &mut buf[i * 8..i * 8 + 8];
        let mut flags = 0u32;
        if d.removed {
            flags |= PUFF_FLAG_REMOVED;
            o[..7].copy_from_slice(&[0.0, -10.0, 0.0, 0.0, 0.0, 0.0, 1.0]);
        } else {
            let b = &t.world.bodies[d.body];
            let tr = b.translation();
            let r = b.rotation();
            o[..7].copy_from_slice(&[tr.x, tr.y, tr.z, r.x, r.y, r.z, r.w]);
            if d.off {
                flags |= PUFF_FLAG_OFF;
            }
            if t.face_up(i) > 0.2 {
                flags |= PUFF_FLAG_FACE_UP;
            }
            if t.in_circle(i) {
                flags |= PUFF_FLAG_IN_CIRCLE;
            }
        }
        if d.heavy {
            flags |= PUFF_FLAG_HEAVY;
        }
        if t.last_hits.iter().any(|h| h.id == i) {
            flags |= PUFF_FLAG_WIND;
        }
        o[7] = flags as f32;
    }
    n as u32
}

/// 이번 프레임 자세 버퍼를 새로 채우고 그 포인터를 준다 — malloc 없이 쓰는 길(dart:ffi 용).
/// 딱지마다 [px, py, pz, qx, qy, qz, qw, flags] (puff_disc_count 장). 다음 puff_frame·puff_free 전까지 유효
/// # Safety
/// `p` 유효 또는 null(이면 null 반환).
#[no_mangle]
pub unsafe extern "C" fn puff_frame(p: *mut PuffSim) -> *const f32 {
    let Some(s) = sim(p) else { return core::ptr::null() };
    let n = s.table.discs.len();
    s.frame.resize(n * PUFF_FLOATS_PER_DISC as usize, 0.0);
    write_transforms(&s.table, &mut s.frame);
    s.frame.as_ptr()
}

/// 구조체 없이 부르는 게임 샷 (dart:ffi 에서 malloc 없이). 반환: 숨 비율(정답 대비; 1 초과 = 돌풍)
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn puff_shot_v(p: *mut PuffSim, lat: f64, h: f64, breath: f64, dir_x: f64, dir_z: f64, mouth_y: f64, use_mouth_y: u32, shake_seed: u32) -> f64 {
    let a = PuffShotArgs { lat, h, breath, dir_x, dir_z, mouth_y, use_mouth_y, shake_seed };
    let mut r = PuffShotResult::default();
    if puff_shot(p, &a, &mut r) == 0 {
        return 0.0;
    }
    r.ratio
}

/// 원 안에서 뒤집힌 장수 (구조체 없이)
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_flipped_count(p: *mut PuffSim) -> u32 {
    sim(p).map_or(0, |s| s.table.flipped_ids().len() as u32)
}

/// 원 밖(책상 밖 포함) 장수 (구조체 없이)
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_out_count(p: *mut PuffSim) -> u32 {
    sim(p).map_or(0, |s| s.table.out_ids().len() as u32)
}

/// 판정 (main.js simulate / sim.js judgeResult 와 같은 규칙)
/// # Safety
/// `out` 유효한 PuffJudge 포인터.
#[no_mangle]
pub unsafe extern "C" fn puff_judge(p: *mut PuffSim, out: *mut PuffJudge) -> u32 {
    let (Some(s), Some(o)) = (sim(p), out.as_mut()) else { return 0 };
    let t = &s.table;
    *o = PuffJudge {
        flipped: t.flipped_ids().len() as u32,
        outs: t.out_ids().len() as u32,
        live: t.live_ids().len() as u32,
        puff_active: t.puff.is_some() as u32,
        max_speed: t.max_speed(),
    };
    1
}

/// 뒤집힌 딱지(원 안·그림 위)를 가져가고(제거) 원 밖 딱지는 남겨 둔다. 반환: 가져간 수
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_take_flipped(p: *mut PuffSim) -> u32 {
    let Some(s) = sim(p) else { return 0 };
    let ids = s.table.flipped_ids();
    for &id in &ids {
        s.table.remove(id);
    }
    ids.len() as u32
}

/// 남은 딱지를 (x, z) 에 다시 원기둥으로 (원 밖·책상 밖 딱지 회수 포함)
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_restack(p: *mut PuffSim, at_x: f64, at_z: f64) {
    if let Some(s) = sim(p) {
        s.table.restack((at_x, at_z));
    }
}

/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_column_top(p: *mut PuffSim) -> f64 {
    sim(p).map_or(0.0, |s| s.table.column_top())
}

/// 위에서 k 번째(0 = 맨 위) 살아 있는 딱지의 중심 높이. 없으면 -1
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_layer_y(p: *mut PuffSim, k: u32) -> f64 {
    sim(p).and_then(|s| s.table.layer_ys().get(k as usize).copied()).unwrap_or(-1.0)
}

/// 더미 중심 (x, z) → out[0], out[1]
/// # Safety
/// `out` 은 f64 2개 버퍼.
#[no_mangle]
pub unsafe extern "C" fn puff_pile_center(p: *mut PuffSim, out: *mut f64) -> u32 {
    let (Some(s), false) = (sim(p), out.is_null()) else { return 0 };
    let (x, z) = s.table.pile_center();
    *out = x;
    *out.add(1) = z;
    1
}

/// 상태 해시(FNV-1a 64, 자세·속도 f32 비트). PvP 양쪽 대조용
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_state_hash(p: *mut PuffSim) -> u64 {
    sim(p).map_or(0, |s| s.table.state_hash())
}

/// 정답 숨(rules.js sweetHiFor) — 초록 = 0.78~1.0 배
#[no_mangle]
pub extern "C" fn puff_sweet_hi_for(n: u32) -> f64 {
    rules::sweet_hi_for(n as usize)
}

// ── 앱(dart:ffi) 연결용: 구조체·malloc 없이, 결과는 핸들이 들고 있는 고정 버퍼로 ──────────────

/// 구조체 없이 부르는 blow. dist 2.6 · pitch 0.1 = 게임 기본(BlowArgs::new). use_mouth_y ≠ 0 이면 9차 입술 높이 경로
/// 앱은 숨 해석(resolveShot)을 Dart 에서 하고 물리 세기·돌풍·조준점만 여기로 넘긴다.
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn puff_blow_v(p: *mut PuffSim, aim_x: f64, aim_y: f64, aim_z: f64, dir_x: f64, dir_z: f64, power: f64, blast: f64, mouth_y: f64, use_mouth_y: u32) -> u32 {
    let Some(s) = sim(p) else { return 0 };
    let mut b = BlowArgs::new(V3::new(aim_x, aim_y, aim_z), dir_x, dir_z, power, blast);
    if use_mouth_y != 0 {
        b.mouth_y = Some(mouth_y);
    }
    s.table.blow(&b);
    s.judge = JudgeState::default();
    1
}

/// 한 턴 쏘기(turn.js ShotRun.fire 순서: puff_seed 줄기로 숨 해석 → 같은 줄기를 판 난수로 → 조준 → blow).
/// 반환: 핸들의 결과 버퍼 [비율, 물리 세기, 돌풍, lat, h, 넘침, 조준 x, y, z, 난수 상태] (PUFF_RES_LEN 개, 다음 fire/resolve 까지 유효). null 핸들이면 null
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn puff_fire_v(p: *mut PuffSim, lat: f64, h: f64, breath: f64, dir_x: f64, dir_z: f64, mouth_y: f64, use_mouth_y: u32, puff_seed: u32) -> *const f64 {
    let Some(s) = sim(p) else { return core::ptr::null() };
    let my = if use_mouth_y != 0 { Some(mouth_y) } else { None };
    let (r, aim) = crate::fire_turn(&mut s.table, Shot { lat, h, power: breath }, (dir_x, dir_z), my, puff_seed);
    s.judge = JudgeState::default();
    s.res = [r.ratio, r.power, r.blast, r.lat, r.h, r.over as u32 as f64, aim.x, aim.y, aim.z, s.table.rng.state() as f64];
    s.res.as_ptr()
}

/// 숨 해석만(물리 안 건드림) — Dart 포팅(app/lib/native/rules.dart resolveShot)과 비트 대조하는 기준.
/// n = 살아 있는 장수, top = 꼭대기 y, rng_state = mulberry32 상태. 반환: 결과 버퍼 [비율, 세기, 돌풍, lat, h, 넘침, 0, 0, 0, 소비 뒤 난수 상태]
/// # Safety
/// `p` 유효 또는 null(이면 null).
#[no_mangle]
pub unsafe extern "C" fn puff_resolve_v(p: *mut PuffSim, n: u32, top: f64, lat: f64, h: f64, breath: f64, rng_state: u32) -> *const f64 {
    let Some(s) = sim(p) else { return core::ptr::null() };
    let mut rng = Mulberry32::new(rng_state);
    let r = rules::resolve_shot(Shot { lat, h, power: breath }, n as usize, top, &mut rng, 1.0);
    s.res = [r.ratio, r.power, r.blast, r.lat, r.h, r.over as u32 as f64, 0.0, 0.0, 0.0, rng.state() as f64];
    s.res.as_ptr()
}

/// 판 난수 상태 읽기 / 바꾸기 (Dart 가 resolveShot 에 쓴 줄기를 blow 의 jitter 로 이어 줄 때)
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_rng_state(p: *mut PuffSim) -> u32 {
    sim(p).map_or(0, |s| s.table.rng.state())
}

/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_set_rng_state(p: *mut PuffSim, state: u32) {
    if let Some(s) = sim(p) {
        s.table.rng = Mulberry32::new(state);
    }
}

/// 판 상태를 핸들의 고정 버퍼에 채우고 그 포인터를 준다(PUFF_INFO_LEN 개 f64, 핸들이 살아 있는 동안 주소 고정):
/// [꼭대기 y, 더미 중심 x, z, 살아 있는 수, 뒤집힘, 원 밖, 바람 부는 중, 최대 속도, 판정 스텝, 전체 스텝, 시각, 0]
/// # Safety
/// `p` 유효 또는 null(이면 null).
#[no_mangle]
pub unsafe extern "C" fn puff_info(p: *mut PuffSim) -> *const f64 {
    let Some(s) = sim(p) else { return core::ptr::null() };
    let t = &s.table;
    let (cx, cz) = t.pile_center();
    s.info = [
        t.column_top(),
        cx,
        cz,
        t.live_ids().len() as f64,
        t.flipped_ids().len() as f64,
        t.out_ids().len() as f64,
        t.puff.is_some() as u32 as f64,
        t.max_speed(),
        s.judge.n as f64,
        t.steps as f64,
        t.time,
        0.0,
    ];
    s.info.as_ptr()
}

/// puff_settle 을 프레임마다 나눠 부르기: begin 뒤 settle_step 을 스텝마다 → 1 이면 끝.
/// puff_settle(max) 와 같은 스텝·같은 멈춤 조건(61스텝 뒤 최대 속도 < 0.06)이라 결과 해시가 같다.
/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_settle_begin(p: *mut PuffSim) {
    if let Some(s) = sim(p) {
        s.settle_i = 0;
    }
}

/// # Safety
/// `p` 유효 또는 null.
#[no_mangle]
pub unsafe extern "C" fn puff_settle_step(p: *mut PuffSim, max_steps: u32) -> u32 {
    let Some(s) = sim(p) else { return 1 };
    if s.settle_i >= max_steps {
        return 1;
    }
    let i = s.settle_i;
    s.table.step();
    s.settle_i += 1;
    ((i > 60 && s.table.is_settled(0.06)) || s.settle_i >= max_steps) as u32
}

/// 검증용: 물리·숨 규칙이 쓰는 순수 Rust libm 함수 (0 log, 1 cos, 2 sin, 3 sqrt, 4 pow(x, 2)). 모르는 f 는 NaN.
/// Dart 결정적 수학(app/lib/native/detmath.dart)이 이것과 비트 단위로 같아야 기기마다 숨 해석이 같다.
#[no_mangle]
pub extern "C" fn puff_math_v(f: u32, x: f64) -> f64 {
    match f {
        0 => libm::log(x),
        1 => libm::cos(x),
        2 => libm::sin(x),
        3 => libm::sqrt(x),
        4 => libm::pow(x, 2.0),
        _ => f64::NAN,
    }
}

/// 엔진 버전 문자열(NUL 끝, 정적 — 해제하지 말 것). malloc 없이 읽는 길(dart:ffi)
#[no_mangle]
pub extern "C" fn puff_version_cstr() -> *const c_char {
    static V: std::sync::OnceLock<std::ffi::CString> = std::sync::OnceLock::new();
    V.get_or_init(|| std::ffi::CString::new(crate::sim_version()).unwrap_or_default()).as_ptr()
}

/// 엔진 버전 문자열을 buf 에 (NUL 포함 cap 까지). 반환: 필요한 바이트 수(NUL 제외)
/// # Safety
/// `buf` 는 cap 바이트를 쓸 수 있는 버퍼(또는 null 이면 길이만).
#[no_mangle]
pub unsafe extern "C" fn puff_version(buf: *mut c_char, cap: u32) -> u32 {
    let v = crate::sim_version();
    let bytes = v.as_bytes();
    if !buf.is_null() && cap > 0 {
        let n = bytes.len().min(cap as usize - 1);
        core::ptr::copy_nonoverlapping(bytes.as_ptr() as *const c_char, buf, n);
        *buf.add(n) = 0;
    }
    bytes.len() as u32
}
