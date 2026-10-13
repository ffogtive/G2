// stackpower.mjs — 장수별 '딱 반 바퀴' 물리 세기 찾기: rules 를 거치지 않고 물리 power 를 직접 넣어 뒤집힌 비율을 잰다
// 사용: node tools/stackpower.mjs [시드=16] [장수들=1,2,3,5,8]  (PS='0.55,0.75,0.95' 로 세기 목록 지정)
import { initPhysics, Table } from '../mockup/src/sim.js';
await initPhysics();
const S = +(process.argv[2] || 16);
const Ns = (process.argv[3] || '1,2,3,5,8').split(',').map(Number);
const PS = (process.env.PS || '0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95').split(',').map(Number);
for (const n of Ns) for (const lat of [0, 0.6]) {
  const cells = [];
  for (const pw of PS) {
    let f = 0, out = 0;
    for (let s = 1; s <= S; s++) {
      const t = new Table(s * 7907 + n);
      t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle();
      const top = t.columnTop(), c = t.pileCenter();
      t.blow({ aim: { x: c.x - Math.sqrt(1 - lat * lat), y: top * 0.6, z: c.z + lat }, dir: { x: 1, z: 0 }, power: pw, blast: 0 });
      f += t.runUntilSettled(4).flipped.length;
      out += t.liveDiscs().filter((d) => !t.inCircle(d)).length;
    }
    cells.push(`${pw}:${(f / S / n * 100).toFixed(0)}%${out ? '/o' + (out / S).toFixed(1) : ''}`);
  }
  console.log(`n=${n} lat=${lat} | ${cells.join(' ')}`);
}
