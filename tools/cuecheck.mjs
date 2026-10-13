// cuecheck.mjs — 공략 단서(cues.js)가 물리 실측·규칙과 맞는지 (5차). 사용: node tools/cuecheck.mjs
import { readFileSync, existsSync } from 'node:fs';
import { tideDiscs, tideFill, idealWindow, BRIM, shotCause, shotVerdict, goodShot, breathKey, bigKey, receiptKey, outTipOk, causeLabelKey, resultTitleKey, topCause, CAUSES } from '../mockup/src/cues.js';
import { STRINGS } from '../mockup/src/i18n.js';
import { sweetHiFor } from '../mockup/src/rules.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } else console.log('✓', m); };
// 1) 물결 = sweetHiFor 의 역함수, 0.9·hi 에서 정확히 꼭대기
let maxErr = 0, maxFill = 0;
for (let n = 1; n <= 24; n++) { maxErr = Math.max(maxErr, Math.abs(tideDiscs(sweetHiFor(n)) - n)); maxFill = Math.max(maxFill, Math.abs(tideFill(BRIM * sweetHiFor(n), n) - 1)); }
ok(maxErr < 1e-9, `tideDiscs(sweetHiFor(n)) == n (최대 오차 ${maxErr.toExponential(1)})`);
ok(maxFill < 1e-9, `tideFill(0.9·hi, n) == 1 (최대 오차 ${maxFill.toExponential(1)})`);
for (const n of [3, 12, 24]) console.log(`   n=${n}: 0.6배 ${tideFill(0.6 * sweetHiFor(n), n).toFixed(2)} / 0.78배 ${tideFill(0.78 * sweetHiFor(n), n).toFixed(2)} / 1.0배 ${tideFill(sweetHiFor(n), n).toFixed(2)}`);
// 2) 높이 창이 atlas 실측에서 창 밖보다 낫다 (가운데·초록)
for (const n of [6, 12, 20]) {
  const f = `tools/scratch/atlas/a${n}.json`;
  if (!existsSync(f)) { console.log(`- atlas a${n}.json 없음(건너뜀)`); continue; }
  const cells = JSON.parse(readFileSync(f, 'utf8')).filter((c) => c.r === 0.9 && c.lat === 0);
  const w = idealWindow(n, 'flip');
  const inW = cells.filter((c) => { const k = Math.max(1, Math.round((1 - c.hf) * n + 0.5)); return k >= w[0] && k <= w[1]; });
  const outW = cells.filter((c) => !inW.includes(c));
  const avg = (a) => a.reduce((s, c) => s + c.mean, 0) / Math.max(1, a.length);
  ok(inW.length === 0 || avg(inW) >= avg(outW), `n=${n} 창[${w}] 안 평균 ${avg(inW).toFixed(1)} ≥ 밖 ${avg(outW).toFixed(1)}${inW.length ? '' : ' (창에 든 칸 없음)'}`);
}
// 3) 숨 원인 코드 표 (P0 '숨 원인을 코드 하나로'): (n·k·ratio·flips·outs·type …) → 기대 원인. 회귀 = 제안이 든 두 반례
const C = (o) => ({ k: 3, lat: 0, outs: 0, type: 'flip', ...o });
const TABLE = [
  ['약한 숨·0장 → weak', C({ n: 12, ratio: 0.5, flips: 0 }), 'weak'],
  ['셈·원 밖 0·결과 나쁨 → strong (옛 판정은 원 밖 0이면 셈이 아니었다)', C({ n: 12, ratio: 1.15, flips: 2 }), 'strong'],
  ['살짝 셈이지만 절반 이상 → 지적 없음', C({ n: 12, ratio: 1.04, flips: 7, outs: 1 }), null],
  ['회귀 L4: 마지막 1장 숨 1.42·0장 → strong(마지막은 살살)', C({ n: 1, k: 1, ratio: 1.42, flips: 0, type: 'rival' }), 'strong'],
  ['회귀 L6: 초록 0.87·7/12·원 밖 2 → 지적 없음(옛 카드 rcpStrong)', C({ n: 12, ratio: 0.87, flips: 7, outs: 2 }), null],
  ['초록·원 밖 2·창보다 위(맨 위) → high', C({ n: 12, k: 1, ratio: 0.9, flips: 1, outs: 2 }), 'high'],
  ['초록·원 밖 2·창 안 → luck', C({ n: 12, k: 3, ratio: 0.9, flips: 1, outs: 2 }), 'luck'],
  ['너무 아래 → low', C({ n: 12, k: 9, ratio: 0.9, flips: 1 }), 'low'],
  ['책상 입으로 아래 → low 지적 없음(퍼올리는 자세) → luck', C({ n: 12, k: 9, ratio: 0.9, flips: 1, pose: 'low' }), 'luck'],
  ['책상 입으로 맨 위 → high', C({ n: 12, k: 1, ratio: 0.9, flips: 0, pose: 'low' }), 'high'],
  ['초록·창 안·옆 → side', C({ n: 12, k: 3, ratio: 0.9, lat: 0.7, flips: 1 }), 'side'],
  ['★오른쪽 + 왼쪽 옆 조준(맞는 쪽) → 옆 지적 없음', C({ n: 12, k: 4, ratio: 0.9, lat: -0.8, flips: 2, type: 'goldenSide', pocketLatSign: 1, pocketOk: false }), 'luck'],
  ['★오른쪽 + 오른쪽 옆 조준 → side', C({ n: 12, k: 4, ratio: 0.9, lat: 0.8, flips: 2, type: 'goldenSide', pocketLatSign: 1, pocketOk: false }), 'side'],
  ['★칸 성공이면 장수가 적어도 지적 없음', C({ n: 12, k: 4, ratio: 0.6, lat: -0.8, flips: 1, type: 'goldenSide', pocketLatSign: 1, pocketOk: true }), null],
  ['약한 숨으로 절반 이상 → 지적 없음(약하게 넘겨도 좋은 결과)', C({ n: 6, k: 2, ratio: 0.7, flips: 4 }), null],
  ['약한 숨으로 싹쓸이 12/12 → 지적 없음', C({ n: 12, ratio: 0.7, flips: 12 }), null],
  ['황금 판: 황금 포함 3/11·숨 1.05 = 클리어하는 숨 → 지적 없음(옛: strong)', C({ n: 11, ratio: 1.05, flips: 3, type: 'golden', goalHit: true }), null],
  ['황금 판: 황금 못 넘기고 7/11·초록 → 좋음 아님(옛: null → rcpGood 칭찬) → luck(세 줄)', C({ n: 11, ratio: 0.9, flips: 7, type: 'golden', goalHit: false }), 'luck'],
  ['장수 판(13장 중 5장 목표): 첫 숨 5/13·숨 1.05 = 목표 도달 → 지적 없음(옛: strong)', C({ n: 13, ratio: 1.05, flips: 5, goalHit: true }), null],
  ['장수 판 마지막 숨: 남은 5장 중 2장으로 목표 도달·숨 0.7 → 지적 없음', C({ n: 5, k: 2, ratio: 0.7, flips: 2, goalHit: true }), null],
  ['장수 판: 목표 못 채운 2/13·숨 1.05 → strong', C({ n: 13, ratio: 1.05, flips: 2, goalHit: false }), 'strong'],
  ['40장 더미(자유 대전 POT 20) 14장·숨 1.08 → 절반 미만 = strong', C({ n: 40, ratio: 1.08, flips: 14 }), 'strong'],
  ['작은 더미(창 없음)·초록·0장 → luck', C({ n: 3, k: 1, ratio: 0.9, flips: 0 }), 'luck'],
  ['황금 판(창 없음)·초록·가운데 → luck(세 줄 문구)', C({ n: 10, k: 1, ratio: 0.9, flips: 2, type: 'golden' }), 'luck'],
  ['상대 숨(k 모름)·초록·원 밖 3 → 높이 판정 없이 luck', { n: 12, ratio: 0.9, flips: 1, outs: 3 }, 'luck'],
  ['경계 1.0 = 초록, 0.78 = 초록', C({ n: 12, ratio: 1.0, flips: 0 }), 'luck'],
  ['경계 0.78 = 초록', C({ n: 12, ratio: 0.78, flips: 0 }), 'luck'],
  ['경계 0.779 = 약함', C({ n: 12, ratio: 0.779, flips: 0 }), 'weak'],
];
for (const [m, o, want] of TABLE) { const got = shotCause(o); ok(got === want, `${m} (기대 ${want}, 실제 ${got})`); }
ok(TABLE.length >= 12, `원인 표 ${TABLE.length}케이스 (≥ 12)`);

// 4) 채널: 숨 글자·큰 글자·방금 숨 카드·원 밖 안내·결과 원인 줄이 모두 같은 판정으로만 고른다
// 키마다 무엇을 말하나: b = 숨(+ 더 세게 / − 더 살살 / = 그대로·맞음), h = 높이(+ 더 위 / − 더 아래 / = 그대로)
const STANCE = {
  fbTooWeak: { b: '+' }, fbWeak: { b: '+' }, fbPerfect: { b: '=' }, fbStrong: { b: '-' }, fbTooStrong: { b: '-' }, fbLast: { b: '-' },
  miss: {}, close: {}, blownOut: { b: '-' }, nice: {}, great: {}, amazing: {}, perfect: {},
  rcpWeak: { b: '+' }, rcpStrong: { b: '-' }, rcpStrongIn: { b: '-' }, rcpLast: { b: '-' },
  rcpHigh: { h: '-' }, rcpHighOut: { h: '-' }, rcpLowTop: { h: '-' }, rcpLow: { h: '+' }, rcpUseLow: {},
  rcpSide: {}, rcpSideStar: {}, rcpLuck: { b: '=', h: '=' }, rcpThree: {}, rcpGood: { b: '=', h: '=' }, rcpNice: {},
  outTip: { b: '-' },
  causeWeak: { b: '+' }, causeStrong: { b: '-' }, causeHigh: { h: '-' }, causeLow: { h: '+' }, causeSide: {}, causeLuck: { b: '=', h: '=' },
  clear: {}, failed: {}, notYet: {},
};
function channels(o, nearMiss, useLowOk) {
  const v = shotVerdict(o);
  const keys = {
    fb: breathKey(v, o.ratio, o.n),
    big: bigKey(v, { flips: o.flips, R: o.n, outs: o.outs, nearMiss }),
    rcp: receiptKey(v, { ...o, useLowOk }),
    tip: outTipOk(v, o.outs) ? 'outTip' : null,
    cause: causeLabelKey(v.cause),
  };
  return { v, keys };
}
function clash(keys) {
  for (const dim of ['b', 'h']) {
    const set = new Set(Object.values(keys).filter(Boolean).map((k) => STANCE[k]?.[dim]).filter(Boolean));
    if (set.size > 1) return `${dim}: ${Object.entries(keys).filter(([, k]) => k && STANCE[k]?.[dim]).map(([c, k]) => `${c}=${k}(${STANCE[k][dim]})`).join(' ')}`;
  }
  return null;
}
// 회귀 두 반례: 채널별 키를 직접 본다
{
  const L4 = channels({ n: 1, k: 1, ratio: 1.42, flips: 0, outs: 0, lat: 0, type: 'rival' }, false, false);
  ok(L4.keys.fb === 'fbLast' && L4.keys.rcp === 'rcpLast' && L4.keys.rcp !== 'rcpLuck' && !clash(L4.keys), `회귀 L4: 글자 ${L4.keys.fb} · 카드 ${L4.keys.rcp} · 큰 글자 ${L4.keys.big} (옛: 글자 fbTooStrong vs 카드 rcpLuck '같은 숨으로')`);
  const L6 = channels({ n: 12, k: 3, ratio: 0.87, flips: 7, outs: 2, lat: 0, type: 'flip' }, false, false);
  ok(L6.keys.rcp === 'rcpGood' && L6.keys.fb === 'fbPerfect' && L6.keys.big === 'amazing' && !clash(L6.keys), `회귀 L6: 글자 ${L6.keys.fb} · 카드 ${L6.keys.rcp} · 큰 글자 ${L6.keys.big} (옛 카드 rcpStrong)`);
  // 검증자 반례: 좋은 결과의 '숨은 약했어' / 판 목표를 채운 숨의 지적 / 40장 더미의 '싹쓸이'
  const sweep = channels({ n: 12, k: 3, ratio: 0.7, flips: 12, outs: 0, lat: 0, type: 'flip' }, false, false);
  ok(sweep.keys.big === 'perfect' && sweep.keys.fb === null && sweep.keys.rcp === 'rcpNice', `싹쓸이 12/12·숨 0.7: 큰 글자 ${sweep.keys.big} · 글자 ${sweep.keys.fb} · 카드 ${sweep.keys.rcp} (옛: '숨은 약했어' + '넘겼지만 숨은 약했어요')`);
  const half = [0.7, 1.3].map((ratio) => channels({ n: 12, k: 3, ratio, flips: 9, outs: 0, lat: 0, type: 'flip' }, false, false).keys);
  ok(half.every((k) => k.fb === null && k.rcp === 'rcpNice' && k.big === 'amazing'), `9/12 숨 0.7 과 1.3 이 같은 말(대칭): ${half.map((k) => `${k.fb}/${k.rcp}/${k.big}`).join(' vs ')}`);
  const L11 = channels({ n: 11, k: 1, ratio: 1.05, flips: 3, outs: 0, lat: 0, type: 'golden', goalHit: true }, false, false);
  ok(L11.v.cause === null && L11.keys.fb === null && L11.keys.rcp === 'rcpNice', `L11 황금 포함 3/11·숨 1.05(클리어): 글자 ${L11.keys.fb} · 카드 ${L11.keys.rcp} (옛: '살짝 셌어' + '너무 셌어요')`);
  const L11m = channels({ n: 11, k: 3, ratio: 0.9, flips: 7, outs: 0, lat: 0, type: 'golden', goalHit: false }, false, false);
  ok(L11m.keys.rcp !== 'rcpGood' && L11m.keys.big !== 'amazing', `L11 황금 못 넘긴 7/11·초록: 카드 ${L11m.keys.rcp} · 큰 글자 ${L11m.keys.big} (옛: rcpGood '이 자리·이 숨' + 대박)`);
  const L16 = channels({ n: 13, k: 3, ratio: 1.05, flips: 5, outs: 0, lat: 0, type: 'flip', goalHit: true }, false, false);
  ok(L16.v.cause === null && L16.keys.fb === null && L16.keys.rcp === 'rcpNice', `L16 5/13 목표 도달·숨 1.05: 글자 ${L16.keys.fb} · 카드 ${L16.keys.rcp}`);
  const p40a = channels({ n: 40, k: 3, ratio: 1.08, flips: 14, outs: 0, lat: 0, type: 'flip' }, false, false);
  const p40b = channels({ n: 40, k: 1, ratio: 0.9, flips: 12, outs: 0, lat: 0, type: 'flip' }, false, false);
  ok(p40a.keys.big !== 'perfect' && p40b.keys.big !== 'perfect', `40장 더미 14장(셈)·12장(맨 위): 큰 글자 ${p40a.keys.big} · ${p40b.keys.big} (옛: 둘 다 '싹쓸이!')`);
}
// 격자 전수: 반대말 0 · 결과가 좋으면 지적 없음 · 결과가 나쁘고 ratio>1 이면 셈 · 모든 키가 표와 한·영 문구에 있다
const RATIOS = [0.3, 0.5, 0.65, 0.7, 0.77, 0.78, 0.87, 0.95, 1.0, 1.03, 1.08, 1.12, 1.2, 1.42];
let cases = 0, clashes = 0, praiseBad = 0, strongMiss = 0, bigBad = 0, firstClash = null, firstPraise = null, firstBig = null;
const used = new Set();
for (const n of [1, 2, 3, 4, 5, 6, 8, 12, 18, 20, 24, 30, 40]) { // 40 = 자유 대전 POT 20 × 2
  const ks = [null, ...new Set([1, 2, 3, 4, 5, n].filter((k) => k <= n))];
  const flipsSet = [...new Set([0, 1, 12, 14, Math.ceil(n / 2) - 1, Math.ceil(n / 2), n].filter((f) => f >= 0 && f <= n))];
  for (const type of ['flip', 'rival', 'golden', 'goldenSide']) for (const k of ks) for (const ratio of RATIOS) for (const flips of flipsSet) for (const outs of [0, 1, 2, 3]) {
    if (flips + outs > n) continue;
    // goalHit = 이 숨으로 판 목표를 채움(장수 판·황금 판), pocketOk = ★칸 성공. 둘 다 한 장 이상 넘겨야 가능
    for (const lat of [0, 0.6, -0.6]) for (const pose of ['eye', 'low']) for (const pocketOk of type === 'goldenSide' && flips > 0 ? [false, true] : [false]) for (const goalHit of (type === 'flip' || type === 'golden') && flips > 0 ? [false, true] : [false]) {
      const o = { n, k, ratio, flips, outs, type, lat, pose, pocketOk, goalHit, pocketLatSign: 1 };
      for (const nearMiss of [false, true]) for (const useLowOk of [false, true]) {
        const { v, keys } = channels(o, nearMiss, useLowOk);
        cases++;
        for (const key of Object.values(keys)) if (key) used.add(key);
        const c = clash(keys);
        if (c) { clashes++; firstClash ??= `${JSON.stringify(o)} → ${c}`; }
        // 좋은 결과 = 원인 없음 · 카드는 칭찬 둘 중 하나 · 숨 글자는 없음 또는 '딱 좋은 숨' · 원 밖 안내 없음 (약했든 셌든 같다)
        const praiseOnly = v.cause === null && ['rcpGood', 'rcpNice'].includes(keys.rcp) && (keys.fb === null || keys.fb === 'fbPerfect') && !keys.tip;
        if (goodShot(o) && !praiseOnly) { praiseBad++; firstPraise ??= `${JSON.stringify(o)} → ${JSON.stringify(keys)}`; }
        // 큰 칭찬(대박·싹쓸이)이 나오면 지적이 같이 나오지 않는다. 싹쓸이 = 모두 넘김 또는 12장↑이면서 좋은 결과
        if (['amazing', 'perfect'].includes(keys.big) && !praiseOnly) { bigBad++; firstBig ??= `${JSON.stringify(o)} → ${JSON.stringify(keys)}`; }
        if (keys.big === 'perfect' && !(flips === n || (flips >= 12 && goodShot(o)))) { bigBad++; firstBig ??= `싹쓸이 ${JSON.stringify(o)}`; }
        if (!goodShot(o) && ratio > 1 && v.cause !== 'strong') strongMiss++;
      }
    }
  }
}
ok(clashes === 0, `채널끼리 반대말 0 (${cases}경우${firstClash ? ', 첫 충돌 ' + firstClash : ''})`);
ok(praiseBad === 0, `결과가 좋으면(절반↑ · 판 목표 도달 · 황금 · ★칸) 약했든 셌든 지적하지 않는다 (위반 ${praiseBad}${firstPraise ? ', 첫 위반 ' + firstPraise : ''})`);
ok(bigBad === 0, `큰 칭찬(대박·싹쓸이) + 지적 = 0, 싹쓸이는 모두 또는 12장↑ 좋은 결과만 (위반 ${bigBad}${firstBig ? ', 첫 위반 ' + firstBig : ''})`);
ok(strongMiss === 0, `결과가 나쁘고 ratio > 1 이면 원 밖과 상관없이 셈 (위반 ${strongMiss})`);
const unknown = [...used].filter((k) => !STANCE[k]);
ok(unknown.length === 0, `채널이 내는 키 ${used.size}개가 모두 입장 표에 있다${unknown.length ? ' — 없음: ' + unknown : ''}`);
// 입장 표가 실제 문구와 맞는가(한·영): 문구를 바꿔 반대말이 되면 여기서 걸린다
const RX = {
  b: { ko: { '+': /약했|모자랐|당겨/, '-': /셌|세게|살살|날려|밀어/, '=': /딱 좋은 숨|같은 숨|이 숨|숨은 맞았|숨도 맞았/ },
    en: { '+': /soft|pull/i, '-': /hard|gentl|blown away|push/i, '=': /perfect breath|same breath|this breath|breath were right/i } },
  h: { ko: { '+': /너무 아래/, '-': /한두 장 아래/, '=': /같은 자리|이 자리|자리도|자리·숨/ },
    en: { '+': /too low/i, '-': /lower/i, '=': /same spot|this spot|spot and breath/i } },
};
const lie = [];
for (const [key, st] of Object.entries(STANCE)) for (const lang of ['ko', 'en']) {
  const txt = STRINGS[lang][key];
  if (typeof txt !== 'string') { lie.push(`${lang}.${key} 없음`); continue; }
  for (const dim of ['b', 'h']) {
    const hit = Object.entries(RX[dim][lang]).filter(([, re]) => re.test(txt)).map(([s]) => s);
    const want = st[dim] ? [st[dim]] : [];
    if (hit.join() !== want.join()) lie.push(`${lang}.${key} ${dim}: 표 ${want.join() || '-'} / 문구 ${hit.join() || '-'} "${txt}"`);
  }
}
ok(lie.length === 0, `입장 표 = 한·영 문구 (${Object.keys(STANCE).length}키)${lie.length ? '\n    ' + lie.join('\n    ') : ''}`);
// 5) 결과 제목: '아깝다…'는 목표까지 2장 이하로 모자랄 때만(GDD §8.3)
ok(resultTitleKey({ type: 'flip', target: 8 }, { win: false, flipped: 6 }) === 'failed', '8장 목표에 6장 → 아깝다…');
ok(resultTitleKey({ type: 'flip', target: 8 }, { win: false, flipped: 5 }) === 'notYet', '8장 목표에 5장 → 중립 제목');
ok(resultTitleKey({ type: 'flip', target: 8 }, { win: true, flipped: 9 }) === 'clear', '성공 → 클리어');
ok(resultTitleKey({ type: 'flip', target: 2 }, { win: false, flipped: 0 }) === 'notYet' && resultTitleKey({ type: 'flip', target: 2 }, { win: false, flipped: 1 }) === 'failed', '목표 2장 판: 0장 → 중립 제목(2장 모자라도 아깝지 않다) / 1장 → 아깝다…');
ok(resultTitleKey({ type: 'rival' }, { win: false, me: 4, ai: 4 }) === 'failed' && resultTitleKey({ type: 'rival' }, { win: false, me: 3, ai: 4 }) === 'failed', '라이벌: 무승부·1장 차 → 아깝다…(이기려면 1~2장)');
ok(resultTitleKey({ type: 'rival' }, { win: false, me: 2, ai: 5 }) === 'notYet', '라이벌 3장 차 → 중립 제목');
ok(resultTitleKey({ type: 'golden' }, { win: false }) === 'notYet' && resultTitleKey({ type: 'goldenSide' }, { win: false }) === 'notYet', '황금 판 실패 → 중립 제목');
ok(topCause({ luck: 2, weak: 2, high: 1 }) === 'weak' && topCause({ luck: 3, strong: 1 }) === 'luck' && topCause({}) === null && topCause(undefined) === null, '판의 대표 원인(같으면 고칠 수 있는 것 먼저)');
ok(CAUSES.every((c) => STRINGS.ko[causeLabelKey(c)] && STRINGS.en[causeLabelKey(c)]), '원인 줄 문구 6개 한·영');
console.log(fail ? `실패 ${fail}` : '모두 통과');
process.exit(fail ? 1 : 0);
