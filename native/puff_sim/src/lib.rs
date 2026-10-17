//! puff_sim — PUFF! 딱지 물리의 네이티브(Rust + rapier3d 0.36) 포팅.
//!
//! 🧭 가설: 웹(Rapier JS 0.12 = rapier 0.18)의 '손맛'은 바람 모델(sim.js applyWind)과 솔버의 접촉 스프링(erp 0.2)에서 나온다.
//!   둘을 그대로 옮기면(같은 시드 → 같은 더미·같은 jitter, 0.18 erp/cfm 을 0.36 contact_softness 로 역산)
//!   측정 도구 곡선(powercurve·fromtop·aimmap·stackpower·mouthmap)이 16시드 잡음 안에서 겹친다 → 네이티브 이식 가능.
//!
//! 구성
//!  - [`table::Table`]  : sim.js Table (더미·settle·blow·applyWind·judge·restack·해시)
//!  - [`rules`]         : rules.js resolveShot·sweetHiFor·physSweetFor
//!  - [`ffi`]           : C ABI (dart:ffi / Swift / Kotlin 공용) — include/puff_sim.h
//!  - bin/puff_parity   : JS 측정 도구의 Rust 판 + 벤치 + 결정성 해시

pub mod ffi;
pub mod rng;
pub mod rules;
pub mod table;
pub mod tune;

pub use table::{BlowArgs, Table, V3};
pub use tune::Tune;

use rng::Mulberry32;
use rules::{Resolved, Shot};

/// FNV-1a 64 (상태 해시·TUNE 지문)
#[derive(Clone, Copy, Debug)]
pub struct Fnv64(u64);

impl Default for Fnv64 {
    fn default() -> Self {
        Self::new()
    }
}

impl Fnv64 {
    pub const fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }
    #[inline]
    pub fn bytes(&mut self, b: &[u8]) {
        for &x in b {
            self.0 ^= x as u64;
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    #[inline]
    pub fn u32(&mut self, v: u32) {
        self.bytes(&v.to_le_bytes());
    }
    #[inline]
    pub fn u64(&mut self, v: u64) {
        self.bytes(&v.to_le_bytes());
    }
    pub fn finish(self) -> u64 {
        self.0
    }
}

/// 엔진·규칙 버전 문자열 (PvP 에서 양쪽이 같은 엔진인지 확인용; sim.js simVersion 의 짝)
pub fn sim_version() -> String {
    format!("puff_sim {} rapier3d 0.36.0 tune {:016x}", env!("CARGO_PKG_VERSION"), Tune::default().fingerprint())
}

/// 게임·측정 도구 공통 조준 기하 (main.js shotGeometry / mouthmap):
/// 조준점 = c − D·√(1−lat²) + side·lat, side = (−D.z, D.x)
pub fn aim_point(center: (f64, f64), dir: (f64, f64), lat: f64, h: f64) -> V3 {
    let back = libm::sqrt(1.0 - lat * lat);
    let side = (-dir.1, dir.0);
    V3::new(center.0 - dir.0 * back + side.0 * lat, h, center.1 - dir.1 * back + side.1 * lat)
}

/// 한 턴 쏘기 — turn.js `ShotRun.fire` 와 같은 순서·같은 난수 소비:
///   rng = mulberry32(puff_seed) → resolveShot(숨 넘치면 gauss 2개 소비) → table.rng = 그 줄기(blow 의 jitter·텀블이 이어 씀)
///   → 조준 기하(lat 은 ±0.95·R 로 자름, 표적 = c − D·√(1−lat²) + side·lat) → blow.
/// 앱(Dart)은 같은 일을 Dart resolveShot + `puff_set_rng_state` + `puff_blow_v` 로 한다 — 둘이 같은 해시를 내야 한다(app/test/native_sim_ffi_test.dart).
pub fn fire_turn(t: &mut Table, shot: Shot, dir: (f64, f64), mouth_y: Option<f64>, puff_seed: u32) -> (Resolved, V3) {
    let live = t.live_ids().len();
    let top = t.column_top();
    let mut rng = Mulberry32::new(puff_seed);
    let r = rules::resolve_shot(shot, live, top, &mut rng, 1.0);
    t.rng = rng;
    let dl = libm::sqrt(dir.0 * dir.0 + dir.1 * dir.1);
    let d = if dl > 0.0 { (dir.0 / dl, dir.1 / dl) } else { (0.0, -1.0) };
    let lat = rules::jclamp(r.lat, -0.95, 0.95);
    let aim = aim_point(t.pile_center(), d, lat, r.h);
    let mut b = BlowArgs::new(aim, d.0, d.1, r.power, r.blast);
    b.mouth_y = mouth_y;
    t.blow(&b);
    (r, aim)
}
