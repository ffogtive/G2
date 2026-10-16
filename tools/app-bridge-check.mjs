// app-bridge-check.mjs — 앱(Flutter 웹뷰) 다리 게이트: 진짜 아이폰 없이 Chromium 으로 WKWebView 쪽을 흉내 낸다.
// 흉내: navigator.vibrate 없음 · webkit.messageHandlers.PuffHaptic(+ window.PuffHaptic 래퍼) · Dart 응답(ACK = app/lib/haptics.dart 와 같은 모양)
//       · navigator.audioSession(type 바뀐 기록) · 가짜 마이크(getUserMedia 부를 때의 type 기록)
// 확인:
//  [app]       부팅 오류 0 · ③-1 게임 길 = 'OK · core'(다리 'g:auto' → Dart 새 기본 길 Core Haptics 흉내) · ③-2 engine · ③-3 core · 보냄/응답 4/4(시험 전 게임 진동 없음)
//              · ④ 게임처럼: 네 줄(native·native·native·core 길) 응답 + O/X 단추 · '게임 진동 길' 스위치 view → 다음 게임 메시지 'g:view' · off → 안 보냄·기록 'off'
//              · 레벨 1 한 숨 뒤 '게임 진동 기록' ≥ 1줄(길·응답 ms·'소리 puff ±60 ms') · 터치 모드 type=playback · '지금 재생' 제목 PUFF! · ⚙ 소리·진동 시험 → 진동 3길 응답(view/engine/core)·앱 정보 표·예상 범주
//              · 마이크 켬 → getUserMedia 때 type=auto(= 'playback' 이면 iOS 가 녹음을 안 함) · 소리 키움 · 무음 단추 잠김 · 끔 → playback
//              · '무음 모드에서도 소리' 끔 → auto · 마이크 단추 두 번 연타 = 녹음 한 번 · 수명주기 pause/resume = 'playback' 안 거치고 auto
//              · 게임 소리 끔 → auto(음악 안 끊음) · 켬 → playback
//              · 소리 컨텍스트는 클릭(활성화) 안에서 만들어져 running · 표가 0.5초마다 다시 그려짐(오디오 시계 '흐름') · 시험 전 → 후 줄
//  [stuck]     첫 AudioContext 가 resume 에 영영 대답 안 함(iOS WebKit 버그 흉내) → 재윤님 순서(⚙ → 2.5초 → [시험])에서 시험 도중 다시 만들기 없음
//              · 삑·푸가 같은 컨텍스트(멈춤으로 보임) → 활성화 두 번 뒤 다음 클릭에서 닫고 새로 만들어 running
//  [stall]     첫 AudioContext 가 'running' 인데 시계가 안 흐름(iOS 끊김 뒤 흉내) → 톡마다 stall 로 세고 두 번 뒤 다시 만들어 시계 흐름
//  [race-lost] 채널 래퍼(window.PuffHaptic)가 핸들러 등록보다 먼저 돌아 비어 있어도 진동 메시지가 간다(메시지 핸들러로 직접)
//  [web]       다리 없는 빌드(dist/puff.html): navigator.audioSession·mediaSession 을 건드리지 않음 · 시험 표에 '웹'·진동 '이 기기 미지원'
// 사용: npm run app:www && PW=$(npm root -g)/playwright node tools/app-bridge-check.mjs   (약 1분)
//       app/assets/www/index.html(git 밖)이 없으면 여기서 node tools/app-www.mjs 를 먼저 돌린다(dist/puff.html 은 있어야 함 = npm run build)
import { createRequire } from 'module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
if (!existsSync('app/assets/www/index.html')) execFileSync(process.execPath, ['tools/app-www.mjs'], { stdio: 'inherit' });
const files = { app: readFileSync('app/assets/www/index.html'), web: readFileSync('dist/puff.html') };
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0]; // ?norender 같은 시험 인자는 버리고 경로만
  const f = u === '/' ? files.app : u === '/web' ? files.web : null;
  r.writeHead(f ? 200 : 404, { 'content-type': 'text/html' });
  r.end(f || '');
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

// 페이지 안에 심는 흉내(문서 시작 전)
function fakeHost({ variant }) {
  delete Navigator.prototype.vibrate; // WebKit 에는 vibrate 가 없다
  const sess = { _t: 'auto', log: [] };
  Object.defineProperty(sess, 'type', { get() { return this._t; }, set(v) { this._t = String(v); this.log.push(this._t); }, enumerable: true });
  Object.defineProperty(Navigator.prototype, 'audioSession', { get: () => sess, configurable: true });
  window.__fakeSess = sess;
  window.__gumTypes = [];
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (c) => { window.__gumTypes.push(sess.type); return gum(c); };
  window.__resumeTypes = []; // AudioContext.resume() 를 부른 순간의 type(수명주기: 마이크를 다시 켤 거면 'auto' 에서 깨워야 함)
  const res0 = AudioContext.prototype.resume;
  AudioContext.prototype.resume = function () { window.__resumeTypes.push(sess.type); return res0.call(this); };
  window.__acMade = 0; // 만들어진 AudioContext 수(부팅만으로는 0 이어야 함 — 활성화 안에서만 만든다)
  const AC0 = window.AudioContext;
  window.AudioContext = class extends AC0 {
    constructor(...a) {
      super(...a);
      const first = window.__acMade++ === 0;
      if (first && variant === 'stuck') { // 첫 컨텍스트: 멈추고, resume 은 영영 대답 없음(bugs.webkit.org 281566 흉내)
        AC0.prototype.suspend.call(this);
        this.resume = () => new Promise(() => {});
      }
      if (first && variant === 'stall') Object.defineProperty(this, 'currentTime', { get: () => 0.5, configurable: true }); // running 인데 시계 멈춤
    }
  };
  if (variant === 'web') return;
  // Dart 흉내(app/lib/haptics.dart HapticBridge.handle 과 같은 응답 모양)
  let n = 0;
  window.__hapt = [];
  const kind = (m) => (m.startsWith('p:') ? 'pattern' : (+m || 0) <= 0 ? 'none' : +m <= 15 ? 'light' : +m <= 32 ? 'medium' : 'heavy');
  const handler = {
    postMessage(m) {
      m = String(m);
      window.__hapt.push(m);
      const ack = { n: ++n };
      if (m.startsWith('i:')) Object.assign(ack, { id: m.slice(2), path: 'info', info: { platform: 'iOS', category: 'Playback', mode: 'Default', hapticsRec: true, route: 'Speaker', volume: 0.5, otherAudio: false, supportsHaptics: true, lowPower: false, ios: '27.0.1' } });
      else if (m.startsWith('d:')) { const p = m.split(':'); Object.assign(ack, { id: p[3], path: p[1] === 'engine' ? 'engine' : p[1] === 'core' ? 'core' : 'view' }); }
      else if (m.startsWith('g:')) { const p = m.split(':'); Object.assign(ack, { id: p[2], path: kind(p.slice(3).join(':')) === 'none' ? 'none' : p[1] === 'view' ? 'view' : 'core' }); } // Dart game(): auto = Core Haptics 먼저
      else if (m.startsWith('w:')) Object.assign(ack, { id: m.slice(2), path: 'warm' });
      else ack.path = kind(m) === 'none' ? 'none' : 'core';
      ack.ok = true;
      setTimeout(() => window.__puffApp && window.__puffApp.ack(JSON.parse(JSON.stringify(ack))), 8); // runJavaScript 왕복
    },
  };
  if (variant === 'race-lost') {
    window.webkit = { messageHandlers: {} };
    window.PuffHaptic = undefined; // 래퍼가 핸들러 등록 전에 돎
    setTimeout(() => { window.webkit.messageHandlers.PuffHaptic = handler; }, 0);
  } else {
    window.webkit = { messageHandlers: { PuffHaptic: handler } };
    window.PuffHaptic = window.webkit.messageHandlers.PuffHaptic; // webview_flutter_wkwebview 3.26.2 래퍼와 같은 줄
  }
}

const checks = [];
const ok = (name, cond, info = '') => { checks.push(!!cond); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

async function open(variant, path = '') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  await ctx.grantPermissions(['microphone'], { origin: base });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await page.addInitScript(fakeHost, { variant });
  await page.goto(variant === 'web' ? base + '/web' : base + '/' + path);
  await page.waitForFunction(() => window.__puffBooted, null, { timeout: 60000 });
  return { ctx, page, errs };
}
const diagRows = (page) => page.evaluate(() => Object.fromEntries((window.__puffDiagLast?.rows || []).map(([k, v]) => [k, v])));
async function runDiag(page) {
  await page.click('#tuneBtn');
  await page.click('#diagGo');
  await page.waitForFunction(() => window.__puffDiagLast?.done, null, { timeout: 20000 });
  return diagRows(page);
}

{ // ── 앱 ──
  console.log('[app] 다리 + 가짜 WKWebView 채널·Dart 응답·audioSession');
  const { ctx, page, errs } = await open('app');
  const boot = await page.evaluate(() => ({ native: document.documentElement.classList.contains('native'), type: navigator.audioSession.type, vib: typeof navigator.vibrate, np: navigator.mediaSession?.metadata?.title ?? null, made: window.__acMade }));
  ok('부팅: html.native · navigator.vibrate 다리', boot.native && boot.vib === 'function');
  ok('터치 모드 소리 세션 = playback (무음 모드에서도 소리)', boot.type === 'playback', `type=${boot.type}`);
  ok("'지금 재생' 제목 = PUFF! (없으면 127.0.0.1)", boot.np === 'PUFF!', `title=${boot.np}`);
  const r = await runDiag(page);
  await page.screenshot({ path: 'tools/scratch/app-bridge-diag.png' });
  ok('시험 표: 앱 · html.native · AudioContext 있음', r['실행 환경'] === '앱 · html.native 예' && /^(running|suspended)/.test(r.AudioContext || ''), `${r['실행 환경']} / ${r.AudioContext}`);
  const bp = r['① 삑 · ② 푸 소리 상태(전 → 삑 뒤 → 푸 뒤)'] || '';
  ok('시험 전 → 삑 뒤 → 푸 뒤: 끝이 running · 시계 흐름', /→ running [\d.]+s → running [\d.]+s \(흐름 \+/.test(bp), bp);
  const log0 = r['소리 상태 기록'] || '';
  ok('소리 컨텍스트: 부팅에선 안 만들고 첫 클릭(활성화) 안에서 만들어 running', boot.made === 0 && /^new@[\d.]+s\((pointerup|click)\)→running@[\d.]+s \d+ms(?!\()/.test(log0), `부팅 때 ${boot.made}개 · ${log0}`);
  await page.waitForTimeout(1300);
  const live = await diagRows(page);
  ok("표가 계속 다시 그려짐(소리 시계 '흐름' · 지금 시각 바뀜)", /흐름 \+/.test(live['소리 시계'] || '') && live['소리 시계'] !== r['소리 시계'], `${r['소리 시계']} ⇒ ${live['소리 시계']}`);
  ok('③-1 게임 길 응답 = Core Haptics(새 기본 길)', /^OK · core/.test(r['③-1 진동: 게임 길'] || ''), r['③-1 진동: 게임 길']);
  ok('③-2 엔진 길 응답', /^OK · engine/.test(r['③-2 진동: 엔진 길'] || ''), r['③-2 진동: 엔진 길']);
  ok('③-3 Core Haptics 응답', /^OK · core/.test(r['③-3 진동: Core Haptics'] || ''), r['③-3 진동: Core Haptics']);
  ok('앱 정보 줄(앱 쪽 세션·출력·녹음 중 햅틱·기기)', r['앱 쪽 세션(참고)'] === 'Playback / Default' && /Speaker/.test(r['앱 쪽 출력(참고)'] || '') && r['녹음 중 햅틱 허용(앱 쪽)'] === '예' && /iOS 27/.test(r['기기'] || ''), `${r['앱 쪽 세션(참고)']} | ${r['앱 쪽 출력(참고)']} | ${r['기기']}`);
  ok('예상 소리 범주 = 재생(무음 모드 무시)', r['예상 소리 범주'] === '재생(무음 모드 무시)', r['예상 소리 범주']);
  ok('햅틱 채널·보냄/응답 수가 맞음', r['햅틱 채널'] === 'PuffHaptic · 보냄 / 응답 4 / 4', r['햅틱 채널']);
  ok('audioSession 줄', /^예 · type=playback/.test(r.audioSession || ''), r.audioSession);
  ok("'게임 진동 길' 줄 = Core Haptics(기본) · 기록 줄 있음", r['게임 진동 길'] === 'Core Haptics(기본)' && r['게임 진동 기록'] != null, `${r['게임 진동 길']} | ${r['게임 진동 기록']}`);
  // ④ 게임처럼: 네 줄 · 길(native ×3 · core) · 응답 · O/X
  const m0 = await page.evaluate(() => window.__hapt.length);
  await page.click('#diag4Go');
  await page.waitForFunction(() => window.__puffDiagLast?.fourDone, null, { timeout: 40000 });
  const four = await page.evaluate(() => window.__puffDiagLast.four);
  const msgs4 = await page.evaluate((k) => window.__hapt.slice(k), m0);
  const txt4 = await page.evaluate(() => [...document.querySelectorAll('#diag4 tr')].map((tr) => tr.textContent));
  ok('④ 네 줄: 길 native·native·native·core · 줄마다 응답(view/core ms) · O/X 단추', four?.length === 4 && four.map((x) => x.k).join('') === 'abcd' && txt4.length === 4 && /native → view \d+ms/.test(txt4[0]) && /native → view/.test(txt4[2]) && /core → core \d+ms/.test(txt4[3]) && (await page.$$('#diag4 .diag-ox button')).length === 8,
    `${JSON.stringify(four)} | ${txt4.map((x) => x.slice(0, 60)).join(' / ')}`);
  ok('④ 보낸 메시지: a 생성기 강 · b 생성기 강 · c 중·강·약×3 · d tapMedium·tapHeavy·tapLight×3', msgs4.map((m) => m.split(':').slice(0, 3).join(':')).join(',') === 'd:native:heavy,d:native:heavy,d:native:medium,d:native:heavy,d:native:light,d:native:light,d:native:light,d:core:tapMedium,d:core:tapHeavy,d:core:tapLight,d:core:tapLight,d:core:tapLight', msgs4.join(','));
  await page.click('#diag4 .diag-ox button[data-i="2"][data-a="X"]');
  await page.click('#diag4 .diag-ox button[data-i="3"][data-a="O"]');
  const ans = await page.evaluate(() => window.__puffDiagLast.four.map((x) => x.ans));
  ok('④ O/X 답이 표에 남음', ans.join(',') === ',,X,O', JSON.stringify(ans));
  // 게임 진동 길 스위치: core → view(다음 게임 메시지 'g:view', 응답 view) → off(안 보냄·기록 'off') → core
  await page.click('#diagRoute');
  const rv = await page.evaluate(async () => { const n = window.__hapt.length; navigator.vibrate(25); await new Promise((r) => setTimeout(r, 120)); const g = window.__puffApp.games.at(-1); return { route: window.__puffApp.route(), msg: window.__hapt.slice(n).join(','), path: g.path, ms: g.ms }; });
  await page.click('#diagRoute');
  const ro = await page.evaluate(async () => { const n = window.__hapt.length, s0 = window.__puffApp.sent; navigator.vibrate(25); await new Promise((r) => setTimeout(r, 120)); const g = window.__puffApp.games.at(-1); return { route: window.__puffApp.route(), msgs: window.__hapt.length - n, sent: window.__puffApp.sent - s0, path: g.path }; });
  await page.click('#diagRoute');
  const rc = await page.evaluate(() => window.__puffApp.route());
  ok("길 스위치: view → 'g:view:…' 응답 view · off → 보냄 0·기록 'off' · 다시 core", rv.route === 'view' && /^g:view:g\d+:25$/.test(rv.msg) && rv.path === 'view' && rv.ms != null && ro.route === 'off' && ro.msgs === 0 && ro.sent === 0 && ro.path === 'off' && rc === 'core', `${JSON.stringify(rv)} | ${JSON.stringify(ro)} | ${rc}`);
  // 마이크 켬/끔
  await page.click('#diagMic');
  await page.waitForFunction(() => (window.__puffDiagLast?.rows || []).some(([k, v]) => k === '마이크' && /켜짐/.test(v)), null, { timeout: 10000 }).catch(() => {});
  const on = await page.evaluate(() => ({ gum: window.__gumTypes.slice(), type: navigator.audioSession.type }));
  const r2 = await diagRows(page);
  ok('마이크 켬: getUserMedia 때 type=auto (playback 이면 iOS 가 녹음 안 함)', on.gum.length === 1 && on.gum[0] === 'auto' && on.type === 'auto', `gum ${JSON.stringify(on.gum)} · 지금 ${on.type}`);
  ok('마이크 켬: 마이크용 AudioContext running · 소리 키움 표시', /^켜짐 · AudioContext running · 소리 키움/.test(r2['마이크'] || ''), r2['마이크']);
  const lock = await page.evaluate(() => ({ dis: document.querySelector('#diagSilent').disabled, txt: document.querySelector('#diagSilent').textContent }));
  ok("마이크 켬: '무음 모드에서도 소리' 단추 잠김 · 예상 범주 = 녹음+재생", lock.dis && /마이크 켬 중엔 무효/.test(lock.txt) && /^녹음\+재생/.test(r2['예상 소리 범주'] || ''), `${lock.txt} | ${r2['예상 소리 범주']}`);
  await page.click('#diagMic');
  await page.waitForTimeout(300);
  const off = await page.evaluate(() => navigator.audioSession.type);
  ok('마이크 끔 → playback 으로 돌아감', off === 'playback', `type=${off}`);
  await page.click('#diagSilent');
  const silentOff = await page.evaluate(() => ({ type: navigator.audioSession.type, saved: JSON.parse(localStorage.getItem('g2-ddakji-profile-v1') || '{}').settings?.silentPlay }));
  await page.click('#diagSilent');
  const silentOn = await page.evaluate(() => navigator.audioSession.type);
  ok("'무음 모드에서도 소리' 끔 → auto(저장) · 켬 → playback", silentOff.type === 'auto' && silentOff.saved === false && silentOn === 'playback', `${silentOff.type}/${silentOff.saved} → ${silentOn}`);
  await page.click('#tuneClose');
  // 홈 마이크 단추 연타(권한 창 대기 중 두 번) → 녹음은 한 번만
  const g0 = await page.evaluate(() => window.__gumTypes.length);
  await page.evaluate(() => { const b = document.querySelector('#micBtn'); b.click(); b.click(); });
  await page.waitForFunction(() => /켜짐/.test(document.querySelector('#micBtn').textContent), null, { timeout: 10000 }).catch(() => {});
  const dbl = await page.evaluate((g) => ({ n: window.__gumTypes.length - g, txt: document.querySelector('#micBtn').textContent }), g0);
  ok('마이크 단추 연타 → getUserMedia 한 번 · 켜짐', dbl.n === 1 && /켜짐/.test(dbl.txt), `${dbl.n}번 · ${dbl.txt}`);
  // 앱 수명주기(뒤로 갔다 옴): 마이크 켬이면 돌아올 때 'playback' 을 거치지 않고 바로 auto → 녹음
  const lc = await page.evaluate(async () => {
    window.__puffLifecycle.pause();
    const l0 = window.__fakeSess.log.length, g = window.__gumTypes.length, r0 = window.__resumeTypes.length;
    await window.__puffLifecycle.resume();
    return { log: window.__fakeSess.log.slice(l0), gum: window.__gumTypes.slice(g), res: window.__resumeTypes.slice(r0), txt: document.querySelector('#micBtn').textContent };
  });
  ok("수명주기 resume(마이크 켬) → 'auto' 한 번 · 소리 깨움·getUserMedia 모두 auto 에서", lc.log.join(',') === 'auto' && lc.gum.join(',') === 'auto' && lc.res.length >= 1 && lc.res.every((x) => x === 'auto') && /켜짐/.test(lc.txt), `기록 ${JSON.stringify(lc.log)} · resume ${JSON.stringify(lc.res)} · gum ${JSON.stringify(lc.gum)}`);
  await page.click('#micBtn');
  await page.waitForTimeout(200);
  // 게임 소리 끔 → auto(소리를 안 내면서 다른 앱 음악을 끊지 않게) · 켬 → playback
  await page.click('#sndBtn');
  const sndOff = await page.evaluate(() => navigator.audioSession.type);
  await page.click('#sndBtn');
  const sndOn = await page.evaluate(() => navigator.audioSession.type);
  ok('게임 소리 끔 → auto · 켬 → playback', sndOff === 'auto' && sndOn === 'playback', `${sndOff} → ${sndOn}`);
  const log = await page.evaluate(() => window.__fakeSess.log);
  console.log(`  type 기록: ${log.join(' → ')}`);
  ok('오류 0', !errs.length, errs.join(' | '));
  await ctx.close();
}

{ // ── 멈춘 컨텍스트 → 다시 만들기 ──
  console.log('[stuck] 첫 AudioContext 의 resume 이 영영 대답 없음 → 활성화 두 번 뒤 닫고 새로');
  const { ctx, page, errs } = await open('stuck');
  // 재윤님 순서: ⚙(만들기) → 2.5초 → [시험](두 번째 활성화 = resume). 650ms 뒤 푸가 다시 만들면(옛 userActivation 길) 삑·푸가 다른 컨텍스트로 갔다
  await page.click('#tuneBtn');
  await page.waitForTimeout(2500);
  await page.click('#diagGo');
  await page.waitForFunction(() => window.__puffDiagLast?.done, null, { timeout: 20000 });
  const t0 = await diagRows(page);
  const same = await page.evaluate(() => { const r = window.__puffDiagLast.res; return !!r.s0 && r.s0.ctx === r.s1?.ctx && r.s1?.ctx === r.s2?.ctx; });
  const made0 = await page.evaluate(() => window.__acMade);
  const lg0 = t0['소리 상태 기록'] || '', bp0 = t0['① 삑 · ② 푸 소리 상태(전 → 삑 뒤 → 푸 뒤)'] || '';
  ok('⚙ → 2.5초 → [시험]: 시험 도중 다시 만들기 없음 · 삑·푸 같은 컨텍스트 · 멈춤으로 보임', !/recreate@/.test(lg0) && made0 === 1 && same && /^suspended [\d.]+s → suspended [\d.]+s → suspended [\d.]+s \(멈춤 \+0\.00s/.test(bp0), `만듦 ${made0} · 같은 ctx ${same} · ${bp0} · ${lg0}`);
  let rr = {};
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    rr = await diagRows(page);
    if (/recreate@/.test(rr['소리 상태 기록'] || '')) break;
    await page.click('.diag-how'); // 아무 데나 톡(활성화)
  }
  await page.waitForTimeout(700);
  rr = await diagRows(page);
  const lg = rr['소리 상태 기록'] || '';
  const made = await page.evaluate(() => window.__acMade);
  ok('멈춘 컨텍스트: 시도 기록(resume…) 뒤 recreate → 새 컨텍스트 running', /resume@[\d.]+s\((pointerup|click)\)/.test(lg) && /recreate@[\d.]+s\((pointerup|click)\) suspended › new@[\d.]+s\((pointerup|click)\)→running/.test(lg) && made === 2 && /^running/.test(rr.AudioContext || ''), `만듦 ${made} · ${rr.AudioContext} · ${lg}`);
  await page.evaluate(() => { window.__prevRes = window.__puffDiagLast?.res; }); // 앞 시험의 done 이 남아 있다 → 새 결과를 기다림
  await page.click('#diagGo');
  await page.waitForFunction(() => window.__puffDiagLast?.done && window.__puffDiagLast.res !== window.__prevRes, null, { timeout: 20000 });
  const r3 = await diagRows(page);
  ok('다시 만든 뒤 시험: 삑·푸 때 running · 시계 흐름', /running [\d.]+s \(흐름 \+/.test(r3['① 삑 · ② 푸 소리 상태(전 → 삑 뒤 → 푸 뒤)'] || ''), r3['① 삑 · ② 푸 소리 상태(전 → 삑 뒤 → 푸 뒤)']);
  ok('오류 0', !errs.length, errs.join(' | '));
  await ctx.close();
}

{ // ── 'running' 인데 시계 멈춤 → stall 로 세고 다시 만들기 ──
  console.log("[stall] 첫 AudioContext 가 running 인데 currentTime 이 안 흐름 → 톡 두 번 stall 뒤 다시 만듦");
  const { ctx, page, errs } = await open('stall');
  await page.click('#tuneBtn');
  let rr = {};
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    rr = await diagRows(page);
    if (/recreate@/.test(rr['소리 상태 기록'] || '')) break;
    await page.click('.diag-how');
  }
  await page.waitForTimeout(1300);
  rr = await diagRows(page);
  const lg = rr['소리 상태 기록'] || '';
  const made = await page.evaluate(() => window.__acMade);
  const nStall = (lg.match(/stall@/g) || []).length;
  ok('running 인데 시계 멈춤: stall 두 번 → recreate(running) → 새 컨텍스트 running · 시계 흐름', nStall === 2 && /stall@[\d.]+s\((pointerup|click)\) \+0\.00s/.test(lg) && /recreate@[\d.]+s\((pointerup|click)\) running › new@[\d.]+s\((pointerup|click)\)→running/.test(lg) && made === 2 && /흐름 \+/.test(rr['소리 시계'] || ''), `만듦 ${made} · stall ${nStall} · ${rr['소리 시계']} · ${lg}`);
  ok('오류 0', !errs.length, errs.join(' | '));
  await ctx.close();
}

{ // ── 경쟁에 진 채널 래퍼 ──
  console.log('[race-lost] window.PuffHaptic 비어 있음 → 메시지 핸들러로 직접');
  const { ctx, page, errs } = await open('race-lost');
  const res = await page.evaluate(async () => {
    const n0 = window.__puffApp.acks;
    navigator.vibrate(50);
    navigator.vibrate([40, 60, 40]);
    await new Promise((r) => setTimeout(r, 200));
    return { msgs: window.__hapt.slice(), acks: window.__puffApp.acks - n0, ch: window.__puffApp.channelName() };
  });
  ok('진동 메시지 2개가 가고 응답 2개', res.msgs.join('|') === 'g:auto:g1:50|g:auto:g2:p:40,60,40' && res.acks === 2, `${JSON.stringify(res.msgs)} · 응답 ${res.acks} · 채널 ${res.ch}`);
  ok('오류 0', !errs.length, errs.join(' | '));
  await ctx.close();
}

{ // ── 레벨 1 한 숨 → 게임 진동 기록 ──
  console.log("[game] 레벨 1 한 숨 → ⚙ '게임 진동 기록'(길·응답 ms·±60 ms 안 소리)");
  const { ctx, page, errs } = await open('app', '?norender#lv1');
  await page.waitForFunction(() => !document.querySelector('#lvIntro').hidden, null, { timeout: 20000 });
  await page.click('#liPlay');
  await page.waitForFunction(() => window.__puff?.().state === 'match' && !document.querySelector('#hint').hidden, null, { timeout: 40000 });
  await page.waitForTimeout(500);
  const pt = await page.evaluate(() => window.__puff());
  const x = pt.frontTop.x, y = pt.frontTop.y + (pt.frontBottom.y - pt.frontTop.y) * 0.25;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x, y + 0.42 * 390 * 0.5 * i / 8); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(1800);
  await page.$eval('#tuneBtn', (e) => e.click()); // 판 화면 위에 ⚙ 창(홈으로 나가지 않음 — 뒤집힘 연출 도중 나가기는 이 시험의 대상이 아니다)
  await page.waitForTimeout(700);
  const rows = await page.evaluate(() => (window.__puffDiagLast?.rows || []).filter(([k], i, a) => k === '게임 진동 기록' || (k === '' && a.slice(0, i).some(([kk]) => kk === '게임 진동 기록'))).map(([, v]) => v));
  ok("게임 진동 기록 ≥ 1줄: 길 core · 응답 ms · '소리 puff ±60 ms'", rows.length >= 1 && rows.some((v) => /· core · \d+ms · 소리 puff [+-]\d+ms$/.test(v)), rows.join(' / '));
  ok('오류 0', !errs.length, errs.join(' | '));
  await ctx.close();
}

{ // ── 웹(다리 없음) ──
  console.log('[web] dist/puff.html — 소리 세션 안 건드림');
  const { ctx, page, errs } = await open('web');
  const r = await runDiag(page);
  const log = await page.evaluate(() => window.__fakeSess.log);
  await page.click('#tuneClose');
  await page.click('#sndBtn');
  await page.click('#sndBtn');
  const log2 = await page.evaluate(() => ({ log: window.__fakeSess.log.slice(), np: navigator.mediaSession?.metadata ?? null }));
  ok('navigator.audioSession·mediaSession 을 건드리지 않음(시험·소리 켬/끔 뒤에도)', !log.length && !log2.log.length && log2.np === null, `기록 ${JSON.stringify(log2.log)} · 제목 ${JSON.stringify(log2.np)}`);
  ok('웹 안내문 · 무음 단추 없음', await page.evaluate(() => !document.querySelector('#diagSilent')), '');
  ok("시험 표: '웹' · 진동 '이 기기 미지원' · 게임 진동 기록 '앱 전용'", r['실행 환경'] === '웹 · html.native 아니오' && r['③ 진동'] === '이 기기 미지원' && r['게임 진동 기록'] === '앱 전용' && !(await page.$('#diag4Go')), `${r['실행 환경']} / ${r['③ 진동']} / ${r['게임 진동 기록']}`);
  ok('오류 0', !errs.length, errs.join(' | '));
  await ctx.close();
}

await browser.close();
srv.close();
const pass = checks.every(Boolean);
console.log(pass ? `app-bridge-check: PASS (${checks.length})` : 'app-bridge-check: FAIL');
process.exit(pass ? 0 : 1);
