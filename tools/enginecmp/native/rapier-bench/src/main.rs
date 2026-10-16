//! rapier_bench — Rapier 0.36 (enhanced-determinism) 네이티브 벤치. native/jolt-bench/bench.cpp 와 같은 판:
//!   더미(pile.txt 의 float32 비트) → 가라앉힘 → 합성 샷(adapters/common.mjs applyShotStep 식) → 고정 스텝, 60스텝마다 해시.
//! 솔버 값은 native/puff_sim/src/tune.rs 기본값(게임 v1 = JS 0.12 erp 0.2 를 0.36 스프링으로 옮긴 짝)을 따른다.
//!   rapier_bench <pile.txt> key=value ...   (키: dt substeps gravity hh r iters pgs stab erp staticErp damping allowedErr prediction
//!                                            coulomb warmstart frictionBias sleep sleepLin sleepTime friction restitution floorF floorR
//!                                            linDamp angDamp density ccd steps shotStart shotSteps lo hi lift push mx my mz shield hashEvery)
//! 해시 = FNV-1a 32(바이트) + murmur3 fmix, 딱지 순서 p·q·v·ω float32 (JS Hasher·bench.cpp 와 같은 식).
use rapier3d::prelude::*;
use std::collections::HashMap;
use std::time::Instant;

struct Hasher(u32);
impl Hasher {
    fn u32(&mut self, w: u32) {
        for k in 0..4 {
            self.0 ^= (w >> (8 * k)) & 0xff;
            self.0 = self.0.wrapping_mul(0x0100_0193);
        }
    }
    fn f32(&mut self, x: f32) { self.u32(x.to_bits()); }
    fn fin(&self) -> u32 {
        let mut x = self.0;
        x ^= x >> 16; x = x.wrapping_mul(0x85eb_ca6b);
        x ^= x >> 13; x = x.wrapping_mul(0xc2b2_ae35);
        x ^= x >> 16;
        x
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 { eprintln!("usage: rapier_bench pile.txt key=value..."); std::process::exit(2); }
    let mut a: HashMap<String, String> = HashMap::new();
    for s in &args[2..] { if let Some((k, v)) = s.split_once('=') { a.insert(k.to_string(), v.to_string()); } }
    let num = |k: &str, d: f64| -> f64 { a.get(k).and_then(|v| v.parse().ok()).unwrap_or(d) };

    let txt = std::fs::read_to_string(&args[1]).expect("pile");
    let mut it = txt.split_whitespace();
    let n: usize = it.next().unwrap().parse().unwrap();
    let mut pile = Vec::with_capacity(n);
    for _ in 0..n {
        let mut v = [0f32; 7];
        for k in 0..7 { v[k] = f32::from_bits(u32::from_str_radix(it.next().unwrap(), 16).unwrap()); }
        pile.push(v);
    }

    // 솔버 (puff_sim apply_solver 와 같은 식)
    let dt = num("dt", 1.0 / 120.0);
    let outer = num("substeps", 1.0).max(1.0) as usize;
    let iters = num("iters", 9.0).max(1.0);
    let damping = num("damping", 1.0);
    let spring = |erp: f64| -> (f64, f64) {
        let dt_sub = (dt / outer as f64) / iters;
        let zeta = damping / iters;
        let erp = erp.clamp(1e-4, 0.9999);
        let omega = 2.0 * zeta * erp / ((1.0 - erp) * dt_sub);
        (omega / (2.0 * core::f64::consts::PI), zeta)
    };
    let erp = num("erp", 0.26);
    let static_erp = num("staticErp", 0.16);
    let mut world = PhysicsWorld::new();
    world.gravity = Vector::new(0.0, -(num("gravity", 38.0) as f32), 0.0);
    {
        let ip = &mut world.integration_parameters;
        ip.dt = (dt / outer as f64) as f32;
        ip.num_solver_iterations = iters as usize;
        ip.num_internal_pgs_iterations = num("pgs", 1.0).max(1.0) as usize;
        ip.num_internal_stabilization_iterations = num("stab", 1.0).max(0.0) as usize;
        let (hz, z) = spring(erp);
        ip.contact_softness = SpringCoefficients::new(hz as f32, z as f32);
        let (shz, sz) = if static_erp > 0.0 { spring(static_erp) } else { (hz, z) };
        ip.static_contact_softness = SpringCoefficients::new(shz as f32, sz as f32);
        ip.normalized_allowed_linear_error = num("allowedErr", 0.001) as f32;
        ip.normalized_prediction_distance = num("prediction", 0.002) as f32;
        ip.normalized_max_corrective_velocity = f32::MAX;
        ip.normalized_max_linear_velocity = f32::MAX;
        ip.friction_model = if num("coulomb", 1.0) > 0.5 { FrictionModel::Coulomb } else { FrictionModel::Simplified };
        ip.contact_recycling = false;
        ip.friction_in_bias_pass = num("frictionBias", 1.0) > 0.5;
        ip.warmstart_coefficient = num("warmstart", 1.0) as f32;
        ip.max_ccd_substeps = 1;
    }
    let (_, ground) = world.insert(
        RigidBodyBuilder::fixed().translation(Vector::new(0.0, -0.5, 0.0)),
        ColliderBuilder::cuboid(11.0, 0.5, 8.0).friction(num("floorF", 0.47) as f32).restitution(num("floorR", 0.0) as f32),
    );
    let _ = ground;
    let hh = num("hh", 0.055) as f32;
    let r = num("r", 1.0) as f32;
    let sleep = num("sleep", 1.0) > 0.5;
    let mut bodies = Vec::with_capacity(n);
    let mut cols = Vec::with_capacity(n);
    for v in &pile {
        let rot = Rotation::from_xyzw(v[3], v[4], v[5], v[6]).normalize();
        let body = RigidBodyBuilder::dynamic()
            .pose(Pose::from_parts(Vector::new(v[0], v[1], v[2]), rot))
            .linear_damping(num("linDamp", 0.35) as f32)
            .angular_damping(num("angDamp", 1.0) as f32)
            .ccd_enabled(num("ccd", 1.0) > 0.5)
            .can_sleep(sleep);
        let col = ColliderBuilder::cylinder(hh, r)
            .density(num("density", 1.0) as f32)
            .friction(num("friction", 0.75) as f32)
            .restitution(num("restitution", 0.0) as f32);
        let (bh, ch) = world.insert(body, col);
        {
            let act = world.bodies[bh].activation_mut();
            act.normalized_linear_threshold = num("sleepLin", 0.45) as f32;
            act.time_until_sleep = num("sleepTime", 2.0) as f32;
        }
        bodies.push(bh);
        cols.push(ch);
    }

    let shot_start = num("shotStart", 360.0) as usize;
    let shot_steps = num("shotSteps", 16.0) as usize;
    let lo = num("lo", (n as f64 * 0.4).floor()) as usize;
    let hi = num("hi", (n - 1) as f64) as usize;
    let lift = num("lift", 0.2) as f32;
    let push = num("push", 0.02) as f32;
    let shield = num("shield", 0.35) as f32;
    let m = Vector::new(num("mx", 0.0) as f32, num("my", 0.0) as f32, num("mz", 3.2) as f32);
    let steps = num("steps", 976.0) as usize;
    let every = num("hashEvery", 60.0) as usize;
    let mut off = vec![false; n];
    let mut hashes = Vec::new();
    let mut shielded = 0;

    let hash_state = |w: &PhysicsWorld| -> u32 {
        let mut h = Hasher(0x811c_9dc5);
        for &bh in &bodies {
            let b = &w.bodies[bh];
            let t = b.translation(); h.f32(t.x); h.f32(t.y); h.f32(t.z);
            let q = b.rotation(); h.f32(q.x); h.f32(q.y); h.f32(q.z); h.f32(q.w);
            let v = b.linvel(); h.f32(v.x); h.f32(v.y); h.f32(v.z);
            let av = b.angvel(); h.f32(av.x); h.f32(av.y); h.f32(av.z);
        }
        h.fin()
    };

    let t0 = Instant::now();
    for st in 0..steps {
        if st >= shot_start && st < shot_start + shot_steps {
            for i in lo..=hi {
                let c = world.bodies[bodies[i]].translation();
                let p = Vector::new(c.x, c.y, c.z + 1.0);
                let (dx, dy, dz) = (p.x - m.x, p.y - m.y, p.z - m.z);
                let l = ((dx * dx) + (dy * dy) + (dz * dz)).sqrt();
                let mut k = 1.0f32;
                if (l as f64) > 0.08 {
                    let dir = Vector::new(dx / l, dy / l, dz / l);
                    let max = ((l as f64) - 0.08) as f32;
                    let ray = Ray::new(m, dir);
                    // 전수 검사(puff_sim first_hit 과 같은 방식: 결정적, 딱지 ≤ 수십 장)
                    let mut hit = false;
                    for (j, &ch) in cols.iter().enumerate() {
                        if j == i || off[j] { continue; }
                        let co = &world.colliders[ch];
                        if co.shape().cast_ray(co.position(), &ray, max, true).is_some() { hit = true; break; }
                    }
                    if hit { k = shield; shielded += 1; }
                }
                world.bodies[bodies[i]].apply_impulse_at_point(Vector::new(0.0, lift * k, -(push * k)), p, true);
            }
        }
        for _ in 0..outer { world.step(); }
        for i in 0..n {
            if off[i] { continue; }
            let p = world.bodies[bodies[i]].translation();
            if (p.y as f64) < -3.0 {
                off[i] = true;
                let b = &mut world.bodies[bodies[i]];
                b.set_gravity_scale(0.0, false);
                b.set_linvel(Vector::ZERO, false);
                b.set_angvel(Vector::ZERO, false);
                b.set_translation(Vector::new(p.x, -4.0, p.z), false);
            }
        }
        if (st + 1) % every == 0 { hashes.push(hash_state(&world)); }
    }
    let ms = t0.elapsed().as_secs_f64() * 1000.0 / steps as f64;
    let sleeping = bodies.iter().filter(|&&bh| world.bodies[bh].is_sleeping()).count();
    let offc = off.iter().filter(|&&x| x).count();
    let hs: Vec<String> = hashes.iter().map(|h| format!("\"{:08x}\"", h)).collect();
    println!(
        "{{\"engine\":\"rapier-native\",\"version\":\"0.36.0\",\"arch\":\"{}\",\"n\":{},\"steps\":{},\"msPerStep\":{:.4},\"shielded\":{},\"sleeping\":{},\"off\":{},\"final\":\"{:08x}\",\"hashes\":[{}]}}",
        std::env::consts::ARCH, n, steps, ms, shielded, sleeping, offc, hash_state(&world), hs.join(",")
    );
}
