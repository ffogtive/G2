//! 재현 가능한 난수 — sim.js `mulberry32` / `gauss` 와 비트 단위로 같은 수열.
//! (같은 시드 → JS 와 같은 더미 배치·같은 jitter. 물리 엔진만 다르게 해서 비교할 수 있다.)

#[derive(Clone, Debug)]
pub struct Mulberry32 {
    a: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { a: seed }
    }

    /// 지금 내부 상태(다음 수를 뽑기 전). `Mulberry32::new(state)` 로 같은 자리에서 이어 뽑는다
    /// — Dart 가 숨 해석(resolveShot)에 쓴 난수 줄기를 물리(jitter·텀블)로 그대로 넘길 때 쓴다(turn.js ShotRun 과 같은 소비 순서).
    pub fn state(&self) -> u32 {
        self.a
    }

    /// JS: a = (a + 0x6d2b79f5)|0; t = imul(a ^ a>>>15, 1|a); t = (t + imul(t ^ t>>>7, 61|t)) ^ t; ((t ^ t>>>14)>>>0) / 2^32
    #[inline]
    pub fn next_f64(&mut self) -> f64 {
        self.a = self.a.wrapping_add(0x6d2b_79f5);
        let a = self.a;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

/// Box–Muller (sim.js `gauss`). u, v 가 0 이면 다시 뽑는다 — 소비 순서까지 JS 와 같게.
pub fn gauss(rng: &mut Mulberry32) -> f64 {
    let mut u = 0.0;
    while u == 0.0 {
        u = rng.next_f64();
    }
    let mut v = 0.0;
    while v == 0.0 {
        v = rng.next_f64();
    }
    libm::sqrt(-2.0 * libm::log(u)) * libm::cos(2.0 * core::f64::consts::PI * v)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_js_mulberry32() {
        // node -e "…mulberry32(12345)…" 로 뽑은 앞 4개
        let mut r = Mulberry32::new(12345);
        let got: Vec<f64> = (0..4).map(|_| r.next_f64()).collect();
        let want = [0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203];
        for (g, w) in got.iter().zip(want.iter()) {
            assert_eq!(g, w);
        }
    }
}
