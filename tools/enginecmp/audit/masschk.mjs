// audit/masschk.mjs — 두 엔진의 질량(두께 0.11·0.055·0.04)·마찰 결합·바람 가림 광선 거리가 같은지 (공정성 감사)
//   node audit/masschk.mjs
process.env.JOLT_FLAVOUR ??= 'cpd';
const { createWorld } = await import('../adapters/index.mjs');
for (const cfg of [{ engine: 'rapier' }, { engine: 'jolt', substeps: 4, joltPreset: 'fair' }]) {
  const w = await createWorld(cfg); w.addFloor();
  const out = [];
  for (const hh of [0.055, 0.0275, 0.02]) { const i = w.addDisc({ x: 3 * out.length, y: hh, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 1, hh); out.push(`hh ${hh}: m ${w.mass(i).toFixed(5)}`); }
  w.step();
  // 바람 가림 광선: 옆에서 테두리 높이로
  const r1 = w.castRay({ x: -3, y: 0.05, z: 0 }, { x: 1, y: 0, z: 0 }, 5, {});
  const r2 = w.castRay({ x: 0.999, y: 0.5, z: 0 }, { x: 0, y: -1, z: 0 }, 2, {});
  const r3 = w.castRay({ x: 0.995, y: 0.5, z: 0 }, { x: 0, y: -1, z: 0 }, 2, {});
  console.log(cfg.engine, out.join(' | '), 'side ray toi', r1 && r1.toi.toFixed(5), '| down ray at rim x0.999', r2 && r2.toi.toFixed(5), 'x0.995', r3 && r3.toi.toFixed(5), JSON.stringify(w.info().combineFloor ?? ''));
  w.destroy();
}
