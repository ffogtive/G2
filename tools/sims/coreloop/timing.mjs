import { initPhysics, Table } from '../../../mockup/src/sim.js';
await initPhysics();
for (const N of [10, 20, 40, 100]) {
  const ts = [], steps = [];
  for (let s = 0; s < 12; s++) {
    const t = new Table(11 + s * 977); t.addPile(Array.from({ length: N }, (_, i) => i)); t.settle();
    t.blow({ aim: { x: -1, y: t.columnTop() * 0.97, z: 0 }, dir: { x: 1, z: 0 }, power: 0.9 });
    const t0 = performance.now(); const r = t.runUntilSettled(4); ts.push(performance.now() - t0); steps.push(r.steps);
  }
  ts.sort((a, b) => a - b);
  console.log(`N${N}: median ${ts[6].toFixed(0)}ms max ${ts[11].toFixed(0)}ms, steps median ${steps.sort((a,b)=>a-b)[6]} (= ${(steps[6]/120).toFixed(2)}s sim)`);
}
