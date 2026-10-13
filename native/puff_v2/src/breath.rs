//! 숨 = 양자화한 원시 입력 → BreathProgram (D5, §4.4). 같은 입력 기록이면 같은 제트(클라이언트·서버·봇 공통).
//!
//! 입력 기록(권위, 30 Hz ZOH):
//!   머리 3 B: pose(2b) · armed(1b) · lat(q8) · h(q12)
//!   프레임 3 B씩: pull q12 · sweep s q8(부호) · flags 2b(start/stop)        // 2 s 누름 ≈ 183 B
//! Rust 가 결정적으로 만든다 (스텝 1/480 s 마다):
//!   q(t) = min(1, p/F), F = 1.12 (꽉)           — 박동(콩닥)은 UI 숨 주머니 쪽이라 스파이크 입력엔 없음(이미 반영된 p 로 기록)
//!   Q(t) = Q_max·q·env(t), Q_max = 3.9 L/s       — K_breath 고정 (D14)
//!   A(t) = 퍽 1.1 cm² / 푸어억 1.1 → 2.5 cm²      — §4.1 시간표
//!   j(t) = ρQ²/(A·W)                             — 퍽 꽉 = 14.3, 푸어억 꽉 14.3 → 6.3
//!   M(t), d(t) = 자세 회전축 + 고개 각 φ(t) (저역 10 Hz, 목 36°/s·300°/s² 상한) + 옆걸음 lat
//!   cost = 2.0·V[L] + 4.5·((q_peak − 0.8)₊/0.2)²  — §6.1 (규칙)

use crate::geom::{rad, V3};
use crate::pose::{Pose, PoseRig, SweepMode, SWEEP_FULL_DEG};
use crate::units::{time_scale, RHO, W_REF_N};

pub const FRAME_HZ: f64 = 30.0;
pub const FLAG_START: u8 = 1;
pub const FLAG_STOP: u8 = 2;
/// 꽉 (pouchPower 의 F)
pub const PULL_FULL: f64 = 1.12;
/// pull q12 의 범위 [0, 1.25]
pub const PULL_MAX: f64 = 1.25;
/// K_breath: 아바타 최대 유량 (L/s, 실물). **고정** (D14)
pub const Q_MAX_LPS: f64 = 3.9;
pub const A_PUFF_CM2: f64 = 1.1;
pub const A_PUEOK_END_CM2: f64 = 2.5;
/// 화면 초 (§4.1)
pub const PUFF_RISE: f64 = 0.096;
pub const PUFF_HOLD: f64 = 0.161;
pub const PUFF_DECAY: f64 = 0.128;
pub const PUEOK_PU: f64 = 0.32;
pub const PUEOK_WIDEN: f64 = 1.12;
pub const PUEOK_CAP: f64 = 1.93;
pub const PUEOK_RAMP: f64 = 0.26;
/// 목 속도·가속 상한 (규칙, 화면 초)
pub const NECK_DPS: f64 = 36.0;
pub const NECK_DPS2: f64 = 300.0;
pub const SWEEP_LP_HZ: f64 = 10.0;
/// 제트가 켜진 동안의 스텝 (D15)
pub const JET_DT: f64 = 1.0 / 480.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Frame {
    /// q12: p = pull/4095·1.25
    pub pull: u16,
    /// q8 부호: s = sweep/127 ∈ [−0.2, 1]
    pub sweep: i8,
    pub flags: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RawInput {
    pub pose: Pose,
    /// 숨 풍선 장착 = 푸어억
    pub armed: bool,
    /// q8: lat = lat_q/127·0.95
    pub lat_q: i8,
    /// q12: h = h_q/512 − 2 (u)
    pub h_q: u16,
    pub frames: Vec<Frame>,
}

pub fn q_pull(p: f64) -> u16 {
    let v = libm::round(p.clamp(0.0, PULL_MAX) / PULL_MAX * 4095.0);
    v as u16
}
pub fn dq_pull(q: u16) -> f64 {
    q as f64 / 4095.0 * PULL_MAX
}
pub fn q_sweep(s: f64) -> i8 {
    libm::round(s.clamp(-0.2, 1.0) * 127.0) as i8
}
pub fn dq_sweep(q: i8) -> f64 {
    q as f64 / 127.0
}
pub fn q_lat(l: f64) -> i8 {
    libm::round(l.clamp(-0.95, 0.95) / 0.95 * 127.0) as i8
}
pub fn dq_lat(q: i8) -> f64 {
    q as f64 / 127.0 * 0.95
}
pub fn q_h(h: f64) -> u16 {
    libm::round((h.clamp(-2.0, 5.99) + 2.0) * 512.0) as u16
}
pub fn dq_h(q: u16) -> f64 {
    q as f64 / 512.0 - 2.0
}

impl RawInput {
    /// 바이트 직렬화 (머리 3 B + 프레임 3 B)
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut b = Vec::with_capacity(3 + 3 * self.frames.len());
        let h = self.h_q & 0x0fff;
        b.push((self.pose.code() & 3) | if self.armed { 4 } else { 0 } | (((h >> 8) as u8) << 4));
        b.push(self.lat_q as u8);
        b.push((h & 0xff) as u8);
        for f in &self.frames {
            let v: u32 = (f.pull as u32 & 0x0fff) | ((f.sweep as u8 as u32) << 12) | (((f.flags & 3) as u32) << 20);
            b.push((v & 0xff) as u8);
            b.push(((v >> 8) & 0xff) as u8);
            b.push(((v >> 16) & 0xff) as u8);
        }
        b
    }
    pub fn from_bytes(b: &[u8]) -> Option<RawInput> {
        if b.len() < 3 || (b.len() - 3) % 3 != 0 {
            return None;
        }
        let pose = Pose::from_code(b[0] & 3);
        let armed = b[0] & 4 != 0;
        let h_q = (((b[0] >> 4) as u16) << 8) | b[2] as u16;
        let lat_q = b[1] as i8;
        let mut frames = Vec::new();
        for c in b[3..].chunks(3) {
            let v = c[0] as u32 | (c[1] as u32) << 8 | (c[2] as u32) << 16;
            frames.push(Frame { pull: (v & 0x0fff) as u16, sweep: ((v >> 12) & 0xff) as u8 as i8, flags: ((v >> 20) & 3) as u8 });
        }
        Some(RawInput { pose, armed, lat_q, h_q, frames })
    }
    pub fn lat(&self) -> f64 {
        dq_lat(self.lat_q)
    }
    pub fn h(&self) -> f64 {
        dq_h(self.h_q)
    }
    #[inline]
    fn frame_at(&self, t: f64) -> Frame {
        let n = self.frames.len();
        if n == 0 {
            return Frame { pull: 0, sweep: 0, flags: 0 };
        }
        let mut k = libm::floor(t * FRAME_HZ) as i64;
        if k < 0 {
            k = 0;
        }
        if k as usize >= n {
            k = n as i64 - 1;
        }
        self.frames[k as usize]
    }
}

/// 숨 방식
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Puff,
    Pueok,
}

/// 사람 쪽 고수준 숨 기술 → 원시 입력 프레임 (봇·측정용)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BreathSpec {
    pub kind: Kind,
    /// 당김 → q = min(1, p/F). 여기선 q 를 직접 받아 p = q·F 로 기록
    pub q: f64,
    /// 푸어억: 시작 → 떼기 (화면 초, 상한 1.93)
    pub dur: f64,
    /// 고개 쓸기 속도 (°/s, 명령 각). 0 = 고정
    pub sweep_dps: f64,
    /// 쓸기 시작 지연 (화면 초)
    pub sweep_delay: f64,
    /// 쓸기 상한 s (≤ 1 = 24°)
    pub sweep_max: f64,
}

impl BreathSpec {
    pub fn puff(q: f64) -> Self {
        Self { kind: Kind::Puff, q, dur: 0.0, sweep_dps: 0.0, sweep_delay: 0.0, sweep_max: 1.0 }
    }
    pub fn pueok(q: f64, dur: f64) -> Self {
        Self { kind: Kind::Pueok, q, dur, sweep_dps: 0.0, sweep_delay: 0.0, sweep_max: 1.0 }
    }
    pub fn with_sweep(mut self, dps: f64, delay: f64) -> Self {
        self.sweep_dps = dps;
        self.sweep_delay = delay;
        self
    }

    pub fn to_raw(&self, pose: Pose, lat: f64, h: f64) -> RawInput {
        let pull = q_pull(self.q.clamp(0.0, 1.0) * PULL_FULL);
        let span = match self.kind {
            Kind::Puff => PUFF_RISE + PUFF_HOLD + PUFF_DECAY,
            Kind::Pueok => self.dur.clamp(1.0 / FRAME_HZ, PUEOK_CAP),
        };
        let nf = libm::ceil(span * FRAME_HZ - 1e-9) as usize + 1;
        let mut frames = Vec::with_capacity(nf);
        for f in 0..nf {
            let t = f as f64 / FRAME_HZ;
            let s = if self.sweep_dps != 0.0 && t > self.sweep_delay {
                (self.sweep_dps * (t - self.sweep_delay) / SWEEP_FULL_DEG).clamp(-0.2, self.sweep_max.min(1.0))
            } else {
                0.0
            };
            let mut flags = 0;
            if f == 0 {
                flags |= FLAG_START;
            }
            if self.kind == Kind::Pueok && f == nf - 1 {
                flags |= FLAG_STOP;
            }
            frames.push(Frame { pull, sweep: q_sweep(s), flags });
        }
        RawInput { pose, armed: self.kind == Kind::Pueok, lat_q: q_lat(lat), h_q: q_h(h), frames }
    }
}

/// 한 바깥 스텝(1/480 s)의 숨 상태
#[derive(Clone, Copy, Debug)]
pub struct BreathSample {
    pub m: V3,
    pub d: V3,
    /// 유량 (L/s, 실물)
    pub q_lps: f64,
    /// 입 면적 (cm²)
    pub a_cm2: f64,
    /// 쓸기 각 Δφ (rad)
    pub dphi: f64,
}

#[derive(Clone, Debug)]
pub struct BreathProgram {
    pub rig: PoseRig,
    pub kind: Kind,
    pub samples: Vec<BreathSample>,
    pub q_peak: f64,
    /// 실물 리터
    pub vol_l: f64,
    pub cost: f64,
    pub j_peak: f64,
    /// 푸어억 떼기 시각 (화면 초)
    pub t_stop: f64,
}

#[inline]
fn ramp_up(t: f64, tr: f64) -> f64 {
    if t <= 0.0 {
        0.0
    } else if t >= tr {
        1.0
    } else {
        0.5 * (1.0 - libm::cos(core::f64::consts::PI * t / tr))
    }
}

/// j = ρQ²/(A·W)
pub fn j_of(q_lps: f64, a_cm2: f64) -> f64 {
    let q = q_lps * 1e-3;
    let a = a_cm2 * 1e-4;
    if a <= 0.0 {
        return 0.0;
    }
    RHO * q * q / a / W_REF_N
}

/// §6.1 비용 (규칙)
pub fn cost_of(vol_l: f64, q_peak: f64) -> f64 {
    let x = ((q_peak - 0.8).max(0.0)) / 0.2;
    2.0 * vol_l + 4.5 * x * x
}

impl BreathProgram {
    pub fn build(raw: &RawInput, mode: SweepMode, z_f: f64, z_e: f64) -> BreathProgram {
        let rig = PoseRig::new(raw.pose, mode, raw.lat(), raw.h(), z_f, z_e);
        let kind = if raw.armed { Kind::Pueok } else { Kind::Puff };
        let dt = JET_DT;
        // 떼기 시각
        let t_stop = match kind {
            Kind::Puff => PUFF_RISE + PUFF_HOLD,
            Kind::Pueok => {
                let mut ts = raw.frames.len() as f64 / FRAME_HZ;
                for (f, fr) in raw.frames.iter().enumerate() {
                    if fr.flags & FLAG_STOP != 0 {
                        ts = f as f64 / FRAME_HZ;
                        break;
                    }
                }
                ts.clamp(dt, PUEOK_CAP)
            }
        };
        let t_end = match kind {
            Kind::Puff => PUFF_RISE + PUFF_HOLD + PUFF_DECAY,
            Kind::Pueok => t_stop + PUEOK_RAMP,
        };
        let n = libm::ceil(t_end / dt - 1e-9) as usize;
        let mut samples = Vec::with_capacity(n);
        // 쓸기: 저역 10 Hz → 목 속도·가속 상한
        let alpha = 1.0 - libm::exp(-2.0 * core::f64::consts::PI * SWEEP_LP_HZ * dt);
        let (vmax, amax) = (rad(NECK_DPS), rad(NECK_DPS2));
        let (mut s_f, mut phi, mut w) = (0.0f64, 0.0f64, 0.0f64);
        let mut q_peak = 0.0f64;
        let mut vol = 0.0f64;
        let mut j_peak = 0.0f64;
        let q_at_stop = libm::fmin(1.0, dq_pull(raw.frame_at(t_stop.min(t_end) - 1e-9).pull) / PULL_FULL);
        for k in 0..n {
            let t = (k as f64 + 0.5) * dt;
            let fr = raw.frame_at(t);
            // 쓸기 각
            s_f += alpha * (dq_sweep(fr.sweep) - s_f);
            let target = rad(SWEEP_FULL_DEG) * s_f;
            let err = target - phi;
            let mut v_des = err / dt;
            let brake = libm::sqrt(2.0 * amax * libm::fabs(err));
            let lim = if brake < vmax { brake } else { vmax };
            v_des = v_des.clamp(-lim, lim);
            let dv = (v_des - w).clamp(-amax * dt, amax * dt);
            w += dv;
            phi += w * dt;
            let (m, d) = rig.mouth_dir(phi);
            // 유량·면적
            let (q, env, a) = match kind {
                Kind::Puff => {
                    let q0 = libm::fmin(1.0, dq_pull(raw.frames.first().map(|f| f.pull).unwrap_or(0)) / PULL_FULL);
                    let env = if t < PUFF_RISE {
                        ramp_up(t, PUFF_RISE)
                    } else if t < PUFF_RISE + PUFF_HOLD {
                        1.0
                    } else {
                        1.0 - ramp_up(t - PUFF_RISE - PUFF_HOLD, PUFF_DECAY)
                    };
                    (q0, env, A_PUFF_CM2)
                }
                Kind::Pueok => {
                    let (q, env) = if t < t_stop {
                        (libm::fmin(1.0, dq_pull(fr.pull) / PULL_FULL), ramp_up(t, PUEOK_RAMP))
                    } else {
                        // 떼기 뒤: 떼는 순간의 세기에서 0.26 s 감쇠
                        (q_at_stop, ramp_up(t_stop, PUEOK_RAMP) * (1.0 - ramp_up(t - t_stop, PUEOK_RAMP)))
                    };
                    let a = if t < PUEOK_PU {
                        A_PUFF_CM2
                    } else if t < PUEOK_PU + PUEOK_WIDEN {
                        A_PUFF_CM2 + (A_PUEOK_END_CM2 - A_PUFF_CM2) * (t - PUEOK_PU) / PUEOK_WIDEN
                    } else {
                        A_PUEOK_END_CM2
                    };
                    (q, env, a)
                }
            };
            let q_lps = Q_MAX_LPS * q * env;
            if env > 0.0 && q > q_peak {
                q_peak = q;
            }
            vol += q_lps * dt / time_scale();
            let j = j_of(q_lps, a);
            if j > j_peak {
                j_peak = j;
            }
            samples.push(BreathSample { m, d, q_lps, a_cm2: a, dphi: phi });
        }
        let cost = cost_of(vol, q_peak);
        BreathProgram { rig, kind, samples, q_peak, vol_l: vol, cost, j_peak, t_stop }
    }

    pub fn duration(&self) -> f64 {
        self.samples.len() as f64 * JET_DT
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn puff_full_j_and_cost() {
        let raw = BreathSpec::puff(1.0).to_raw(Pose::Chin, 0.0, 0.8);
        let p = BreathProgram::build(&raw, SweepMode::Native, 1.0, 9.0);
        assert!((p.j_peak - 14.3).abs() < 0.15, "j_peak {}", p.j_peak);
        assert!((p.vol_l - 0.33).abs() < 0.02, "vol {}", p.vol_l);
        assert!((p.cost - 5.2).abs() < 0.1, "cost {}", p.cost);
        // 중간 퍽 0.85 ≤ 0.8 칸 근처 (§6.1 표 0.8)
        let raw = BreathSpec::puff(0.85).to_raw(Pose::Chin, 0.0, 0.8);
        let p = BreathProgram::build(&raw, SweepMode::Native, 1.0, 9.0);
        assert!(p.cost < 0.9, "cost q.85 {}", p.cost);
    }
    #[test]
    fn pueok_area_and_j_schedule() {
        let raw = BreathSpec::pueok(1.0, 1.93).to_raw(Pose::Chin, 0.0, 0.8);
        let p = BreathProgram::build(&raw, SweepMode::Native, 1.0, 9.0);
        let at = |t: f64| p.samples[(t / JET_DT) as usize];
        assert!((at(0.30).a_cm2 - 1.1).abs() < 1e-9);
        assert!((at(1.60).a_cm2 - 2.5).abs() < 1e-9);
        let j0 = j_of(at(0.30).q_lps, at(0.30).a_cm2);
        let j1 = j_of(at(1.60).q_lps, at(1.60).a_cm2);
        assert!((j0 - 14.3).abs() < 0.2 && (j1 - 6.3).abs() < 0.15, "j {j0} → {j1}");
        assert!(p.cost > 8.5 && p.cost < 10.0, "cost {}", p.cost);
    }
    #[test]
    fn raw_bytes_roundtrip_and_size() {
        let raw = BreathSpec::pueok(0.9, 1.93).with_sweep(9.0, 0.3).to_raw(Pose::Chin, -0.3, 0.75);
        let b = raw.to_bytes();
        assert!(b.len() <= 200, "{} B", b.len());
        assert_eq!(RawInput::from_bytes(&b).unwrap(), raw);
    }
    #[test]
    fn neck_limits_hold() {
        // 아주 빠른 명령(200°/s)도 36°/s 를 넘지 않는다
        let raw = BreathSpec::pueok(1.0, 1.5).with_sweep(200.0, 0.0).to_raw(Pose::Chin, 0.0, 0.5);
        let p = BreathProgram::build(&raw, SweepMode::Native, 1.0, 9.0);
        for w in p.samples.windows(2) {
            let v = (w[1].dphi - w[0].dphi) / JET_DT;
            assert!(v <= rad(NECK_DPS) + 1e-9, "v {}", crate::geom::deg(v));
        }
    }
}
