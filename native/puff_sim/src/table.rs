//! Table — sim.js `Table` 의 Rust 포팅 (rapier3d 0.36, enhanced-determinism).
//!
//! 단위·축·상수는 sim.js 와 같다: 딱지 반지름 R = 1, 두께 0.11, 로컬 +Y = 그림 면, 시작은 그림이 아래.
//! 포팅 범위: 더미 쌓기(addPile·stackOffset·restack), settle, 바람(blow 기본 경로 + 9차 입술 높이 mouthY 경로),
//!           applyWind(rimHit·deflect·spin·blast·tumble·lip split/wedge), step(책상 밖 'off'), runUntilSettled,
//!           inCircle·faceUp·judge, PvP stepJudge.
//! 안 옮긴 것: 7차 jetPitch·8차 tableScoop(잠든 시제품, 게임·봇이 안 씀), isLone(loneLift = 0).
//! 수학은 f64(JS number 와 같음), 엔진 경계에서만 f32. 초월함수는 전부 libm(기기 간 같은 비트).

use crate::rng::{gauss, Mulberry32};
use crate::tune::Tune;
use crate::Fnv64;
use rapier3d::prelude::*;

pub const DISC_R: f64 = 1.0;
pub const DISC_H: f64 = 0.11;
pub const TABLE_R: f64 = 9.0;
pub const DESK_HX: f64 = 11.0;
pub const DESK_HZ: f64 = 8.0;

/// PvP 스텝 판정 (sim.js JUDGE)
pub const JUDGE_MIN_STEPS: u32 = 72;
pub const JUDGE_LATE_STEPS: u32 = 300;
pub const JUDGE_QUIET_STEPS: u32 = 24;
pub const JUDGE_MAX_STEPS: u32 = 600;
pub const JUDGE_EPS: f64 = 0.08;
pub const JUDGE_LATE_EPS: f64 = 0.5;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl V3 {
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    #[inline]
    fn from_vec(v: Vector) -> Self {
        Self::new(v.x as f64, v.y as f64, v.z as f64)
    }
    #[inline]
    fn to_vec(self) -> Vector {
        Vector::new(self.x as f32, self.y as f32, self.z as f32)
    }
    #[inline]
    fn len(self) -> f64 {
        hypot3(self.x, self.y, self.z)
    }
}

#[inline]
fn hypot3(a: f64, b: f64, c: f64) -> f64 {
    libm::sqrt(a * a + b * b + c * c)
}
#[inline]
fn hypot2(a: f64, b: f64) -> f64 {
    libm::sqrt(a * a + b * b)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Q {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

fn q_axis_angle(ax: f64, ay: f64, az: f64, ang: f64) -> Q {
    let s = libm::sin(ang / 2.0);
    Q { x: ax * s, y: ay * s, z: az * s, w: libm::cos(ang / 2.0) }
}

fn q_mul(a: Q, b: Q) -> Q {
    Q {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    }
}

/// sim.js rotate(q, v)
fn rotate(q: Q, v: V3) -> V3 {
    let Q { x, y, z, w } = q;
    let ix = w * v.x + y * v.z - z * v.y;
    let iy = w * v.y + z * v.x - x * v.z;
    let iz = w * v.z + x * v.y - y * v.x;
    let iw = -x * v.x - y * v.y - z * v.z;
    V3 {
        x: ix * w + iw * -x + iy * -z - iz * -y,
        y: iy * w + iw * -y + iz * -x - ix * -z,
        z: iz * w + iw * -z + ix * -y - iy * -x,
    }
}

fn q_from_rot(r: &Rotation) -> Q {
    Q { x: r.x as f64, y: r.y as f64, z: r.z as f64, w: r.w as f64 }
}

fn js_sign(v: f64) -> f64 {
    if v > 0.0 {
        1.0
    } else if v < 0.0 {
        -1.0
    } else {
        0.0
    }
}

#[derive(Clone, Debug)]
pub struct Disc {
    pub id: usize,
    pub card_id: i64,
    pub body: RigidBodyHandle,
    pub collider: ColliderHandle,
    pub removed: bool,
    pub off: bool,
    pub heavy: bool,
}

#[derive(Clone, Debug)]
pub struct Puff {
    pub o: V3,
    pub d: V3,
    pub power: f64,
    pub t: f64,
    /// 딱지 id → 변동 계수 (blow 때 살아 있던 딱지만; 없으면 1)
    pub jit: Vec<Option<f64>>,
    pub blast: f64,
    pub up: f64,
    pub down: f64,
    pub spread_k: f64,
    pub disc_only: bool,
    pub lip: bool,
    pub split_u: f64,
    pub split_d: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Hit {
    pub id: usize,
    pub s: f64,
    pub gap: f64,
    pub lift_f: f64,
    pub e: V3,
}

/// blow() 인자. sim.js 기본값: dist 2.6, pitch 0.1, blast 0
#[derive(Clone, Copy, Debug)]
pub struct BlowArgs {
    pub aim: V3,
    pub dir_x: f64,
    pub dir_z: f64,
    pub power: f64,
    pub blast: f64,
    pub dist: f64,
    pub pitch: f64,
    /// 9차 '입술 높이' 경로. None 이면 기본 경로(지금 입 = 조준점 위 2.6·tan 0.1)
    pub mouth_y: Option<f64>,
}

impl BlowArgs {
    pub fn new(aim: V3, dir_x: f64, dir_z: f64, power: f64, blast: f64) -> Self {
        Self { aim, dir_x, dir_z, power, blast, dist: 2.6, pitch: 0.1, mouth_y: None }
    }
}

/// blowLip 기하 (렌더러·측정용)
#[derive(Clone, Copy, Debug, Default)]
pub struct LipGeom {
    pub m: V3,
    pub phi: f64,
    pub tilt: f64,
    pub up: f64,
    pub down: f64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct JudgeState {
    pub n: u32,
    pub quiet: u32,
}

pub struct Table {
    pub t: Tune,
    pub rng: Mulberry32,
    pub world: PhysicsWorld,
    pub discs: Vec<Disc>,
    pub puff: Option<Puff>,
    pub time: f64,
    pub last_hits: Vec<Hit>,
    pub steps: u64,
    ground_collider: ColliderHandle,
}

impl Table {
    pub fn new(seed: u32) -> Self {
        Self::with_tune(seed, Tune::default())
    }

    pub fn with_tune(seed: u32, t: Tune) -> Self {
        let mut world = PhysicsWorld::new();
        world.gravity = Vector::new(0.0, -(t.gravity as f32), 0.0);
        let (_, ground_collider) = world.insert(
            RigidBodyBuilder::fixed().translation(Vector::new(0.0, -0.5, 0.0)),
            ColliderBuilder::cuboid(DESK_HX as f32, 0.5, DESK_HZ as f32).friction(t.ground_friction as f32),
        );
        let mut tb = Self {
            t,
            rng: Mulberry32::new(seed),
            world,
            discs: Vec::new(),
            puff: None,
            time: 0.0,
            last_hits: Vec::new(),
            steps: 0,
            ground_collider,
        };
        tb.apply_solver();
        tb
    }

    /// TUNE 의 솔버 손잡이 → IntegrationParameters (JS 0.12 = rapier 0.18 설정의 0.36 짝)
    pub fn apply_solver(&mut self) {
        let t = &self.t;
        let ip = &mut self.world.integration_parameters;
        ip.dt = t.dt as f32;
        ip.num_solver_iterations = t.substeps.max(1.0) as usize;
        ip.num_internal_pgs_iterations = t.pgs_iters.max(1.0) as usize;
        ip.num_internal_stabilization_iterations = t.stab_iters.max(0.0) as usize;
        let (hz, zeta) = t.contact_spring();
        ip.contact_softness = SpringCoefficients::new(hz as f32, zeta as f32);
        let (shz, szeta) = t.static_spring();
        ip.static_contact_softness = SpringCoefficients::new(shz as f32, szeta as f32);
        ip.normalized_allowed_linear_error = t.allowed_err as f32;
        ip.normalized_prediction_distance = t.prediction as f32;
        ip.normalized_max_corrective_velocity = if t.max_corrective > 0.0 { t.max_corrective as f32 } else { f32::MAX };
        ip.normalized_max_linear_velocity = f32::MAX;
        ip.friction_model = if t.coulomb > 0.5 { FrictionModel::Coulomb } else { FrictionModel::Simplified };
        ip.contact_recycling = t.recycle > 0.5;
        ip.friction_in_bias_pass = t.friction_bias > 0.5;
        ip.warmstart_coefficient = t.warmstart as f32;
        ip.max_ccd_substeps = 1;
        self.world.gravity = Vector::new(0.0, -(t.gravity as f32), 0.0);
        let gf = t.ground_friction as f32;
        if let Some(g) = self.world.colliders.get_mut(self.ground_collider) {
            g.set_friction(gf);
        }
    }

    // ── 더미 ────────────────────────────────────────────────

    /// 쌓을 때 한 장의 어긋남 (sim.js stackOffset — rng 소비 순서 같음)
    fn stack_offset(&mut self, spread: f64) -> (f64, f64) {
        let mut x = gauss(&mut self.rng) * spread;
        let mut z = gauss(&mut self.rng) * spread;
        if self.rng.next_f64() < self.t.protrude_p {
            let a = self.rng.next_f64() * core::f64::consts::PI * 2.0;
            let m = self.t.prot_min + (self.t.prot_max - self.t.prot_min) * self.rng.next_f64();
            x += libm::cos(a) * m;
            z += libm::sin(a) * m;
        }
        (x, z)
    }

    /// 원기둥 더미 (sim.js addPile mode 'column'). heavy = 테이프 딱지 인덱스(밀도 ×3)
    pub fn add_pile(&mut self, n: usize, spread: f64, at: (f64, f64), heavy: &[bool]) {
        for i in 0..n {
            let (ox, oz) = self.stack_offset(spread);
            let x = at.0 + ox;
            let z = at.1 + oz;
            let y = DISC_H / 2.0 + i as f64 * (DISC_H + 0.004);
            let mut q = q_axis_angle(1.0, 0.0, 0.0, core::f64::consts::PI);
            q = q_mul(q_axis_angle(0.0, 1.0, 0.0, self.rng.next_f64() * core::f64::consts::PI * 2.0), q);
            let tilt = q_axis_angle(1.0, 0.0, 0.0, (self.rng.next_f64() - 0.5) * 0.03);
            q = q_mul(tilt, q);
            let hv = heavy.get(i).copied().unwrap_or(false);
            self.spawn_disc(V3::new(x, y, z), q, hv, self.discs.len() as i64);
        }
    }

    fn spawn_disc(&mut self, p: V3, q: Q, heavy: bool, card_id: i64) {
        let t = &self.t;
        let rot = Rotation::from_xyzw(q.x as f32, q.y as f32, q.z as f32, q.w as f32).normalize();
        let body = RigidBodyBuilder::dynamic()
            .pose(Pose::from_parts(p.to_vec(), rot))
            .linear_damping(t.lin_damp as f32)
            .angular_damping(t.ang_damp as f32)
            .ccd_enabled(t.ccd > 0.5)
            .gyroscopic_forces_enabled(t.gyro > 0.5)
            .allow_fast_rotation(true);
        let col = ColliderBuilder::cylinder((DISC_H / 2.0) as f32, DISC_R as f32)
            .density((t.density * if heavy { 3.0 } else { 1.0 }) as f32)
            .friction(t.friction as f32)
            .restitution(t.restitution as f32);
        let sleep_lin = t.sleep_lin as f32;
        let sleep_time = t.sleep_time as f32;
        let (bh, ch) = self.world.insert(body, col);
        {
            let a = self.world.bodies[bh].activation_mut();
            a.normalized_linear_threshold = sleep_lin;
            a.time_until_sleep = sleep_time;
        }
        let id = self.discs.len();
        self.discs.push(Disc { id, card_id, body: bh, collider: ch, removed: false, off: false, heavy });
    }

    /// 남은 딱지를 다시 원기둥으로 (sim.js restackTargets + applyRestack)
    pub fn restack(&mut self, at: (f64, f64)) {
        let live: Vec<usize> = self.live_ids();
        let mut targets = Vec::with_capacity(live.len());
        for (i, &id) in live.iter().enumerate() {
            let mut q = q_axis_angle(1.0, 0.0, 0.0, core::f64::consts::PI);
            q = q_mul(q_axis_angle(0.0, 1.0, 0.0, self.rng.next_f64() * core::f64::consts::PI * 2.0), q);
            q = q_mul(q_axis_angle(1.0, 0.0, 0.0, (self.rng.next_f64() - 0.5) * 0.03), q);
            let (ox, oz) = self.stack_offset(0.07);
            targets.push((id, V3::new(at.0 + ox, DISC_H / 2.0 + i as f64 * (DISC_H + 0.004), at.1 + oz), q));
        }
        for (id, p, q) in targets {
            let bh = self.discs[id].body;
            if self.discs[id].off {
                self.discs[id].off = false;
                self.world.bodies[bh].set_gravity_scale(1.0, true);
            }
            let b = &mut self.world.bodies[bh];
            b.set_translation(p.to_vec(), true);
            b.set_rotation(Rotation::from_xyzw(q.x as f32, q.y as f32, q.z as f32, q.w as f32).normalize(), true);
            b.set_linvel(Vector::ZERO, true);
            b.set_angvel(Vector::ZERO, true);
        }
    }

    pub fn remove(&mut self, id: usize) {
        if let Some(d) = self.discs.get_mut(id) {
            if !d.removed {
                d.removed = true;
                let bh = d.body;
                self.world.remove_body(bh);
            }
        }
    }

    // ── 읽기 ────────────────────────────────────────────────

    pub fn live_ids(&self) -> Vec<usize> {
        self.discs.iter().filter(|d| !d.removed).map(|d| d.id).collect()
    }

    pub fn pos(&self, id: usize) -> V3 {
        V3::from_vec(self.world.bodies[self.discs[id].body].translation())
    }

    pub fn rot(&self, id: usize) -> Q {
        q_from_rot(self.world.bodies[self.discs[id].body].rotation())
    }

    pub fn column_top(&self) -> f64 {
        let mut top = 0.0f64;
        for d in self.discs.iter().filter(|d| !d.removed) {
            top = top.max(self.pos(d.id).y + DISC_H / 2.0);
        }
        top
    }

    /// 살아 있는 딱지 중심 높이, 위에서부터 (fromtop·mouthmap 의 '위에서 k장째')
    pub fn layer_ys(&self) -> Vec<f64> {
        let mut ys: Vec<f64> = self.discs.iter().filter(|d| !d.removed).map(|d| self.pos(d.id).y).collect();
        ys.sort_by(|a, b| b.partial_cmp(a).unwrap_or(core::cmp::Ordering::Equal));
        ys
    }

    pub fn face_up(&self, id: usize) -> f64 {
        rotate(self.rot(id), V3::new(0.0, 1.0, 0.0)).y
    }

    pub fn max_speed(&self) -> f64 {
        let mut m = 0.0f64;
        for d in self.discs.iter().filter(|d| !d.removed && !d.off) {
            let b = &self.world.bodies[d.body];
            let v = V3::from_vec(b.linvel());
            let w = V3::from_vec(b.angvel());
            m = m.max(v.len()).max(w.len() * 0.5);
        }
        m
    }

    pub fn is_settled(&self, eps: f64) -> bool {
        self.max_speed() < eps
    }

    pub fn pile_center(&self) -> (f64, f64) {
        let live: Vec<usize> = self.live_ids();
        if live.is_empty() {
            return (0.0, 0.0);
        }
        let (mut x, mut z) = (0.0, 0.0);
        for &id in &live {
            let p = self.pos(id);
            x += p.x;
            z += p.z;
        }
        (x / live.len() as f64, z / live.len() as f64)
    }

    pub fn in_circle(&self, id: usize) -> bool {
        let d = &self.discs[id];
        if d.off {
            return false;
        }
        let p = self.pos(id);
        hypot2(p.x, p.z) <= self.t.circle_r
    }

    pub fn flipped_ids(&self) -> Vec<usize> {
        self.live_ids().into_iter().filter(|&id| self.face_up(id) > 0.2 && self.in_circle(id)).collect()
    }

    pub fn out_ids(&self) -> Vec<usize> {
        self.live_ids().into_iter().filter(|&id| !self.in_circle(id)).collect()
    }

    // ── 진행 ────────────────────────────────────────────────

    /// 시작 전 더미를 가라앉힘 (sim.js settle)
    pub fn settle(&mut self, max_steps: u32) -> u32 {
        for i in 0..max_steps {
            self.step();
            if i > 60 && self.is_settled(0.06) {
                return i;
            }
        }
        max_steps
    }

    pub fn step(&mut self) {
        if self.puff.is_some() {
            self.apply_wind();
        } else {
            self.last_hits.clear();
        }
        self.world.step();
        self.time += self.t.dt;
        self.steps += 1;
        // 책상 밖으로 떨어진 딱지: 책상 밑에 멈춰 둔다(off)
        for i in 0..self.discs.len() {
            let d = &self.discs[i];
            if d.removed || d.off {
                continue;
            }
            let bh = d.body;
            let p = self.world.bodies[bh].translation();
            if p.y < -3.0 {
                self.discs[i].off = true;
                let b = &mut self.world.bodies[bh];
                b.set_gravity_scale(0.0, false);
                b.set_linvel(Vector::ZERO, false);
                b.set_angvel(Vector::ZERO, false);
                b.set_translation(Vector::new(p.x, -4.0, p.z), false);
            }
        }
    }

    /// 블로우 후 정착까지 (sim.js runUntilSettled). 반환: 진행한 스텝 수
    pub fn run_until_settled(&mut self, max_sec: f64) -> u32 {
        let steps = libm::ceil(max_sec / self.t.dt) as u32;
        let mut i = 0;
        while i < steps {
            self.step();
            if self.puff.is_none() && i > 30 && self.is_settled(0.06) {
                break;
            }
            i += 1;
        }
        i
    }

    /// PvP 스텝 판정 (sim.js stepJudge). 매 step() 뒤 한 번. 판정 순간이면 true
    pub fn step_judge(&self, j: &mut JudgeState) -> bool {
        j.n += 1;
        let ms = self.max_speed();
        let ok = self.puff.is_none()
            && j.n > JUDGE_MIN_STEPS
            && (ms < JUDGE_EPS || (j.n > JUDGE_LATE_STEPS && ms < JUDGE_LATE_EPS));
        j.quiet = if ok { j.quiet + 1 } else { 0 };
        j.quiet > JUDGE_QUIET_STEPS || j.n >= JUDGE_MAX_STEPS
    }

    // ── 바람 ────────────────────────────────────────────────

    fn new_jit(&mut self) -> Vec<Option<f64>> {
        let mut jit = vec![None; self.discs.len()];
        for i in 0..self.discs.len() {
            if !self.discs[i].removed {
                jit[i] = Some(1.0 + gauss(&mut self.rng) * self.t.jitter);
            }
        }
        jit
    }

    /// 바람! (sim.js blow — 기본 경로 / mouthY 면 blowLip)
    pub fn blow(&mut self, a: &BlowArgs) -> Option<LipGeom> {
        if let Some(my) = a.mouth_y {
            if my.is_finite() {
                return Some(self.blow_lip(a.aim, a.dir_x, a.dir_z, a.power, a.blast, my));
            }
        }
        let len = { let l = hypot2(a.dir_x, a.dir_z); if l == 0.0 { 1.0 } else { l } };
        let (dx, dz) = (a.dir_x / len, a.dir_z / len);
        let (cp, sp) = (libm::cos(a.pitch), libm::sin(a.pitch));
        let d = V3::new(dx * cp, -sp, dz * cp);
        let o = V3::new(a.aim.x - d.x * a.dist, a.aim.y - d.y * a.dist, a.aim.z - d.z * a.dist);
        let jit = self.new_jit();
        self.puff = Some(Puff {
            o,
            d,
            power: a.power,
            t: 0.0,
            jit,
            blast: a.blast,
            up: 0.0,
            down: 0.0,
            spread_k: 1.0,
            disc_only: false,
            lip: false,
            split_u: 1.0,
            split_d: 1.0,
        });
        None
    }

    /// 9차 '입술 높이' (sim.js blowLip)
    pub fn blow_lip(&mut self, aim: V3, dir_x: f64, dir_z: f64, power: f64, blast: f64, mouth_y: f64) -> LipGeom {
        let t = &self.t;
        let len = { let l = hypot2(dir_x, dir_z); if l == 0.0 { 1.0 } else { l } };
        let (ux, uz) = (dir_x / len, dir_z / len);
        let my = t.lip_min_y.max(mouth_y);
        let o = V3::new(aim.x - ux * t.lip_back, my, aim.z - uz * t.lip_back);
        let (vx, vy, vz) = (aim.x - o.x, aim.y - my, aim.z - o.z);
        let l = hypot3(vx, vy, vz);
        let d = V3::new(vx / l, vy / l, vz / l);
        let phi = libm::atan2(vy, t.lip_back);
        let tilt = phi + t.pitch0;
        let st = libm::sin(tilt);
        let up = st.max(0.0);
        let down = (-st).max(0.0);
        let spread_k = 1.0 - t.tilt_spread * (1.0 - libm::cos(tilt));
        let mut blast = blast;
        if down > 0.0 {
            blast *= (1.0 - t.lip_press_blast * down).max(0.0);
        }
        let sp = libm::sin(phi);
        let s0 = -libm::sin(t.pitch0);
        let split_u = (1.0 + sp) / (1.0 + s0);
        let split_d = (1.0 - sp) / (1.0 - s0);
        let jit = self.new_jit();
        self.puff = Some(Puff { o, d, power, t: 0.0, jit, blast, up, down, spread_k, disc_only: true, lip: true, split_u, split_d });
        LipGeom { m: o, phi, tilt, up, down }
    }

    /// 광선의 첫 충돌 (자기 자신 제외). 반환 (동적 딱지인가, toi).
    /// JS castRay 는 마지막 step 끝의 질의 파이프라인을 쓴다 = 지금 자세. 0.36 의 BVH 는 '살찐 AABB' 라
    /// 빨리 움직인 딱지를 놓칠 수 있어, 딱지 ≤ 40장이면 전수 검사가 더 정확하고(같은 답) 결정적이다.
    fn first_hit(&self, origin: V3, dir: V3, max_toi: f64, exclude: ColliderHandle, disc_only: bool) -> Option<(bool, f64)> {
        if !(max_toi > 0.0) {
            return None;
        }
        let ray = Ray::new(origin.to_vec(), dir.to_vec());
        let mut best: Option<(bool, f32)> = None;
        let max = max_toi as f32;
        let mut test = |h: ColliderHandle, dynamic: bool| {
            if h == exclude {
                return;
            }
            let co = &self.world.colliders[h];
            if let Some(toi) = co.shape().cast_ray(co.position(), &ray, max, true) {
                if best.map_or(true, |(_, b)| toi < b) {
                    best = Some((dynamic, toi));
                }
            }
        };
        if !disc_only {
            test(self.ground_collider, false);
        }
        for d in self.discs.iter().filter(|d| !d.removed) {
            test(d.collider, true);
        }
        best.map(|(dy, t)| (dy, t as f64))
    }

    /// 퍼프 1스텝 동안 각 딱지가 받는 바람 (sim.js applyWind, 기본 경로 + lip 경로)
    fn apply_wind(&mut self) {
        let Some(mut p) = self.puff.take() else { return };
        let t = self.t.clone();
        let env = libm::sin((p.t / t.puff_duration).min(1.0) * core::f64::consts::PI);
        self.last_hits.clear();
        for di in 0..self.discs.len() {
            if self.discs[di].removed {
                continue;
            }
            let (bh, ch, id) = (self.discs[di].body, self.discs[di].collider, self.discs[di].id);
            let (c, nrm, mass) = {
                let b = &self.world.bodies[bh];
                (V3::from_vec(b.translation()), rotate(q_from_rot(b.rotation()), V3::new(0.0, 1.0, 0.0)), b.mass() as f64)
            };
            // 입 쪽으로 가장 가까운 가장자리 점
            let (mut vx, mut vy, mut vz) = (p.o.x - c.x, p.o.y - c.y, p.o.z - c.z);
            let dn = vx * nrm.x + vy * nrm.y + vz * nrm.z;
            vx -= dn * nrm.x;
            vy -= dn * nrm.y;
            vz -= dn * nrm.z;
            let vl = { let l = hypot3(vx, vy, vz); if l == 0.0 { 1.0 } else { l } };
            let mut e = V3::new(c.x + (vx / vl) * DISC_R, c.y + (vy / vl) * DISC_R, c.z + (vz / vl) * DISC_R);
            // 제트 축이 원판 평면에서 테두리와 만나는 점
            let mut sin_t = 0.0;
            let mut side = 0.0;
            let mut rh: Option<V3> = None;
            if t.rim_hit != 0.0 {
                let (ox, oy, oz) = (p.o.x - c.x, p.o.y - c.y, p.o.z - c.z);
                let on = ox * nrm.x + oy * nrm.y + oz * nrm.z;
                let (o_x, o_y, o_z) = (ox - on * nrm.x, oy - on * nrm.y, oz - on * nrm.z);
                let dn2 = p.d.x * nrm.x + p.d.y * nrm.y + p.d.z * nrm.z;
                let (mut dx, mut dy, mut dz) = (p.d.x - dn2 * nrm.x, p.d.y - dn2 * nrm.y, p.d.z - dn2 * nrm.z);
                let dl = hypot3(dx, dy, dz);
                if dl > 0.2 {
                    dx /= dl;
                    dy /= dl;
                    dz /= dl;
                    let od = o_x * dx + o_y * dy + o_z * dz;
                    let (px, py, pz) = (o_x - od * dx, o_y - od * dy, o_z - od * dz);
                    let b = hypot3(px, py, pz);
                    let (ex, ey, ez);
                    if b < DISC_R {
                        let tt = -od - libm::sqrt(DISC_R * DISC_R - b * b);
                        ex = o_x + tt * dx;
                        ey = o_y + tt * dy;
                        ez = o_z + tt * dz;
                    } else {
                        ex = (px / b) * DISC_R;
                        ey = (py / b) * DISC_R;
                        ez = (pz / b) * DISC_R;
                    }
                    e = V3::new(c.x + ex, c.y + ey, c.z + ez);
                    sin_t = (b / DISC_R).min(1.0);
                    rh = Some(V3::new(ex / DISC_R, ey / DISC_R, ez / DISC_R));
                    let sv = (ey * dz - ez * dy) * nrm.x + (ez * dx - ex * dz) * nrm.y + (ex * dy - ey * dx) * nrm.z;
                    side = js_sign(sv);
                }
            }
            // 제트 축 기준 위치
            let (rx, ry, rz) = (e.x - p.o.x, e.y - p.o.y, e.z - p.o.z);
            let a = rx * p.d.x + ry * p.d.y + rz * p.d.z;
            if a <= 0.05 {
                continue;
            }
            let (lx, ly, lz) = (rx - a * p.d.x, ry - a * p.d.y, rz - a * p.d.z);
            let lat = hypot3(lx, ly * 1.6, lz);
            let rj = t.jet_r0 + a * t.jet_spread;
            let cone = libm::exp(-((lat / rj) * (lat / rj)));
            if cone < 0.02 {
                continue;
            }
            let jit = p.jit.get(id).copied().flatten().unwrap_or(1.0);
            let mut s = p.power * libm::exp(-a / t.jet_falloff) * cone * env * jit * p.spread_k;
            let mut above = 1.0;
            if p.lip && t.lip_split != 0.0 {
                above = (1.0 + libm::tanh(ly / t.lip_split_w)) / 2.0;
                s *= 1.0 + t.lip_split * (p.split_d + (p.split_u - p.split_d) * above - 1.0);
                above = 1.0 - t.lip_split + t.lip_split * above;
            }
            // 차폐: 입 → 가장자리 사이에 다른 딱지(첫 충돌이 딱지일 때만)
            {
                let rl = hypot3(rx, ry, rz);
                let dir = V3::new(rx / rl, ry / rl, rz / rl);
                if let Some((dynamic, _)) = self.first_hit(p.o, dir, rl - 0.08, ch, p.disc_only) {
                    if dynamic {
                        s *= t.shield;
                    }
                }
            }
            // 가장자리 밑 틈
            let gap = self
                .first_hit(V3::new(e.x, e.y - 0.01, e.z), V3::new(0.0, -1.0, 0.0), 2.0, ch, false)
                .map(|(_, toi)| toi)
                .unwrap_or(2.0);
            let l9 = p.lip;
            let wedge;
            let mut under = 1.0;
            if l9 {
                let air = (gap - (DISC_H / 2.0 - 0.01)).max(0.0);
                under = (air / t.lip_air_ref).min(1.0);
                wedge = (t.lip_gap * p.up * p.power * p.power * above).min(air);
            } else {
                // 기본 경로: up = 0 → wedge = 0 (7·8차 scoop 항은 포팅 안 함)
                wedge = 0.0;
            }
            let lift_f = ((gap + wedge) / t.gap_ref).max(t.min_lift).min(1.35);
            let lift_w = if wedge > 0.0 { lift_f - (gap / t.gap_ref).max(t.min_lift).min(1.35) } else { 0.0 };
            let k = s * mass * t.dt;
            let pw = p.power;
            let bl = p.blast;
            let cos_t = libm::sqrt(1.0 - sin_t * sin_t);
            let rise_share = (if l9 { t.lip_rise } else { 0.25 }).min(1.0);
            let rim_f = if lift_w > 0.0 { lift_f - rise_share * lift_w } else { lift_f };
            let lift_b = t.lift
                * rim_f
                * k
                * (1.0 - t.blast_lift * bl.min(1.0))
                * (1.0 - t.side_lift_loss * (1.0 - cos_t))
                * (1.0 - (if l9 { t.lip_press } else { 0.5 }) * p.down);
            let lift_k = lift_b; // 기본 경로 scoopLift = 0, up = 0
            let rise_k = if lift_w > 0.0 { (lift_b / rim_f) * lift_w * rise_share } else { 0.0 };
            let push_base = t.push * libm::pow(pw, t.push_exp) / pw.max(0.05) * k;
            let push_k = push_base * (1.0 + t.blast_push * bl);
            let (mut fx, mut fz) = (p.d.x, p.d.z);
            if let Some(rh) = rh {
                if sin_t > 0.0 {
                    let w = t.deflect * sin_t;
                    fx = p.d.x * (1.0 - w) - rh.x * w;
                    fz = p.d.z * (1.0 - w) - rh.z * w;
                    let fl = { let l = hypot2(fx, fz); if l == 0.0 { 1.0 } else { l } };
                    let dl = { let l = hypot2(p.d.x, p.d.z); if l == 0.0 { 1.0 } else { l } };
                    fx *= dl / fl;
                    fz *= dl / fl;
                }
            }
            let lift_y = if l9 { lift_k + push_base * p.d.y.max(0.0) * t.lip_push_up * under } else { lift_k };
            let mut rng_torque = None;
            {
                // 오버파워 텀블은 rng 를 쓴다 → 몸체 빌리기 전에 뽑기(순서: x, y, z)
                if pw > t.sweet {
                    let ch_ = (pw - t.sweet) * t.tumble * k;
                    let gx = gauss(&mut self.rng);
                    let gy = gauss(&mut self.rng);
                    let gz = gauss(&mut self.rng);
                    rng_torque = Some(V3::new(gx * ch_, gy * ch_ * 0.3, gz * ch_));
                }
            }
            let b = &mut self.world.bodies[bh];
            b.apply_impulse_at_point(V3::new(fx * push_k, lift_y, fz * push_k).to_vec(), e.to_vec(), true);
            if rise_k > 0.0 {
                let carry = t.lip_carry;
                let (cx, cy, cz) = (p.d.x * carry, 1.0 - carry + p.d.y * carry, p.d.z * carry);
                let cl = { let l = hypot3(cx, cy, cz); if l == 0.0 { 1.0 } else { l } };
                b.apply_impulse(V3::new(rise_k * cx / cl, rise_k * cy / cl, rise_k * cz / cl).to_vec(), true);
            }
            if side != 0.0 && t.spin != 0.0 {
                let tq = t.spin * sin_t * side * k * DISC_R;
                b.apply_torque_impulse(V3::new(nrm.x * tq, nrm.y * tq, nrm.z * tq).to_vec(), true);
            }
            if bl > 0.0 {
                let sh = t.push * t.blast_shove * bl * k;
                b.apply_impulse(V3::new(p.d.x * sh, 0.0, p.d.z * sh).to_vec(), true);
            }
            if let Some(tq) = rng_torque {
                b.apply_torque_impulse(tq.to_vec(), true);
            }
            self.last_hits.push(Hit { id, s, gap, lift_f, e });
        }
        p.t += t.dt;
        if p.t < t.puff_duration {
            self.puff = Some(p);
        }
    }

    // ── 동기·해시 ───────────────────────────────────────────

    /// 상태 해시: 딱지 id 순으로 자세·속도(f32 비트) + 상태 플래그. 같은 시드·같은 입력 → 같은 값이어야 한다
    pub fn state_hash(&self) -> u64 {
        let mut h = Fnv64::new();
        for d in &self.discs {
            h.u64(d.id as u64);
            h.u64((d.removed as u64) | ((d.off as u64) << 1));
            if d.removed {
                continue;
            }
            let b = &self.world.bodies[d.body];
            let tr = b.translation();
            let r = b.rotation();
            let v = b.linvel();
            let w = b.angvel();
            for f in [tr.x, tr.y, tr.z, r.x, r.y, r.z, r.w, v.x, v.y, v.z, w.x, w.y, w.z] {
                h.u32(f.to_bits());
            }
        }
        h.finish()
    }
}
