use puff_sim::{Table, Tune};
use rapier3d::prelude::*;
use std::time::Instant;
fn main() {
    let mut t = Tune::default();
    if let Ok(spec) = std::env::var("TUNE") { t.apply_overrides(&spec).unwrap(); }
    let ns: Vec<usize> = std::env::var("NS").unwrap_or("20,40,64".into()).split(',').map(|s| s.parse().unwrap()).collect();
    let seeds: u32 = std::env::var("SEEDS").ok().and_then(|s| s.parse().ok()).unwrap_or(5);
    let spread: f64 = std::env::var("SPREAD").ok().and_then(|s| s.parse().ok()).unwrap_or(0.04);
    let h = 0.048f64;
    for n in ns {
        let mut collapsed = 0; let mut tops = vec![]; let mut bots = vec![]; let mut vmaxs = vec![];
        let mut step_us = vec![]; let mut worst = 0f64;
        for s in 1..=seeds {
            let mut tb = Table::with_tune(s * 7907 + n as u32, t.clone());
            tb.add_pile(n, spread, (0.0, 0.0), &[]);
            for _ in 0..360u32 {
                let t0 = Instant::now(); tb.step(); let us = t0.elapsed().as_secs_f64() * 1e6;
                step_us.push(us); if us > worst { worst = us; }
            }
            let top = tb.column_top(); let nom = n as f64 * h;
            let mut ys: Vec<f64> = (0..n).map(|k| tb.pos(k).y).collect();
            ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let vm = tb.max_speed();
            if top < 0.9 * nom { collapsed += 1; }
            tops.push(top / nom); bots.push(ys[0]); vmaxs.push(vm);
        }
        step_us.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mean: f64 = step_us.iter().sum::<f64>() / step_us.len() as f64;
        let p99 = step_us[(step_us.len() as f64 * 0.99) as usize];
        let mn = tops.iter().cloned().fold(9.0, f64::min);
        println!("n={n:3} top/nom min {:.3} mean {:.3} | bottom y min {:.4} (t/2={:.3}) | vmax@3s max {:.3} | collapsed {collapsed}/{seeds} | step mean {:.0}us p99 {:.0}us worst {:.0}us",
            mn, tops.iter().sum::<f64>() / tops.len() as f64, bots.iter().cloned().fold(9.0, f64::min), h/2.0, vmaxs.iter().cloned().fold(0.0, f64::max), mean, p99, worst);
        // ray bench: 3200 rays, brute force over discs
        if std::env::var("RAYS").is_ok() {
            let mut tb = Table::with_tune(7, t.clone());
            tb.add_pile(n, spread, (0.0, 0.0), &[]);
            for _ in 0..240 { tb.step(); }
            let mouth = Vector::new(0.0, 1.8, 4.6);
            let mut pts = vec![];
            for k in 0..n { let p = tb.pos(k); for a in 0..50 { let ang = a as f64 * 0.1256; pts.push(Vector::new((p.x + ang.cos()) as f32, (p.y) as f32, (p.z + ang.sin()) as f32)); } }
            let t0 = Instant::now(); let mut hits = 0u32;
            for p in &pts {
                let d = *p - mouth; let len = d.length(); let ray = Ray::new(mouth, d / len);
                let mut best = f32::MAX;
                for dd in tb.discs.iter() { let co = &tb.world.colliders[dd.collider]; if let Some(toi) = co.shape().cast_ray(co.position(), &ray, len - 0.01, true) { if toi < best { best = toi; } } }
                if best < f32::MAX { hits += 1; }
            }
            let el = t0.elapsed().as_secs_f64() * 1e6;
            println!("   rays {} brute-force over {n} discs: {:.0} us total ({:.2} us/ray), occluded {}", pts.len(), el, el / pts.len() as f64, hits);
        }
    }
}
