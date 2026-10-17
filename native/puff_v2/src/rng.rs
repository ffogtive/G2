//! 재현 가능한 난수 — 더미를 만들 때만 쓴다 (D11). 공력 모듈(jet·aero·cavity)은 이 모듈을 쓰지 않는다 (H4).
//! mulberry32 / Box–Muller 는 sim.js·puff_sim 과 같은 수열.

#[derive(Clone, Debug)]
pub struct Mulberry32 {
    a: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { a: seed }
    }
    #[inline]
    pub fn next_f64(&mut self) -> f64 {
        self.a = self.a.wrapping_add(0x6d2b_79f5);
        let a = self.a;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
    /// 표준 정규 (Box–Muller). u, v 가 0 이면 다시 뽑는다
    pub fn gauss(&mut self) -> f64 {
        let mut u = 0.0;
        while u == 0.0 {
            u = self.next_f64();
        }
        let mut v = 0.0;
        while v == 0.0 {
            v = self.next_f64();
        }
        libm::sqrt(-2.0 * libm::log(u)) * libm::cos(2.0 * core::f64::consts::PI * v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_js_mulberry32() {
        let mut r = Mulberry32::new(12345);
        let want = [0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203];
        for w in want {
            assert_eq!(r.next_f64(), w);
        }
    }
}
