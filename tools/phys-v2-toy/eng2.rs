use puff_sim::{Table, Tune};
use rapier3d::prelude::*;
use std::time::Instant;
// analytic ray vs flat cylinder (local frame: axis y, half-height hh, radius r). returns toi
fn ray_cyl(o: Vector, d: Vector, iso: &Pose, hh: f32, r: f32, maxt: f32) -> Option<f32> {
    let inv = iso.inverse();
    let lo = inv * o; let ld = inv.rotation * d;
    // slab
    let (mut t0, mut t1) = (0.0f32, maxt);
    if ld.y.abs() < 1e-9 { if lo.y.abs() > hh { return None; } } else {
        let a = (-hh - lo.y) / ld.y; let b = (hh - lo.y) / ld.y; let (a, b) = if a < b { (a, b) } else { (b, a) };
        t0 = t0.max(a); t1 = t1.min(b); if t0 > t1 { return None; } }
    // circle
    let aa = ld.x * ld.x + ld.z * ld.z; let bb = 2.0 * (lo.x * ld.x + lo.z * ld.z); let cc = lo.x * lo.x + lo.z * lo.z - r * r;
    if aa < 1e-12 { if cc > 0.0 { return None; } } else {
        let disc = bb * bb - 4.0 * aa * cc; if disc < 0.0 { return None; }
        let s = disc.sqrt(); let c0 = (-bb - s) / (2.0 * aa); let c1 = (-bb + s) / (2.0 * aa);
        t0 = t0.max(c0); t1 = t1.min(c1); if t0 > t1 { return None; } }
    Some(t0)
}
fn main() {
    let mut t = Tune::default();
    if let Ok(spec) = std::env::var("TUNE") { t.apply_overrides(&spec).unwrap(); }
    for n in [20usize, 40, 64] {
        let mut tb = Table::with_tune(7, t.clone());
        tb.add_pile(n, 0.04, (0.0, 0.0), &[]);
        let mut worst = (0f64, 0u32);
        for i in 0..240u32 { let t0 = Instant::now(); tb.step(); let us = t0.elapsed().as_secs_f64()*1e6; if us > worst.0 { worst = (us, i); } }
        let mouth = Vector::new(0.0, 1.8, 4.6);
        let mut pts = vec![];
        for k in 0..n { let p = tb.pos(k); for a in 0..50 { let ang = a as f64 * 0.1256; pts.push(Vector::new((p.x + ang.cos()) as f32, p.y as f32, (p.z + ang.sin()) as f32)); } }
        // AABB prefilter + parry
        let aabbs: Vec<_> = tb.discs.iter().map(|dd| tb.world.colliders[dd.collider].compute_aabb()).collect();
        let t0 = Instant::now(); let mut cand = 0u64; let mut h1 = 0;
        for p in &pts { let d = *p - mouth; let len = d.length(); let ray = Ray::new(mouth, d / len); let mut best = f32::MAX;
            for (i, dd) in tb.discs.iter().enumerate() { if aabbs[i].cast_local_ray(&ray, len - 0.01, true).is_none() { continue; } cand += 1;
                let co = &tb.world.colliders[dd.collider]; if let Some(toi) = co.shape().cast_ray(co.position(), &ray, len - 0.01, true) { if toi < best { best = toi; } } }
            if best < f32::MAX { h1 += 1; } }
        let e1 = t0.elapsed().as_secs_f64()*1e6;
        // analytic
        let t0 = Instant::now(); let mut h2 = 0;
        for p in &pts { let d = *p - mouth; let len = d.length(); let dn = d / len; let mut best = f32::MAX;
            for dd in tb.discs.iter() { let co = &tb.world.colliders[dd.collider]; if let Some(toi) = ray_cyl(mouth, dn, co.position(), 0.024, 1.0, len - 0.01) { if toi < best { best = toi; } } }
            if best < f32::MAX { h2 += 1; } }
        let e2 = t0.elapsed().as_secs_f64()*1e6;
        println!("n={n}: worst settle step {:.0}us at step {} | rays {}: AABB+parry {:.0}us ({:.2}us/ray, {:.1} cand/ray, occl {h1}) | analytic brute {:.0}us ({:.3}us/ray, occl {h2})",
            worst.0, worst.1, pts.len(), e1, e1/pts.len() as f64, cand as f64/pts.len() as f64, e2, e2/pts.len() as f64);
    }
}
