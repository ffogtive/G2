// diag.mjs — 쏜 뒤 기어가는 딱지 진단: 1 s 마다 가장 빠른 딱지 3장의 속도·ω 축(법선과 내적)·높이·기울기·잠
//   node diag.mjs J-b0.4-4x-v20 30 0.11 1   (설정 이름은 아래 cfgs)
process.env.JOLT_FLAVOUR ??= 'cpd';
const { createWorld } = await import('./adapters/index.mjs');
const { GameTable, standardShot } = await import('./adapters/wind.mjs');
const { rotate } = await import('./adapters/common.mjs');
const [name, n, h, seed] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const cfgs = {
  'J-b0.4-4x-v20': { engine: 'jolt', substeps: 4, joltPreset: 'fair', jolt: { baumgarte: 0.4, velocitySteps: 20, positionSteps: 4 } },
  'J-b0.4-4x': { engine: 'jolt', substeps: 4, joltPreset: 'fair', jolt: { baumgarte: 0.4, velocitySteps: 10, positionSteps: 4 } },
  'R-e0.8-2x': { engine: 'rapier', erp: 0.8, substeps: 2 },
  'R21-2x-f480-i8': { engine: 'rapier', substeps: 2, iterations: 8, rapier: { naturalFrequency: 480 } },
};
const w = await createWorld(cfgs[name]);
const t = new GameTable(w, { n, seed, h });
t.settle();
t.blow(standardShot(t));
for (let k = 1; k <= 720; k++) {
  t.step();
  if (k % 120 === 0) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      if (t.off.has(i)) continue;
      const { p, q } = w.getPose(i); const { v, w: av } = w.getVel(i);
      const sp = Math.max(Math.hypot(v.x, v.y, v.z), Math.hypot(av.x, av.y, av.z) * 0.5);
      const up = rotate(q, { x: 0, y: 1, z: 0 });
      rows.push({ i, sp: +sp.toFixed(3), v: +Math.hypot(v.x, v.y, v.z).toFixed(3), w: +Math.hypot(av.x, av.y, av.z).toFixed(3), wAxisDotN: +((av.x*up.x+av.y*up.y+av.z*up.z)/(Math.hypot(av.x,av.y,av.z)||1)).toFixed(2), y: +p.y.toFixed(3), r: +Math.hypot(p.x, p.z).toFixed(2), tiltDeg: +(Math.acos(Math.min(1, Math.abs(up.y))) * 57.3).toFixed(1), sleep: w.isSleeping(i) });
    }
    rows.sort((a, b) => b.sp - a.sp);
    console.log(`t=${k / 120}s moving(>0.08)=${rows.filter((r) => r.sp > 0.08).length}`, JSON.stringify(rows.slice(0, 3)));
  }
}
