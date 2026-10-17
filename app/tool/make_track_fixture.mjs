// B 시제품(네이티브 3D 데모)용 궤적 고정본: 웹 물리(sim.js + turn.js ShotRun/TrackRecorder)로 20장 샷 몇 개를 녹화해
// app/assets/native/track_fixture.json 으로 쓴다. 렌더러(Flutter flutter_scene)가 물리와 독립으로 도는지 증명하는 입력.
//   node app/tool/make_track_fixture.mjs        (저장소 뿌리에서)
// mockup/src/*.js 는 읽기만 한다(PvP 작업이 고치는 중). 같은 코덱(13B 자세 · 30Hz 프레임)이라 PvP 궤적을 그대로 재생하는 연습도 된다.
// test/fixtures/track_check.json: JS TrackPlayer 가 같은 시각에 내놓는 자세 표본 → Dart 포팅(lib/native/track.dart)의 일치 시험(test/native_track_test.dart)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initPhysics, Table, turnSeeds } from '../../mockup/src/sim.js';
import { ShotRun, TrackPlayer, toB64, fromB64 } from '../../mockup/src/turn.js';
import * as Rules from '../../mockup/src/rules.js';
import { CARDS } from '../../mockup/src/art.js';

const { sweetHiFor } = Rules;

await initPhysics();
const N = 20;
const ids = Array.from({ length: N }, (_, i) => i);
// 판 id → 그림 카드: 아래(0)부터 일반 위주, 레어·에픽 몇 장, 맨 위 근처 전설 1장 (화면에서 테두리 색이 섞여 보이게)
const pick = ['mandu', 'tteok', 'kimbap', 'hotteok', 'dubu', 'kkachi', 'bungeo', 'pajeon', 'horangi', 'kimchi',
  'gamja', 'gumiho', 'sikhye', 'yakgwa', 'tokki', 'japchae', 'yong', 'haetae', 'king', 'dokkaebi'];
const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const cards = pick.map((id) => ({ id, rarity: byId[id].rarity, body: byId[id].body, belly: byId[id].belly }));

const matchSeed = 0x0b5eed20;
const shots = [];
const checks = []; // 시험 전용(앱 번들에 안 넣음)
// 모든 샷이 같은 더미(같은 턴 시드 → 같은 pre)에서 출발: 데모는 누르기 전 더미를 하나만 보여 주고, 놓은 숨에 맞는 녹화를 고른다
const seeds = turnSeeds(matchSeed, 0, 0, 'a');
const mk = (name, ratio, hf, lat = 0) => {
  const top = Table.fromTurnState(ids, seeds.stack).columnTop();
  const power = sweetHiFor(N) * ratio;
  const input = { h: top * hf, lat, power, eff: power, mode: 'fun', beat: 0, item: 0, auto: 0 };
  const run = new ShotRun({ ids, seeds, input });
  run.advance();
  const rec = run.record;
  run.free();
  // JS 재생기 표본: 시작·보간 중간·끝 + 끝 바이트(post 와 같아야 함)
  const pl = new TrackPlayer(rec.pre);
  pl.push(rec.track.b);
  const F = rec.track.frames;
  const tfs = [0, 0.5, 1, 2.25, 3.7, F * 0.25, F * 0.5 + 0.33, F - 0.5, F];
  const check = tfs.map((tf) => {
    const m = pl.poseAt(tf);
    return { tf, poses: [...m.entries()].sort((a, b) => a[0] - b[0]).map(([id, { p, q }]) => [id, p.x, p.y, p.z, q.x, q.y, q.z, q.w]) };
  });
  const endB64 = toB64(pl.endBytes());
  if (endB64 !== rec.post) throw new Error(name + ': 재생 끝 ≠ post');
  if (shots.length && shots[0].pre !== rec.pre) throw new Error('샷마다 더미가 다르다');
  shots.push({
    name, ratio, top, seeds, input: rec.in, shot: rec.shot, pre: rec.pre, post: rec.post,
    track: rec.track, res: rec.res, simV: rec.simV,
  });
  checks.push({ name, check });
  console.log(`${name.padEnd(6)} top ${top.toFixed(3)} 프레임 ${F} 스텝 ${rec.track.steps} 궤적 ${fromB64(rec.track.b).length}B 뒤집힘 ${rec.res.flipped.length} 원밖 ${rec.res.outs.length}`);
};
mk('green', 0.95, 0.85); // 초록 숨, 위에서 2~3장째 가운데 (공략 정석)
mk('side', 0.92, 0.82, 0.55); // 초록 숨, 오른쪽 옆
mk('mid', 0.9, 0.6); // 초록 숨, 가운데 높이 = 대박 아니면 꽝
mk('blast', 1.28, 0.8); // 돌풍: 원 밖으로 날아감
mk('weak', 0.6, 0.82); // 약한 숨: 들썩

const out = { v: 1, about: 'sim.js+turn.js ShotRun 녹화(13B 자세, 30Hz). 좌표 = 웹(three.js·Rapier) 오른손. 렌더러가 왼손으로 바꿔 그린다', n: N, discR: 1.0, discH: 0.11, circleR: 3.2, cards, shots };
const file = fileURLToPath(new URL('../assets/native/track_fixture.json', import.meta.url));
writeFileSync(file, JSON.stringify(out));
console.log('→', file, JSON.stringify(out).length, 'B');
const cfile = fileURLToPath(new URL('../test/fixtures/track_check.json', import.meta.url));
// 숨 규칙 표본(lib/native/rules.dart 가 rules.js 와 같은 값인지)
const us = [0, 0.3, 0.78, 1.0, 1.11, 1.115, 1.12, 1.15, 1.2, 1.3, 1.5, 2, 3];
const rules = {
  sweetHi: Array.from({ length: 41 }, (_, n) => sweetHiFor(n)),
  pouch: us.map((u) => [u, Rules.pouchPower(u)]),
  latch: [1.0, 1.08, 1.09, 1.1, 1.114, 1.115, 1.12].flatMap((p) => [[p, false, Rules.fullLatch(p, false)], [p, true, Rules.fullLatch(p, true)]]),
  strain: [[0, 1.12, 16.7, true], [0.5, 1.25, 8.3, true], [0.9, 1.2, 33, true], [0.5, 1.0, 16.7, false], [0.01, 0.5, 33, false]].map((a) => [...a, Rules.strainStep(...a)]),
  consts: { POWER_MAX: Rules.POWER_MAX, POUCH_FULL: Rules.POUCH_FULL, POUCH_DETENT: Rules.POUCH_DETENT, POUCH_GAIN: Rules.POUCH_GAIN, STRAIN_MS: Rules.STRAIN_MS, LEAK_AT: Rules.LEAK_AT, GREEN_LO: Rules.GREEN_LO },
};
writeFileSync(cfile, JSON.stringify({ about: 'JS TrackPlayer.poseAt 표본 [id, px,py,pz, qx,qy,qz,qw] (오른손 좌표) + rules.js 표본', checks, rules }));
console.log('→', cfile, JSON.stringify({ checks }).length, 'B');
