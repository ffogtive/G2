// pvp-check.mjs — PvP P0.5a 게이트: 같은 브라우저 문맥의 두 페이지(= 두 탭)가 LocalNet 으로 3판 1세트를 끝까지 둔다.
// docs/design/items-pvp.md §2.1 '시험 방법 2'
//
// 🧭 가설: 쏜 사람이 심판(ShotRun)이고 두 화면 모두 궤적을 꼭두각시 월드에 재생하면, 턴마다 두 탭의 지문
//   (남은 판 id · 점수 · 화면 끝 자세 해시)과 판정(res)이 100% 같고 화면 끝 = 쏜 사람의 post 다. 받는 쪽의 뒤 검증(같은 입력·새 월드) 해시도 100% 같다.
//
// 사용: PW=$(npm root -g)/playwright node tools/pvp-check.mjs [판 크기 5|10|20 = 5]
//   NOBUILD=1   빌드 생략(dist/puff.html 그대로)
//   RELOAD=b    두 턴쯤 뒤에 B 를 새로고침 → 재접속(문서로 다시 계산 · 못 본 상대 숨은 db 궤적으로). RELOAD=a / ab 도 됨
//   RELOADAT=recv  상대 숨을 재생하는 중에 새로고침(기본 any) / mine = 내 차례에
//   DROP=K      B 가 받은 trk 조각을 K번째마다 버림 → 빈칸이면 db 샷 문서로 이어 받기
//   LAG=ms      LocalNet room·db 알림 지연(두 탭 모두)
//   CLOCK=s     샷 시계(기본 30). 짧게 주면 자동 헛숨 경로도 지난다(봇은 0.8~2.5초 안에 쏜다)
//   LIMIT=ms    전체 제한 시간(기본 15분)
//   NET=artifact  아티팩트 빌드(dist/puff-artifact.html, CDN → node_modules) + 가짜 claude 호스트(tools/fake-claude.js: LocalNet 위에 db·room·user 모양)
//                 → ArtifactNet 경로(claude.use · 6자 코드 · 로비 room 빠른 길 · 검증 기록)를 같은 게이트로. 상한 위반은 페이지 계량 + 가짜 호스트 계량 둘 다
//   SNAPPOLL=ms   (NET=artifact) db onSnapshot 이 실시간을 잃고 폴링으로 떨어진 상태(실제 약 30000). room 빠른 길·3초 안전망 읽기로 버티는가
//   RESIGN=a|b  그 탭이 RESIGNAT(기본 2) 턴쯤 뒤 HOME 을 두 번 눌러 기권 → 상대 화면이 2초 안에 '기권승'이고 '연결 끊김 — 기다리는 중'은 한 번도 안 뜬다.
//               기권한 쪽은 홈 · 매치 문서 abandoned(result.by) · 자리 문서 resign. 기권 전 턴은 평소대로 비교(기권 때 날던 마지막 턴 하나는 빼고).
//               매치 문서 구독이 폴링이면(NET=artifact SNAPPOLL=30000) presence 빠른 길만 남는다 — 옛 순서(문서 먼저 → presence → 곧바로 leave)는 여기서 걸렸다
// 통과(종료 코드 0): 모든 턴이 두 탭 로그에 있고 지문·res 100% 같음 · 화면 끝 해시 = 쏜 사람 qhash 100% · 뒤 검증 same 100%
//   · 판·세트 결과 같음 · LocalNet 상한 위반 0(emit·presence 4KiB, 문서 256KiB, 선언 주제, 초당 40·버스트 80) · 콘솔 오류 0
import { createRequire } from 'module';
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapArtifact, routeCdn, fakeClaude } from './artifact-host.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = +(process.argv[2] || 5);
const RELOADAT = process.env.RELOADAT || 'any'; // recv = 상대 숨 재생 중 / mine = 내 차례
const RELOAD = (process.env.RELOAD || '').toLowerCase(), DROP = +(process.env.DROP || 0), LAG = +(process.env.LAG || 0), CLOCK = +(process.env.CLOCK || 0);
const LIMIT = +(process.env.LIMIT || 15 * 60 * 1000);
const ART = (process.env.NET || '').toLowerCase() === 'artifact';
const RESIGN = { 1: 'a', a: 'a', b: 'b' }[(process.env.RESIGN || '').toLowerCase()] || '', RESIGNAT = +(process.env.RESIGNAT || 2);

if (!process.env.NOBUILD) execFileSync('node', [join(root, 'tools/build.mjs')], { stdio: 'inherit' });
const file = ART ? wrapArtifact() : join(root, 'dist/puff.html');
if (!existsSync(file)) throw new Error('dist/puff.html 없음 — npm run build');
const q = (extra = '') => `file://${file}?${ART ? '' : 'pvplocal&'}pvpbot${LAG && !ART ? `&pvplag=${LAG}` : ''}${CLOCK ? `&pvpclock=${CLOCK}` : ''}${extra}`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext();
const cdnLogs = [];
if (ART) { await routeCdn(ctx, cdnLogs); await ctx.addInitScript({ content: await fakeClaude({ mode: 'full', lag: LAG, snapPoll: +(process.env.SNAPPOLL || 0) }) }); }
// 화면 크기를 다르게(세로 폰 · 가로) — 물리·판정은 카메라와 무관해야 한다
const A = await ctx.newPage(), B = await ctx.newPage();
// 헤드리스 소프트웨어 렌더(swiftshader)는 두 탭이면 fps 가 낮다 → 작게. 가로·세로는 다르게 둔다
await A.setViewportSize({ width: +(process.env.AW || 360), height: +(process.env.AH || 720) });
await B.setViewportSize({ width: +(process.env.BW || 640), height: +(process.env.BH || 400) });
const errs = { a: [], b: [] };
for (const [p, k] of [[A, 'a'], [B, 'b']]) {
  p.on('pageerror', (e) => errs[k].push('[pageerror] ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs[k].push('[console] ' + m.text()); });
}
const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
await A.goto(q());
await B.goto(q(DROP ? `&pvpdrop=${DROP}` : ''));
const homeOk = async (p) => p.waitForFunction(() => window.__puffBooted && !document.querySelector('#home').hidden && !document.querySelector('#pvpBtn').hidden, null, { timeout: 90000 }); // 다른 작업과 CPU 를 나눠 쓰면 부팅이 느리다. PvP 버튼은 Net 이 정해진 뒤(부팅 뒤)에 켜진다
await homeOk(A); await homeOk(B);
console.log(`[${sec()}] Net: A ${await A.evaluate(() => window.__pvpNet)} B ${await B.evaluate(() => window.__pvpNet)}${ART ? ' (아티팩트 빌드 + 가짜 claude 호스트)' : ''}`);
console.log(`[${sec()}] 두 탭 부팅. PvP 버튼 보임: A ${await A.$eval('#pvpBtn', (e) => !e.hidden)} B ${await B.$eval('#pvpBtn', (e) => !e.hidden)}`);
// 로비 버튼은 DOM click(작은 가로 화면에선 홈 아래 줄이 화면 밖 — 배치 시험이 아니라 흐름 시험)
const tap = (p, sel) => p.$eval(sel, (e) => e.click());
// A: 방 만들기
await tap(A, '#pvpBtn');
await tap(A, `#pvpChips button[data-n="${N}"]`);
await tap(A, '#pvpCreate');
await A.waitForFunction(() => /^[A-Z0-9]{4,6}$/.test(document.querySelector('#pvpCode')?.textContent || ''), null, { timeout: 15000 });
const code = await A.$eval('#pvpCode', (e) => e.textContent);
console.log(`[${sec()}] A 방 만들기 → 코드 ${code} (판 크기 각자 ${N})`);
// B: 코드로 참가
await tap(B, '#pvpBtn');
await B.fill('#pvpCodeIn', code.toLowerCase());
await tap(B, '#pvpJoin');

const reloaded = new Set();
const fps = { a: [], b: [] };
const rafRate = (p) => p.evaluate(() => new Promise((r) => { let n = 0; const t1 = performance.now(); const f = () => { n++; if (performance.now() - t1 < 1000) requestAnimationFrame(f); else r({ n, hidden: document.hidden }); }; requestAnimationFrame(f); })).catch(() => null);
let fpsAt = 0;
let last = '';
let doneA = null, doneB = null;
const RP = RESIGN === 'b' ? B : A, OP = RESIGN === 'b' ? A : B; // 기권하는 탭 · 상대 탭
let resignAt = 0, resignSeat = null;
while (Date.now() - t0 < LIMIT) {
  await A.waitForTimeout(1500);
  const sa = await A.evaluate(() => window.__pvp?.() ?? null).catch(() => null);
  const sb = await B.evaluate(() => window.__pvp?.() ?? null).catch(() => null);
  doneA = await A.evaluate(() => window.__pvpDone ?? null).catch(() => null);
  doneB = await B.evaluate(() => window.__pvpDone ?? null).catch(() => null);
  const line = `A ${sa ? `g${sa.g} t${sa.t} ${sa.score.a}-${sa.score.b} live${sa.live}${sa.mine ? ' 내차례' : ''}${sa.playing ? ' 재생' : ''}` : '-'} | B ${sb ? `g${sb.g} t${sb.t} ${sb.score.a}-${sb.score.b} live${sb.live}${sb.mine ? ' 내차례' : ''}${sb.playing ? ' 재생' : ''}` : '-'}`;
  if (line !== last) { console.log(`[${sec()}] ${line}`); last = line; }
  if (doneA && doneB) break;
  // 기권 시험: 상대 화면을 25ms 마다 기록('연결 끊김' 표시 · 기권승 시각) → HOME 두 번
  if (RESIGN) {
    const s = RESIGN === 'b' ? sb : sa;
    if (!resignAt && s && !s.ended && s.state === 'match' && s.first && s.g * 100 + s.t >= RESIGNAT) {
      await OP.evaluate(() => {
        const r = (window.__rsg = { awayAt: null, awayN: 0, doneAt: null });
        const id = setInterval(() => {
          const el = document.querySelector('#pvpConn');
          if (el && !el.hidden && el.dataset.k === 'pvpOppAway') { r.awayN++; r.awayAt ??= Date.now(); }
          if (window.__pvpDone) { r.doneAt = Date.now(); clearInterval(id); }
        }, 25);
      });
      resignSeat = s.seat;
      console.log(`[${sec()}] ${RESIGN.toUpperCase()} 기권(HOME 두 번) — ${s.mine ? '자기 차례' : '상대 차례'}, ${s.playing ? '재생 중' : '재생 아님'}`);
      await tap(RP, '#quitBtn');
      await RP.waitForTimeout(200);
      resignAt = Date.now();
      await tap(RP, '#quitBtn');
    }
    if (resignAt && ((RESIGN === 'b' ? doneA : doneB) || Date.now() - resignAt > 20000)) break;
  }
  if (Date.now() - fpsAt > 20000) { fpsAt = Date.now(); const [fa, fb] = await Promise.all([rafRate(A), rafRate(B)]); if (fa) fps.a.push(fa.n); if (fb) fps.b.push(fb.n); if (fa?.hidden || fb?.hidden) console.log('숨은 탭!', fa, fb); }
  // 재접속 시험: 첫 판 3번째 턴쯤 한 번
  for (const [p, k, s] of [[B, 'b', sb], [A, 'a', sa]]) {
    if (RELOAD.includes(k) && !reloaded.has(k) && s && !s.ended && (s.g > 0 || s.t >= 2) && (RELOADAT === 'any' || (RELOADAT === 'recv' ? !s.mine && s.playing : s.mine))) {
      reloaded.add(k);
      console.log(`[${sec()}] ${k.toUpperCase()} 새로고침(재접속 시험) — ${s.mine ? '자기 차례' : '상대 차례'}, ${s.playing ? '재생 중' : '재생 아님'}`);
      await p.reload();
      await p.waitForFunction(() => window.__puffBooted, null, { timeout: 30000 }).catch(() => {}); // 부팅만 기다림(곧바로 대결 화면으로 간다)
    }
  }
}
await A.waitForTimeout(2500); // 뒤 검증(3ms/프레임)이 끝나도록
const logA = (await A.evaluate(() => window.__pvpLog)).filter((e) => e.code === code);
const logB = (await B.evaluate(() => window.__pvpLog)).filter((e) => e.code === code);
const meterA = await A.evaluate(() => window.__pvpMeter());
const meterB = await B.evaluate(() => window.__pvpMeter());
const hostA = ART ? await A.evaluate(() => window.__fakeMeter?.() ?? null) : null; // 가짜 호스트가 강제한 상한(실제 플랫폼 몫)
const hostB = ART ? await B.evaluate(() => window.__fakeMeter?.() ?? null) : null;
const verifyDocs = await A.evaluate((c) => Object.keys(localStorage).filter((k) => k.startsWith('pn1:p/') && k.includes('/m/' + c + '-') && k.includes('/v/')).map((k) => JSON.parse(localStorage.getItem(k))), code);
doneA = await A.evaluate(() => window.__pvpDone ?? null);
doneB = await B.evaluate(() => window.__pvpDone ?? null);
let resign = null;
if (RESIGN) {
  const docs = await A.evaluate(([c, seat]) => {
    const g = (k) => JSON.parse(localStorage.getItem(k) || 'null');
    const sk = Object.keys(localStorage).find((k) => k.startsWith('pn1:p/') && k.endsWith(`/m/${c}-${seat}`));
    return { matchDoc: g('pn1:matches/' + c), seatDoc: sk ? g(sk) : null };
  }, [code, resignSeat]);
  resign = { at: resignAt, seat: resignSeat, rec: await OP.evaluate(() => window.__rsg ?? null), home: await RP.evaluate(() => !document.querySelector('#home').hidden), ...docs };
}
writeFileSync(join(root, 'tools/scratch/pvp-last.json'), JSON.stringify({ code, logA, logB, meterA, meterB, hostA, hostB, verifyDocs, doneA, doneB, resign }, null, 1));
await A.screenshot({ path: join(root, 'tools/scratch/pvp-a.png') });
await B.screenshot({ path: join(root, 'tools/scratch/pvp-b.png') });
await browser.close();

// ── 비교 ──
const isTurn = (k) => /^\d{3}$/.test(k);
const keys = [...new Set([...logA, ...logB].map((e) => e.key))].sort();
let turns = 0, both = 0, tagSame = 0, resSame = 0, shownOk = 0, shownN = 0, verSame = 0, verN = 0, beatOk = 0, beatN = 0, rebuilt = 0;
const bad = [], lats = [], dels = [], srcs = {};
const lastTurn = keys.filter(isTurn).at(-1);
let inflight = null; // 기권 시험: 기권 때 날던 턴(한쪽만 끝냈을 수 있다)
for (const k of keys) {
  const ea = logA.filter((e) => e.key === k), eb = logB.filter((e) => e.key === k);
  if (RESIGN && k === 'set') continue; // 기권은 상대 쪽만 'resign:자리' 를 남긴다 — 아래에서 따로 본다
  if (RESIGN && isTurn(k) && k === lastTurn && (!ea.length || !eb.length)) { inflight = k; continue; }
  if (!isTurn(k)) { if (!ea.length || !eb.length || ea.some((x) => eb.some((y) => y.tag !== x.tag))) bad.push(`${k}: A ${ea.map((e) => e.tag)} B ${eb.map((e) => e.tag)}`); continue; }
  turns++;
  if (!ea.length || !eb.length) { bad.push(`${k}: ${!ea.length ? 'A' : 'B'} 로그 없음`); continue; }
  both++;
  const all = [...ea, ...eb];
  if (all.every((e) => e.tag === all[0].tag)) tagSame++; else bad.push(`${k}: 지문 다름 ${all.map((e) => `${e.role}:${e.tag}`).join(' / ')}`);
  if (all.every((e) => e.res === all[0].res)) resSame++; else bad.push(`${k}: res 다름`);
  for (const e of all) {
    if (e.role === 'rebuild') { rebuilt++; continue; }
    shownN++; if (e.qhash === e.expect) shownOk++; else bad.push(`${k}: ${e.role} 화면 끝 ${e.qhash} ≠ post ${e.expect}`);
    if (e.role === 'recv') {
      verN++; if (e.ver === 'same') verSame++; else bad.push(`${k}: 뒤 검증 ${e.ver}`);
      if (e.beatOk != null) { beatN++; if (e.beatOk) beatOk++; }
      if (e.plus != null) { lats.push(e.plus); const sh = all.find((x) => x.role === 'shoot' && x.plus != null); if (sh) dels.push(e.plus - sh.plus); }
      srcs[e.src] = (srcs[e.src] || 0) + 1;
      if (e.preMiss) bad.push(`${k}: pre 다름(같은 엔진인데)`);
    }
  }
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : '—') + `% (${a}/${b})`;
const qt = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const viol = [...(meterA?.violations || []), ...(meterB?.violations || []), ...(hostA?.violations || []), ...(hostB?.violations || [])];
console.log('\n── 결과 ──');
console.log(`세트: A ${JSON.stringify(doneA)}\n      B ${JSON.stringify(doneB)}`);
console.log(`턴 ${turns} · 두 탭 다 기록 ${pct(both, turns)} · 지문 같음 ${pct(tagSame, both)} · res 같음 ${pct(resSame, both)}`);
const autoN = new Set([...logA, ...logB].filter((e) => isTurn(e.key) && e.auto).map((e) => e.key)).size;
console.log(`샷 시계 자동 헛숨 턴 ${autoN}`);
console.log(`화면 끝 = 쏜 사람 post ${pct(shownOk, shownN)} · 뒤 검증 같음 ${pct(verSame, verN)} · 콩닥 다시 계산 ${pct(beatOk, beatN)} · 재접속으로 다시 계산한 턴 ${rebuilt}`);
console.log(`받는 쪽 출처 ${JSON.stringify(srcs)} · 놓기 → 상대 화면 첫 '+1' ms p50 ${qt(lats, 0.5)} p90 ${qt(lats, 0.9)} (n ${lats.length}) · 쏜 쪽 자기 화면 대비 늦음 p50 ${qt(dels, 0.5)} p90 ${qt(dels, 0.9)}`);
const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '—');
console.log(`화면 fps(1초 rAF 표본) A 평균 ${avg(fps.a)} 최저 ${fps.a.length ? Math.min(...fps.a) : '—'} · B 평균 ${avg(fps.b)} 최저 ${fps.b.length ? Math.min(...fps.b) : '—'} — 재생은 프레임 dt 상한 50ms 라 20fps 밑이면 느려진다(솔로와 같음)`);
for (const [k, m] of [['A', meterA], ['B', meterB]]) console.log(`${k} 계량: emit ${m.count.emit}(최대 ${m.max.emit}B) presence ${m.count.presence}(최대 ${m.max.presence}B) 문서 쓰기 ${m.count.docWrite}(최대 ${m.max.doc}B) 주제별 ${JSON.stringify(Object.fromEntries(Object.entries(m.byTopic).map(([t, o]) => [t, `${o.n}개 최대${o.max}B`])))}`);
if (ART) for (const [k, m] of [['A', hostA], ['B', hostB]]) console.log(`${k} 가짜 호스트 계량: emit ${m?.count.emit}(최대 ${m?.max.emit}B) presence ${m?.count.presence}(최대 ${m?.max.presence}B) 문서 쓰기 ${m?.count.docWrite}(최대 ${m?.max.doc}B) 버린 emit ${m?.count.dropped}`);
for (const [k, m] of [['A', meterA], ['B', meterB]]) if (m?.errors) console.log(`${k} 플랫폼 오류 ${JSON.stringify(m.errors.n)}`);
const vSame = verifyDocs.filter((d) => d.same).length, vEng = verifyDocs.filter((d) => d.sameEngine).length;
const bp = verifyDocs.map((d) => d.blowToPlus).filter((x) => x != null), rt = verifyDocs.map((d) => d.rtt).filter((x) => x != null);
console.log(`검증 기록(p/…/v/, E10) ${verifyDocs.length}개 · 같음 ${pct(vSame, verifyDocs.length)} · 같은 엔진 ${pct(vEng, verifyDocs.length)} · blow→첫 '+1' p50 ${qt(bp, 0.5)} p90 ${qt(bp, 0.9)} ms · 메아리 RTT 중앙 ${qt(rt, 0.5)} ms`);
if (cdnLogs.length) console.log('CDN 404: ' + cdnLogs.join(' '));
console.log(`상한 위반 ${viol.length}${viol.length ? ' ' + JSON.stringify(viol.slice(0, 5)) : ''}`);
console.log(`콘솔 오류 A ${errs.a.length} B ${errs.b.length}${errs.a.length + errs.b.length ? '\n' + [...errs.a, ...errs.b].slice(0, 10).join('\n') : ''}`);
const sameSet = doneA && doneB && JSON.stringify(doneA.games) === JSON.stringify(doneB.games) && doneA.winner === doneB.winner;
// 받는 쪽 턴마다 검증 기록(자리·턴 키로 하나), 모두 같음
const recvKeys = new Set([...logA, ...logB].filter((e) => e.role === 'recv').map((e) => `${e.seat === 'a' ? 'b' : 'a'}|${e.key}`));
const docKeys = new Set(verifyDocs.map((d) => `${d.seat}|${d.key}`));
const verDocsOk = [...recvKeys].every((k) => docKeys.has(k)) && vSame === verifyDocs.length;
if (!verDocsOk) bad.push(`검증 기록: 받은 턴 ${recvKeys.size} · 기록 ${docKeys.size} · 같음 ${vSame}`);
// 기권: 상대 화면 = 2초 안에 기권승, '연결 끊김' 한 번도 없음 · 기권한 쪽 = 홈 · 매치 문서 abandoned(result.by) · 자리 문서 resign
let resignOk = true;
if (RESIGN) {
  const dO = RESIGN === 'b' ? doneA : doneB, logO = RESIGN === 'b' ? logA : logB, r = resign;
  const ms = r?.rec?.doneAt && r.at ? r.rec.doneAt - r.at : null;
  const setTag = logO.find((e) => e.key === 'set')?.tag;
  console.log(`기권(${RESIGN.toUpperCase()} = ${r?.seat}): 상대 화면 ${dO ? `${dO.reason} 승자 ${dO.winner}` : '결과 없음'} · 두 번째 HOME → 기권승 ${ms ?? '—'}ms · '연결 끊김' 표시 ${r?.rec?.awayN ? `${r.rec.awayN}회(+${r.rec.awayAt - r.at}ms)` : '0'}` +
    ` · 기권한 쪽 홈 ${r?.home} · 매치 문서 ${r?.matchDoc?.status}/${r?.matchDoc?.result?.reason}/by ${r?.matchDoc?.result?.by} · 자리 문서 resign ${r?.seatDoc?.resign}${inflight ? ` · 날던 턴 ${inflight} 뺌` : ''}`);
  resignOk = !!(r?.at && dO && dO.reason === 'resign' && dO.winner === dO.seat && dO.seat !== r.seat && ms != null && ms < 2000 && !r.rec.awayN && r.home &&
    r.matchDoc?.status === 'abandoned' && r.matchDoc?.result?.reason === 'resign' && r.matchDoc.result.by === r.seat && r.seatDoc?.resign === true && setTag === `resign:${dO.seat}`);
  if (!resignOk) bad.push('기권 흐름 실패');
}
if (bad.length) console.log('불일치:\n  ' + bad.slice(0, 20).join('\n  '));
const pass = (RESIGN ? resignOk : doneA && doneB && sameSet) && turns > 0 && both === turns && tagSame === both && resSame === both && shownOk === shownN && verSame === verN && verDocsOk && !viol.length && !errs.a.length && !errs.b.length && !bad.length && !cdnLogs.length;
console.log(`\n${pass ? 'PASS' : 'FAIL'} — ${sec()}`);
process.exit(pass ? 0 : 1);
