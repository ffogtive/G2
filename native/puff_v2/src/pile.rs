//! 정직한 더미 (D3·D4·D11·D12, §4.2·§4.3) + 책상 + rapier 월드.
//!
//! - 딱지마다 두께 = max(0.040, 0.032 + a_i) u, 질량 1.18 g 직접 지정, 원기둥 R 1 (평평한 충돌체).
//! - 휨(평평 30% / 굽음 35% / 말림 25% / 오목 10%, a 로그정규 중앙값 0.020·p90 0.045·상한 0.064, 방향 ψ)은
//!   **딱지별 상태**로만 들고 다닌다. 충돌체는 평평하고, 휨은 공력 틈(F4)과 렌더에만 쓴다(D4).
//! - 접촉 300 Hz·ζ 10 (책상 포함), 서브스텝 12 @120 Hz / 제트 중 3 @480 Hz(둘 다 1440 Hz), μ 0.45/0.38 Coulomb,
//!   허용 오차 0.0005·예측 0.002, 감쇠 0/0, 모든 딱지 CCD.
//! - 무작위는 여기(더미 생성)에서만 쓴다(D11).

use crate::geom::{Qt, V3};
use crate::rng::Mulberry32;
use crate::units::{DISC_MASS, MIN_T, PAPER_T, R};
use rapier3d::prelude::*;

/// 휨 종류 (§4.3)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WarpKind {
    Flat,
    Bend,
    Curl,
    Dish,
}

impl WarpKind {
    pub fn name(self) -> &'static str {
        match self {
            WarpKind::Flat => "flat",
            WarpKind::Bend => "bend",
            WarpKind::Curl => "curl",
            WarpKind::Dish => "dish",
        }
    }
}

/// 딱지 한 장의 고정 상태 (생성 때 시드로 정함)
#[derive(Clone, Copy, Debug)]
pub struct DiscProps {
    /// 콜라이더 두께 (u)
    pub h: f64,
    pub kind: WarpKind,
    /// 휨 크기 a (u) — 테두리 들림의 최대
    pub a: f64,
    /// 휨 방향 ψ (딱지 로컬 x→z 평면의 방위, rad)
    pub psi: f64,
    pub mass: f64,
}

impl DiscProps {
    /// 테두리 들림 δ(φ) — φ 는 딱지 로컬 방위 (§4.3 표)
    #[inline]
    pub fn delta(&self, phi: f64) -> f64 {
        match self.kind {
            WarpKind::Flat => 0.0,
            WarpKind::Bend => {
                let s = libm::sin(phi - self.psi);
                self.a * s * s
            }
            WarpKind::Curl => {
                let c = libm::cos(phi - self.psi);
                if c > 0.0 {
                    self.a * c * c * c
                } else {
                    0.0
                }
            }
            WarpKind::Dish => self.a,
        }
    }
}

/// 더미 만들기 손잡이 (§4.2·§4.3·§4.11 범위)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PileParams {
    pub n: usize,
    pub seed: u32,
    /// 장마다 수평 어긋남 σ_s (u). 기본 0.04, 레벨 손잡이 0.02~0.08
    pub sigma_s: f64,
    /// 휨 배율 (0.5~1.5)
    pub warp_scale: f64,
    /// 휨 종류 비율 평평·굽음·말림·오목
    pub mix: [f64; 4],
    /// 휨 a 로그정규: 중앙값·p90·상한 (u)
    pub a_med: f64,
    pub a_p90: f64,
    pub a_cap: f64,
    /// 책상 앞 모서리까지 들여 놓은 거리 s = z_e − z_f (u). 음수 = 돌출 o = −s
    pub inset: f64,
    /// 진단 고정(시험 장치, 게임 손잡이 아님): 위에서 `force_top` 장(0 = 전부)의 휨을 (종류, a, 세계 방위°) 로 덮어씀.
    /// 세계 방위 90° = +z = 입 쪽 (A0.3b 말림 쐐기 같은 단위 시험용)
    pub force_warp: Option<(WarpKind, f64, f64)>,
    pub force_top: usize,
}

impl PileParams {
    pub fn new(n: usize, seed: u32) -> Self {
        Self {
            n,
            seed,
            sigma_s: 0.04,
            warp_scale: 1.0,
            mix: [0.30, 0.35, 0.25, 0.10],
            a_med: 0.020,
            a_p90: 0.045,
            a_cap: 0.064,
            inset: 8.0,
            force_warp: None,
            force_top: 0,
        }
    }
    /// 캐시 열쇠
    pub fn key(&self) -> String {
        format!(
            "{}|{}|{:.6}|{:.6}|{:.4},{:.4},{:.4},{:.4}|{:.6}|{:.6}|{:.6}|{:.6}|{:?}|{}",
            self.n,
            self.seed,
            self.sigma_s,
            self.warp_scale,
            self.mix[0],
            self.mix[1],
            self.mix[2],
            self.mix[3],
            self.a_med,
            self.a_p90,
            self.a_cap,
            self.inset,
            self.force_warp,
            self.force_top
        )
    }
}

/// 딱지 생성 결과 (물리 월드 밖에서 순수하게 — 시드 → 상태)
#[derive(Clone, Debug)]
pub struct PileLayout {
    pub props: Vec<DiscProps>,
    /// 중심 (가라앉히기 전 명목 위치)
    pub pos: Vec<V3>,
    /// 자세 (그림 면 = 로컬 +y, 처음엔 아래)
    pub rot: Vec<Qt>,
    /// 명목 높이 Σ 두께
    pub nominal: f64,
}

pub fn make_layout(p: &PileParams) -> PileLayout {
    let mut rng = Mulberry32::new(p.seed ^ 0x9e37_79b9u32.wrapping_mul(p.n as u32 + 1));
    let mu = libm::log(p.a_med);
    let sig = libm::log(p.a_p90 / p.a_med) / 1.281_551_565_545;
    let tot: f64 = p.mix.iter().sum();
    let mut props = Vec::with_capacity(p.n);
    let mut pos = Vec::with_capacity(p.n);
    let mut rot = Vec::with_capacity(p.n);
    let mut y = 0.0;
    for i in 0..p.n {
        // 순서 고정: 종류 → 크기 → 방향 → 어긋남 x,z → 그림 회전
        let u = rng.next_f64() * tot;
        let kind = if u < p.mix[0] {
            WarpKind::Flat
        } else if u < p.mix[0] + p.mix[1] {
            WarpKind::Bend
        } else if u < p.mix[0] + p.mix[1] + p.mix[2] {
            WarpKind::Curl
        } else {
            WarpKind::Dish
        };
        let g = rng.gauss();
        let mut a = libm::exp(mu + sig * g) * p.warp_scale;
        if a > p.a_cap {
            a = p.a_cap;
        }
        if kind == WarpKind::Flat {
            a = 0.0;
        }
        let psi = rng.next_f64() * 2.0 * core::f64::consts::PI;
        let ox = rng.gauss() * p.sigma_s;
        let oz = rng.gauss() * p.sigma_s;
        let spin = rng.next_f64() * 2.0 * core::f64::consts::PI;
        let (mut kind, mut a, mut psi) = (kind, a, psi);
        if let Some((fk, fa, az_deg)) = p.force_warp {
            if p.force_top == 0 || i + p.force_top >= p.n {
                kind = fk;
                a = if fk == WarpKind::Flat { 0.0 } else { fa };
                // 로컬 방위 φ 의 세계 방향 = (cos(φ+spin), 0, −sin(φ+spin)) → 세계 방위 az(x→z) 를 가리키려면 φ = −az − spin
                psi = -az_deg * core::f64::consts::PI / 180.0 - spin;
            }
        }
        let h = if PAPER_T + a > MIN_T { PAPER_T + a } else { MIN_T };
        props.push(DiscProps { h, kind, a, psi, mass: DISC_MASS });
        // 그림 면 아래(로컬 +y → 세계 −y): x 축 π, 그 위에 세계 y 축 spin
        let q = Qt::axis_angle(V3::Y, spin).mul(Qt::axis_angle(V3::new(1.0, 0.0, 0.0), core::f64::consts::PI));
        pos.push(V3::new(ox, y + h * 0.5 + 1e-5 * i as f64, oz));
        rot.push(q.normalized());
        y += h;
        let _ = i;
    }
    PileLayout { props, pos, rot, nominal: y }
}

/// 솔버 설정 (§4.2 표)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SolverCfg {
    pub contact_hz: f64,
    pub contact_zeta: f64,
    pub mu_pp: f64,
    pub mu_pt: f64,
    pub allowed_err: f64,
    pub prediction: f64,
    pub gyro: bool,
    /// 120 Hz 바깥 스텝의 서브스텝 (12 → 1440 Hz). 대비책 400 Hz × 16 (1920 Hz, §4.2)
    pub sub_rest: usize,
    /// 480 Hz 바깥 스텝의 서브스텝 (3 → 1440 Hz)
    pub sub_jet: usize,
    /// 서브스텝마다 솔버 반복 (물리 손잡이 아님 — 수렴 정밀도). 1/1 이면 64장에서 3 s 뒤 떨림 0.1 u/s 가 남는다(G1 실측)
    pub pgs_iters: usize,
    pub stab_iters: usize,
}

impl Default for SolverCfg {
    fn default() -> Self {
        Self {
            contact_hz: 300.0,
            contact_zeta: 10.0,
            mu_pp: 0.45,
            mu_pt: 0.38,
            allowed_err: 0.0005,
            prediction: 0.002,
            gyro: true,
            sub_rest: 12,
            sub_jet: 3,
            pgs_iters: 2,
            stab_iters: 2,
        }
    }
}

impl SolverCfg {
    /// 설계서 §4.2 대비책: 400 Hz × 16 (1920 Hz), 제트 중 1/480 × 4
    pub fn fallback_1920() -> Self {
        Self { contact_hz: 400.0, sub_rest: 16, sub_jet: 4, ..Self::default() }
    }
}

/// 바깥 스텝 일정 (D15): 제트 중 1/480 × 3, 아니면 1/120 × 12 (둘 다 서브스텝 1440 Hz)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rate {
    Rest120,
    Jet480,
}

impl Rate {
    pub fn dt(self) -> f64 {
        match self {
            Rate::Rest120 => 1.0 / 120.0,
            Rate::Jet480 => 1.0 / 480.0,
        }
    }
    pub fn substeps(self, c: &SolverCfg) -> usize {
        match self {
            Rate::Rest120 => c.sub_rest,
            Rate::Jet480 => c.sub_jet,
        }
    }
}

/// 책상 판 (§4.5: 두께 1 u, 모서리 반경 0.08 u). 앞 모서리 z_e, 윗면 y = 0
pub const DESK_HX: f64 = 11.0;
pub const DESK_DEPTH: f64 = 20.0;
pub const DESK_ROUND: f64 = 0.08;

#[derive(Clone, Copy, Debug)]
pub struct Desk {
    pub z_e: f64,
    pub lo: V3,
    pub hi: V3,
}

impl Desk {
    pub fn new(z_e: f64) -> Self {
        Self { z_e, lo: V3::new(-DESK_HX, -1.0, z_e - DESK_DEPTH), hi: V3::new(DESK_HX, 0.0, z_e) }
    }
    /// (x, z) 가 책상 윗면 위인가
    #[inline]
    pub fn over(&self, x: f64, z: f64) -> bool {
        x >= self.lo.x && x <= self.hi.x && z >= self.lo.z && z <= self.hi.z
    }
}

pub struct DiscBody {
    pub body: RigidBodyHandle,
    pub collider: ColliderHandle,
    /// 책상 아래로 떨어져(y < −3) 월드에서 뺐다
    pub removed: bool,
}

/// rapier 월드 + 더미 + 책상
pub struct Sim {
    pub world: PhysicsWorld,
    pub discs: Vec<DiscBody>,
    pub props: Vec<DiscProps>,
    pub desk_collider: ColliderHandle,
    pub desk: Desk,
    /// 더미 중심 (x, z) — 분필 원의 중심
    pub center: (f64, f64),
    /// 더미 앞면 z_f (명목: 중심 + R)
    pub z_f: f64,
    pub nominal: f64,
    pub cfg: SolverCfg,
    pub rate: Rate,
    pub time: f64,
}

/// 가라앉힌 더미 사본 (같은 시드의 여러 팔이 같은 더미에서 출발 — CRN)
pub struct Snapshot {
    gravity: Vector,
    ip: IntegrationParameters,
    islands: IslandManager,
    broad_phase: BroadPhaseBvh,
    narrow_phase: NarrowPhase,
    bodies: RigidBodySet,
    colliders: ColliderSet,
    impulse_joints: ImpulseJointSet,
    multibody_joints: MultibodyJointSet,
    soft_bodies: SoftBodySet,
    discs: Vec<(RigidBodyHandle, ColliderHandle, bool)>,
    props: Vec<DiscProps>,
    desk_collider: ColliderHandle,
    desk: Desk,
    center: (f64, f64),
    z_f: f64,
    nominal: f64,
    cfg: SolverCfg,
    pub settle_steps: u32,
}

#[inline]
pub fn to_vec(v: V3) -> Vector {
    Vector::new(v.x as f32, v.y as f32, v.z as f32)
}
#[inline]
pub fn from_vec(v: Vector) -> V3 {
    V3::new(v.x as f64, v.y as f64, v.z as f64)
}

impl Sim {
    /// 더미 생성 + 월드 구성 (가라앉히기 전)
    pub fn build(p: &PileParams, cfg: SolverCfg) -> Sim {
        let lay = make_layout(p);
        let mut world = PhysicsWorld::new();
        world.gravity = Vector::new(0.0, -(crate::units::G_SIM as f32), 0.0);
        let z_f = R; // 더미 중심 (0,0), 앞면 = +R
        let desk = Desk::new(z_f + p.inset);
        let hz = DESK_DEPTH * 0.5;
        let (_, desk_collider) = world.insert(
            RigidBodyBuilder::fixed().translation(Vector::new(0.0, -0.5, (desk.z_e - hz) as f32)),
            ColliderBuilder::round_cuboid(
                (DESK_HX - DESK_ROUND) as f32,
                (0.5 - DESK_ROUND) as f32,
                (hz - DESK_ROUND) as f32,
                DESK_ROUND as f32,
            )
            .friction(cfg.mu_pt as f32)
            .friction_combine_rule(CoefficientCombineRule::Min)
            .restitution(0.0),
        );
        let mut discs = Vec::with_capacity(p.n);
        for i in 0..p.n {
            let pr = lay.props[i];
            let q = lay.rot[i];
            let rot = Rotation::from_xyzw(q.x as f32, q.y as f32, q.z as f32, q.w as f32).normalize();
            let body = RigidBodyBuilder::dynamic()
                .pose(Pose::from_parts(to_vec(lay.pos[i]), rot))
                .linear_damping(0.0)
                .angular_damping(0.0)
                .ccd_enabled(true)
                .gyroscopic_forces_enabled(cfg.gyro)
                .can_sleep(true);
            let col = ColliderBuilder::cylinder((pr.h * 0.5) as f32, R as f32)
                .mass(pr.mass as f32)
                .friction(cfg.mu_pp as f32)
                .friction_combine_rule(CoefficientCombineRule::Min)
                .restitution(0.0);
            let (bh, ch) = world.insert(body, col);
            {
                let a = world.bodies[bh].activation_mut();
                a.normalized_linear_threshold = 0.02;
                a.angular_threshold = 0.02;
                a.time_until_sleep = 0.5;
            }
            discs.push(DiscBody { body: bh, collider: ch, removed: false });
        }
        let mut s = Sim {
            world,
            discs,
            props: lay.props,
            desk_collider,
            desk,
            center: (0.0, 0.0),
            z_f,
            nominal: lay.nominal,
            cfg,
            rate: Rate::Rest120,
            time: 0.0,
        };
        s.set_rate(Rate::Rest120);
        s
    }

    pub fn set_rate(&mut self, r: Rate) {
        self.rate = r;
        let c = self.cfg;
        let ip = &mut self.world.integration_parameters;
        ip.dt = r.dt() as f32;
        ip.num_solver_iterations = r.substeps(&c);
        ip.num_internal_pgs_iterations = c.pgs_iters.max(1);
        ip.num_internal_stabilization_iterations = c.stab_iters;
        ip.contact_softness = SpringCoefficients::new(c.contact_hz as f32, c.contact_zeta as f32);
        ip.static_contact_softness = SpringCoefficients::new(c.contact_hz as f32, c.contact_zeta as f32);
        ip.normalized_allowed_linear_error = c.allowed_err as f32;
        ip.normalized_prediction_distance = c.prediction as f32;
        ip.friction_model = FrictionModel::Coulomb;
        ip.friction_in_bias_pass = false;
        // 재활용 거리 기본 0.05 u = 딱지 두께라 접촉이 낡는다 → 끔
        ip.contact_recycling = false;
        ip.max_ccd_substeps = 1;
        ip.warmstart_coefficient = 1.0;
    }

    pub fn n(&self) -> usize {
        self.discs.len()
    }

    #[inline]
    pub fn pos(&self, i: usize) -> V3 {
        from_vec(self.world.bodies[self.discs[i].body].translation())
    }
    #[inline]
    pub fn rot(&self, i: usize) -> Qt {
        let r = self.world.bodies[self.discs[i].body].rotation();
        Qt { x: r.x as f64, y: r.y as f64, z: r.z as f64, w: r.w as f64 }
    }
    #[inline]
    pub fn linvel(&self, i: usize) -> V3 {
        from_vec(self.world.bodies[self.discs[i].body].linvel())
    }
    #[inline]
    pub fn angvel(&self, i: usize) -> V3 {
        from_vec(self.world.bodies[self.discs[i].body].angvel())
    }

    /// 그림 면(로컬 +y)의 세계 y 성분: +1 = 뒤집힘(그림 위)
    pub fn face_up(&self, i: usize) -> f64 {
        self.rot(i).rotate(V3::Y).y
    }

    /// 가장 빠른 점 속력 max(|v|, |ω|·R) (판정 정지·G1)
    pub fn max_speed(&self) -> f64 {
        let mut m = 0.0f64;
        for i in 0..self.n() {
            if self.discs[i].removed {
                continue;
            }
            let v = self.linvel(i).len();
            let w = self.angvel(i).len() * R;
            if v > m {
                m = v;
            }
            if w > m {
                m = w;
            }
        }
        m
    }

    /// 더미 꼭대기 높이 (딱지 윗면 중 최고)
    pub fn column_top(&self) -> f64 {
        let mut top = 0.0f64;
        for i in 0..self.n() {
            if self.discs[i].removed {
                continue;
            }
            let c = self.pos(i);
            let up = self.rot(i).rotate(V3::Y);
            // 기울어진 원기둥 윗점: 중심 + h/2·|up.y| + R·√(1−up.y²)
            let uy = libm::fabs(up.y);
            let t = c.y + self.props[i].h * 0.5 * uy + R * libm::sqrt((1.0 - uy * uy).max(0.0));
            if t > top {
                top = t;
            }
        }
        top
    }

    pub fn step(&mut self) {
        self.world.step();
        self.time += self.rate.dt();
        // 책상 밖으로 떨어진 딱지는 y < −3 에서 월드에서 뺀다(원 밖 판정은 그대로)
        for i in 0..self.discs.len() {
            if self.discs[i].removed {
                continue;
            }
            let p = self.world.bodies[self.discs[i].body].translation();
            if p.y < -3.0 {
                let bh = self.discs[i].body;
                self.world.remove_body(bh);
                self.discs[i].removed = true;
            }
        }
    }

    /// 가라앉히기: 최소 min_s 초, 점 속력 < eps 가 0.25 s 이어지면 멈춤, 최대 max_s 초. 반환 = 스텝 수
    pub fn settle(&mut self, min_s: f64, max_s: f64, eps: f64) -> u32 {
        self.set_rate(Rate::Rest120);
        let dt = self.rate.dt();
        let max_steps = libm::ceil(max_s / dt) as u32;
        let min_steps = libm::ceil(min_s / dt) as u32;
        let need = libm::ceil(0.25 / dt) as u32;
        let mut quiet = 0u32;
        for k in 0..max_steps {
            self.step();
            if self.max_speed() < eps {
                quiet += 1;
            } else {
                quiet = 0;
            }
            if k + 1 >= min_steps && quiet >= need {
                return k + 1;
            }
        }
        max_steps
    }

    pub fn snapshot(&self, settle_steps: u32) -> Snapshot {
        let w = &self.world;
        Snapshot {
            gravity: w.gravity,
            ip: w.integration_parameters,
            islands: w.islands.clone(),
            broad_phase: w.broad_phase.clone(),
            narrow_phase: w.narrow_phase.clone(),
            bodies: w.bodies.clone(),
            colliders: w.colliders.clone(),
            impulse_joints: w.impulse_joints.clone(),
            multibody_joints: w.multibody_joints.clone(),
            soft_bodies: w.soft_bodies.clone(),
            discs: self.discs.iter().map(|d| (d.body, d.collider, d.removed)).collect(),
            props: self.props.clone(),
            desk_collider: self.desk_collider,
            desk: self.desk,
            center: self.center,
            z_f: self.z_f,
            nominal: self.nominal,
            cfg: self.cfg,
            settle_steps,
        }
    }

    /// 사본에서 새 월드 (파이프라인·CCD 작업 공간은 새로) — 캐시를 쓰든 안 쓰든 샷은 언제나 이 길로 시작한다(결정성)
    pub fn restore(s: &Snapshot) -> Sim {
        let world = PhysicsWorld {
            gravity: s.gravity,
            integration_parameters: s.ip,
            physics_pipeline: PhysicsPipeline::new(),
            collision_pipeline: CollisionPipeline::new(),
            islands: s.islands.clone(),
            broad_phase: s.broad_phase.clone(),
            narrow_phase: s.narrow_phase.clone(),
            bodies: s.bodies.clone(),
            colliders: s.colliders.clone(),
            impulse_joints: s.impulse_joints.clone(),
            multibody_joints: s.multibody_joints.clone(),
            soft_bodies: s.soft_bodies.clone(),
            ccd_solver: CCDSolver::new(),
        };
        let mut sim = Sim {
            world,
            discs: s.discs.iter().map(|&(b, c, r)| DiscBody { body: b, collider: c, removed: r }).collect(),
            props: s.props.clone(),
            desk_collider: s.desk_collider,
            desk: s.desk,
            center: s.center,
            z_f: s.z_f,
            nominal: s.nominal,
            cfg: s.cfg,
            rate: Rate::Rest120,
            time: 0.0,
        };
        sim.set_rate(Rate::Rest120);
        sim
    }

    /// 상태 해시 (FNV-1a 64, f32 비트) — 결정성 확인용
    pub fn state_hash(&self) -> u64 {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        let mut eat = |b: &[u8]| {
            for &x in b {
                h ^= x as u64;
                h = h.wrapping_mul(0x0000_0100_0000_01b3);
            }
        };
        for d in &self.discs {
            if d.removed {
                eat(&[0xff]);
                continue;
            }
            let b = &self.world.bodies[d.body];
            let t = b.translation();
            let r = b.rotation();
            for v in [t.x, t.y, t.z, r.x, r.y, r.z, r.w] {
                eat(&v.to_bits().to_le_bytes());
            }
        }
        h
    }
}

impl Snapshot {
    pub fn nominal(&self) -> f64 {
        self.nominal
    }
}
