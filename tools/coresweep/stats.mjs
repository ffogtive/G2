function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 평균비 ys/xs, 짝 부트스트랩 95% (무한대가 섞이면 보간 없이 분위)
export function pairedRatio(xs, ys, B = 2000) {
  const n = xs.length, R = rng(20261014), out = [], dif = [];
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  for (let b = 0; b < B; b++) { let sx = 0, sy = 0; for (let i = 0; i < n; i++) { const j = Math.floor(R() * n); sx += xs[j]; sy += ys[j]; } out.push(sx > 0 ? sy / sx : Infinity); dif.push((sy - sx) / n); }
  out.sort((a, b) => a - b); dif.sort((a, b) => a - b);
  return { r: mx > 0 ? my / mx : Infinity, lo: out[Math.floor(0.025 * B)], hi: out[Math.floor(0.975 * B)], mx, my, d: my - mx, dlo: dif[Math.floor(0.025 * B)], dhi: dif[Math.floor(0.975 * B)] };
}
