// tools/papercheck.mjs — 종이 딱지 그림(mockup/src/paper.js) 게이트. 물리(sim.js)는 그대로 읽기만, 브라우저 없이 Node 에서 진짜 paper.js 로 잰다.
//
// 🧭 가설(확인됨, 2026-10-16 검토 반영): 얇게(0.055 u) 그린 딱지가 '두꺼운 플라스틱'도 '공중에 뜬 장난감 동전'도 아니려면
//   (1) 가만히 쌓인 더미의 테두리 어디에도 틈이 없고 (2) 쏜 뒤에도 받침 없이 떠 보이는 장이 거의 없고 (3) 책상 속에 묻힌 장이 없어야 한다.
//   1판(아랫장에 기대 휨)은 휨 축 한쪽만 재서 '94곳 중 91곳 덮음'이라 했지만 테두리 전체로 재면 최대 0.090 u 쐐기가 남았다 → 지표는 늘 테두리 전체.
//
// 쓰기: node tools/papercheck.mjs [pile|shot|all]   (약 1~2분, 무거운 프로세스 1개)
//   pile  가만히 쌓인 더미 2·5·10·16·22·30·40장 × 시드 5: 이웃 장 테두리 36방향 최대 틈 · 카메라 쪽(+z) 틈 · 책상 밑에 묻힌 장 · 얹힌 장 들림 ·
//         대응표(visY: 기둥 장의 물리 중심 → 그려진 중심) 오차 · 맨 위 '보이는 꼭대기 − 물리 꼭대기'
//   shot  쏜 뒤(초록 0.89, 눈높이 0.82·0.6) 6·10·16·22장 × 12시드 × 2: 보이는 판(메시 자세 = 배치·눕힘·피벗·휨 모프) 사이 원기둥 SDF 거리로
//         (a) 떠 있음 = 물리로 받쳐진 장(딱지 받침 접촉 또는 책상)인데 보이는 판이 받침 어느 것과도 0.02 u 안에 없음
//         (b) 빈 틈 받침 쌍 = 물리 받침 쌍인데 보이는 거리 > 0.02 이고, 사이가 다른 딱지로 안 채워짐(가운데 장의 두께만큼 생기는 '계단'은 뺌)
//         THICK=1 이면 예전처럼 물리 판(두께 0.11)을 그대로 그렸을 때의 같은 지표(기준선)
// 판정(맞음/틀림, exit 1): pile 최대 틈 ≤ 0.035 u · 묻힌 장 0 · 얹힌 장 들림 0 · 대응표 오차 < 1e-6 / shot (a) 장수마다 ≤ 2% · 책상 밑(−0.01 u 넘게) 0
//   (b)는 판정 밖 참고값(1판 3.5~10.8% · 두꺼운 그림 0%) — 두 무더기에 걸친 장·기대 누운 장 일부가 남는다(core-sweep §7 1번).
// paper.js·sim.js 를 바꾸면 필수.
import * as THREE from 'three';
import * as S from '../mockup/src/sim.js';
import * as Rules from '../mockup/src/rules.js';
import * as P from '../mockup/src/paper.js';

const { DISC_R, DISC_H } = S;
const THICK = process.env.THICK === '1';
const HH = THICK ? DISC_H / 2 : P.VIS_H / 2;
const ids = ['horangi', 'gumiho', 'king', 'dokkaebi', 'mandu', 'kimchi', 'tteok', 'tokki', 'kkachi'];
const mk = (id) => ({ id, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), userData: {}, morphTargetInfluences: [0, 0, 0], parent: {} });
const f3 = (v) => v.toFixed(3);
let bad = 0;
const verdict = (ok, msg) => { console.log(`${ok ? '  맞음' : '  틀림'} ${msg}`); if (!ok) bad++; };

// 게임처럼 몇 프레임 배치 + 따라가기(조준 중처럼 물리는 멈춘 채)
function lay(items) {
  if (THICK) { for (const it of items) { const p = it.body.translation(), q = it.body.rotation(); it.mesh.position.set(p.x, p.y, p.z); it.mesh.quaternion.set(q.x, q.y, q.z, q.w); } return null; }
  const look = new P.PaperLook();
  let now = 0;
  for (let k = 0; k < 30; k++) { look.apply(items); now += 16.7; look.tick(now, 1 / 60); }
  return look;
}
// 보이는 판 위의 점(지역 x, ±면, z) + 휨 모프
function surf(m, x, side, z) {
  const I = m.morphTargetInfluences, dy = -(I[0] * x * x + I[1] * z * z + I[2] * 2 * x * z);
  return new THREE.Vector3(x * DISC_R, side * HH + dy, z * DISC_R).applyQuaternion(m.quaternion).add(m.position);
}

function pileCheck() {
  console.log('## 가만히 쌓인 더미 (settle 600) — 이웃 장 테두리 36방향 최대 틈');
  let worst = 0, buriedAll = 0, curlAll = 0, mapAll = 0;
  for (const n of [2, 5, 10, 16, 22, 30, 40]) {
    const St = { pairs: 0, g005: 0, g02: 0, front02: 0, max: 0, buried: 0, curl: 0, map: 0, top: [], raw02: 0 };
    for (const seed of [1, 2, 3, 4, 7]) {
      const t = new S.Table(seed * 7907 + n);
      t.addPile(Array.from({ length: n }, (_, i) => ids[i % ids.length]));
      t.settle(600);
      const items = t.liveDiscs().map((d) => ({ id: d.id, body: d.body, mesh: mk(d.id) }));
      const look = lay(items);
      const c = t.pileCenter(), top = t.columnTop();
      if (look) St.top.push(look.visY(top, c) - top);
      const rows = items.map((it) => ({ m: it.mesh, y: it.body.translation().y, ny: new THREE.Vector3(0, 1, 0).applyQuaternion(it.mesh.quaternion).y, p: it.body.translation(), u: it.mesh.userData.paper })).sort((a, b) => a.y - b.y);
      for (const r of rows) {
        let hi = -9;
        for (let k = 0; k < 36; k++) for (const sd of [1, -1]) hi = Math.max(hi, surf(r.m, Math.cos((k / 36) * 6.2832), sd, Math.sin((k / 36) * 6.2832)).y);
        if (hi < 0.002) St.buried++;
        if (r.u && r.u.cov && Math.abs(r.u.tb) > 1e-6 && r.u.tb < 0) St.curl++;
        if (look && Math.abs(r.ny) > 0.9 && Math.hypot(r.p.x - c.x, r.p.z - c.z) < 0.6) St.map = Math.max(St.map, Math.abs(look.visY(r.y, c) - r.m.position.y));
      }
      // 같은 세계 방향의 테두리 점끼리: 윗장 아래 면 − 아랫장 위 면
      const rim = (m, side, a) => { let best = null, bd = -9; for (let k = 0; k < 72; k++) { const th = (k / 72) * 6.2832, p = surf(m, Math.cos(th), side, Math.sin(th)); const dd = (p.x - m.position.x) * Math.cos(a) + (p.z - m.position.z) * Math.sin(a); if (dd > bd) { bd = dd; best = p; } } return best; };
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i], s = rows[i - 1];
        if (Math.hypot(r.p.x - s.p.x, r.p.z - s.p.z) > 0.5 * DISC_R) continue;
        const sr = r.ny >= 0 ? -1 : 1, ss = s.ny >= 0 ? 1 : -1;
        let mx = -9, front = 0;
        for (let k = 0; k < 36; k++) { const a = (k / 36) * 6.2832, g = rim(r.m, sr, a).y - rim(s.m, ss, a).y; mx = Math.max(mx, g); if (k === 9) front = g; }
        St.pairs++; if (mx > 0.005) St.g005++; if (mx > 0.02) St.g02++; if (front > 0.02) St.front02++; St.max = Math.max(St.max, mx);
        if (r.y - s.y - 2 * HH > 0.02) St.raw02++;
      }
    }
    worst = Math.max(worst, St.max); buriedAll += St.buried; curlAll += St.curl; mapAll = Math.max(mapAll, St.map);
    console.log(`n=${String(n).padStart(2)} 쌍 ${St.pairs} | 최대 틈 ${f3(St.max)} · >0.005 ${St.g005} · >0.02 ${St.g02} · 카메라 쪽 >0.02 ${St.front02} (물리 자리 그대로면 ${St.raw02}) | 묻힌 장 ${St.buried} | 얹힌 장 들림 ${St.curl}${St.top.length ? ` | 보이는−물리 꼭대기 ${f3(Math.min(...St.top))}~${f3(Math.max(...St.top))}` : ''}`);
  }
  if (THICK) return;
  verdict(worst <= 0.035, `테두리 최대 틈 ${f3(worst)} u ≤ 0.035 (1판 0.090 · 휨 없이 얇게만 0.051)`);
  verdict(buriedAll === 0, `책상 속에 묻힌 장 ${buriedAll} = 0 (예전 두꺼운 그림 40장 1~2 · 1판 3~4)`);
  verdict(curlAll === 0, `위에 장이 얹힌 장의 '쓰던 딱지' 들림 ${curlAll} = 0`);
  verdict(mapAll < 1e-6, `대응표 visY(기둥 장의 물리 중심) = 그려진 중심 (오차 ${mapAll.toExponential(1)})`);
}

// 원기둥 SDF(보이는 판) · 표본: 두 면 고리(r 0·.35·.7·1 × 24) + 옆 가운데 고리
const SAMP = [];
for (const y of [1, -1]) { SAMP.push([0, y, 0]); for (const r of [0.35, 0.7, 1]) for (let k = 0; k < 24; k++) SAMP.push([r * Math.cos((k / 24) * 6.2832), y, r * Math.sin((k / 24) * 6.2832)]); }
for (let k = 0; k < 24; k++) SAMP.push([Math.cos((k / 24) * 6.2832), 0, Math.sin((k / 24) * 6.2832)]);
const _v = new THREE.Vector3(), _qi = new THREE.Quaternion();
function sdf(m, p) {
  _qi.copy(m.quaternion).invert();
  _v.copy(p).sub(m.position).applyQuaternion(_qi);
  const qx = Math.hypot(_v.x, _v.z) - DISC_R, qy = Math.abs(_v.y) - HH;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
}
const pts = (m) => SAMP.map(([x, y, z]) => surf(m, x, y, z));
function dist(a, b, A, B) {
  let best = Infinity, bp = null;
  for (const p of A) { const d = sdf(b, p); if (d < best) { best = d; bp = p; } }
  for (const p of B) { const d = sdf(a, p); if (d < best) { best = d; bp = p; } }
  return { d: best, p: bp };
}

function shotCheck() {
  console.log(`## 쏜 뒤 (초록 0.89 · 눈높이 0.82·0.6 · 720스텝) — 보이는 판 SDF${THICK ? ' [THICK: 물리 판 그대로]' : ''}`);
  let worstA = 0, belowAll = 0;
  for (const n of [6, 10, 16, 22]) {
    let tot = 0, flo = 0, open = 0, below = 0, games = 0, gFlo = 0;
    const fl = [], op = [];
    for (let seed = 1; seed <= 12; seed++) for (const hf of [0.82, 0.6]) {
      const t = new S.Table(seed * 7907 + n);
      t.addPile(Array.from({ length: n }, () => 'mandu'));
      t.settle(600);
      const top = t.columnTop(), rng = S.mulberry32(seed);
      const shot = Rules.resolveShot({ h: hf * top, lat: 0, power: Rules.sweetHiFor(n) * 0.89 }, n, top, rng);
      t.rng = rng;
      const c = t.pileCenter();
      t.blow({ aim: { x: c.x, y: shot.h, z: c.z + DISC_R }, dir: { x: 0, z: -1 }, power: shot.power, blast: shot.blast || 0 });
      for (let k = 0; k < 720; k++) t.step();
      const live = t.liveDiscs();
      const items = live.map((d) => ({ id: d.id, body: d.body, mesh: mk(d.id) }));
      lay(items);
      const mOf = new Map(items.map((it) => [it.id, it.mesh])), ptOf = new Map(items.map((it) => [it.id, pts(it.mesh)]));
      const byCol = new Map(live.map((d) => [d.collider.handle, d]));
      games++;
      let any = false;
      for (const d of live) {
        const md = mOf.get(d.id), A = ptOf.get(d.id);
        let lo = Infinity; for (const p of A) lo = Math.min(lo, p.y);
        if (lo < -0.01) below++;
        const sups = []; let onTable = false;
        t.world.contactPairsWith(d.collider, (oc) => {
          const other = byCol.get(oc.handle);
          t.world.narrowPhase.contactPair(d.collider.handle, oc.handle, (m, flipped) => {
            if (!m.numContacts()) return;
            const nw = m.normal();
            if ((flipped ? 1 : -1) * nw.y < 0.3) return; // 받침 쪽(상대 → d 가 위로)
            if (other) sups.push(other); else onTable = true;
          });
        });
        if (!sups.length && !onTable) continue;
        tot++;
        let near = onTable ? Math.max(0, lo) : Infinity, worstOpen = 0;
        for (const o of sups) {
          const mo = mOf.get(o.id), r = dist(md, mo, A, ptOf.get(o.id));
          near = Math.min(near, r.d);
          if (r.d <= 0.02) continue;
          let filled = false;
          for (const it of items) { if (it.id === d.id || it.id === o.id) continue; if (sdf(it.mesh, r.p) < 0.01) { filled = true; break; } }
          if (!filled) for (const it of items) { // 계단: 사이 높이의 장이 둘 다와 닿음
            if (it.id === d.id || it.id === o.id) continue;
            const ym = it.mesh.position.y;
            if (ym > md.position.y + 0.01 || ym < mo.position.y - 0.01) continue;
            const X = ptOf.get(it.id);
            if (dist(md, it.mesh, A, X).d < 0.02 && dist(it.mesh, mo, X, ptOf.get(o.id)).d < 0.02) { filled = true; break; }
          }
          if (!filled) worstOpen = Math.max(worstOpen, r.d);
        }
        if (near > 0.02) { flo++; fl.push(near); any = true; }
        if (worstOpen) { open++; op.push(worstOpen); }
      }
      if (any) gFlo++;
    }
    const pa = (100 * flo) / tot;
    worstA = Math.max(worstA, pa); belowAll += below;
    console.log(`n=${String(n).padStart(2)} 받쳐진 장 ${tot} | (a) 떠 있음 ${flo} (${pa.toFixed(1)}%, 판 ${gFlo}/${games}) 큰 순 ${fl.sort((a, b) => b - a).slice(0, 4).map(f3).join(' ')} | (b) 빈 틈 받침 쌍 ${open} (${((100 * open) / tot).toFixed(1)}%) 큰 순 ${op.sort((a, b) => b - a).slice(0, 4).map(f3).join(' ')} | 책상 밑 ${below}`);
  }
  if (THICK) return;
  verdict(worstA <= 2, `(a) 떠 있는 장 장수마다 ≤ 2% (최대 ${worstA.toFixed(1)}%)`);
  verdict(belowAll === 0, `책상 밑으로 0.01 u 넘게 들어간 장 ${belowAll} = 0`);
}

await S.initPhysics();
const what = process.argv[2] || 'all';
if (!['pile', 'shot', 'all'].includes(what)) { console.error('쓰기: node tools/papercheck.mjs [pile|shot|all]'); process.exit(2); }
const t0 = Date.now();
if (what !== 'shot') pileCheck();
if (what !== 'pile') shotCheck();
console.log(THICK ? `기준선(THICK) ${((Date.now() - t0) / 1000).toFixed(0)}초` : bad ? `틀림 ${bad}개 (${((Date.now() - t0) / 1000).toFixed(0)}초)` : `맞음 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
process.exit(bad ? 1 : 0);
