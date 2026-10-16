// main.js — PUFF! 딱지 목업 v0.1
//
// 🧭 가설 (목업이 검증하려는 것)
//  H1. 재미의 핵심 = "후~ 불어서 퍽! → 우수수 뒤집히며 그림이 드러나는 순간". 이 순간을 슬로모·상승음·글자로 과장한다.
//  H2. 조작 = 딱지 더미를 누르고(조준) → 아래로 당겼다(숨 들이쉬기=파워) → 놓기(퍽!). 설명 없이 앵그리버드 새총처럼.
//  H3. 내 딱지를 걸면 긴장, 상대 딱지(특히 내가 없는 레어)를 따면 수집 욕구가 돈다.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { initPhysics, Table, DISC_R, DISC_H, mulberry32 } from './sim.js';
import { CARDS, CARD_BY_ID, RARITY, drawFace, drawBack, rollCard } from './art.js';
// 딱지의 보이는 몸: 두꺼운 도화지(물리 두께 0.11 그대로, 그림만 절반 · 받침에 닿게 내린 배치 · 착지 휘청) — paper.js
// 얇은 더미는 물리보다 낮게 보인다 → 화면 조준 표시는 paper.visY(물리 → 보이는 높이) / physY(누른 곳 → 물리 h) 를 거친다
import { PaperLook, makeDiscMesh, initDiscTextures, VIS_H, pileY, setBend } from './paper.js';
import { Sfx, AppAudio } from './audio.js';
import { Mic } from './mic.js';
import { mountSoundTest } from './diag.js';
import { t, setLang, getLang, cardName } from './i18n.js';
import * as Store from './store.js';
import { Fx } from './fx.js';
import * as Rules from './rules.js';
import { levelSpec, starsFor, chapterOf, CHAPTERS, RIVALS, CHAPTER_LEN } from './levels.js';
import { SERIES_A, drawCreature } from './creatures.js';
import { drawBlowFace, drawPouchRing } from './face.js';
import * as Cues from './cues.js';
// PvP (P0.5a): 아래 셋은 match.net 가지에서만 쓴다 — 솔로 경로는 이 모듈의 함수를 한 번도 부르지 않는다
import { turnSeeds, hash32 } from './sim.js';
import { ShotRun, TrackPlayer, TrackChunker, BeatClock, encodeState, toB64, fromB64, hashBytes, shotSimV, puppetTable, posePuppet, setPose as setDiscPose, traceToB64, traceFromB64 } from './turn.js';
import { resolveNet, param, makeCode } from './net.js';
import * as Pvp from './pvp.js';
// 고개 쓸기(푸어억) — 솔로 '쓸기 연습판'만 쓴다(docs/design/core-sweep.md §9 4번 줄, 깃발 feel.core). PvP·레벨·일일·AI 대전·봇은 고전 그대로
import * as Sweep from './sweep.js';

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// ── 파워 구간 ─────────────────────────────────────────────
// 재윤님 피드백 1: 정답 숨 세기는 '쌓인 양'에 비례한다 — 많이 쌓이면 크게, 적으면 살짝.
// 게이지 구간은 튜토리얼에서만 보여 주고 이후엔 감으로. 물리로 넘길 때는 이 양에 맞는 숨을 0.95 로 정규화.
const { POWER_MAX, sweetHiFor, sweetLoFor } = Rules; // 화면과 레벨 봇이 같은 규칙을 쓴다 (rules.js)
function liveCount() { return table ? table.liveDiscs().length : 20; }
// 게이지 '단계적 은퇴' (2라운드 리서치: 갑자기 끄면 감이 아니라 의존만 깨진다)
//  0: 1~3번째 숨 — 실시간 게이지(초록/빨강, 더미 양에 따라 초록이 미끄러짐)
//  1: 4~8번째 — 테두리만 + 놓은 직후 0.6초 '정답 스냅샷'(사후 결과 지식)
//  2: 9~15번째 — 게이지 없음. '딱 좋은 숨!'은 매번, 교정 문구는 크게 틀렸을 때만
//  3: 16번째~ — 글자 없음. 소리(칭)와 지난 숨 고스트, 결과만
// 공략 단서 단계(5차): 규칙마다 따로 센다. 0 = 1~3번째, 1 = 4~8, 2 = 9~15, 3 = 16~. 같은 실수 2연속이면 그 규칙만 2숨 동안 0
function cueStage(rule) {
  if (match?.net && rule === 'breath') return 3; // PvP: 숨 단서 단계 3 고정(물결·글자 없음, 기획서 §2.1 형식)
  if ((feel.cues ?? 1) < 0.5) return 3;
  if (feel.guide >= 0.5) return 0;
  const c = profile.cue;
  if (c.relapse[rule] > 0) return 0;
  const k = c[rule] || 0;
  let st = k < 3 ? 0 : k < 8 ? 1 : k < 15 ? 2 : 3;
  if (rule === 'breath' && c.bBig < 3) st = Math.min(st, 1); // 큰 더미(8장↑)를 3번 겪기 전엔 물결을 남긴다
  return st;
}
function guideStage() { return cueStage('breath'); }
function beatOn() { return (feel.beat || 0) >= 1 && !(micEnabled && mic.ready); } // 8차 시험: 콩닥 숨(마이크 모드엔 없음)
function guideOn() { return guideStage() === 0; }
const MAX_TURNS = 18;

// ── 상태 ─────────────────────────────────────────────────
let profile = Store.load();
profile.cue = Object.assign({ breath: 0, bBig: 0, height: 0, side: 0, star: 0, prev: null }, profile.cue || {});
profile.cue.relapse = Object.assign({ breath: 0, height: 0, side: 0 }, profile.cue.relapse || {});
// 손맛 튜닝 값 (홈 ⚙ 패널에서 조절 → 재윤님 피드백 루프용)
// jetLag·airFx·hsCut·airLog = 실험 '바람 도달 시간'(아래 '실험' 절). 슬라이더가 아니라 ⚙ 맨 위 실험 칸의 스위치로 바꾼다(EXP_KEYS). 초기화하면 끔
// core = 조작 깃발 '쓸어 올리기(푸어억)'(0 고전 | 1 쓸기, 기본 0) — 켜도 바뀌는 것은 홈의 '쓸기 연습' 단추뿐(솔로 연습판 전용, 아래 '고개 쓸기 연습판' 절)
// swg = 쓸기 연습판 문법(0 = B '놓고 쓸기' 기본 | 1 = A '누른 채 쓸기(옛)', 비교용 — 2026-10-16 재윤님 실기기 기록으로 B 를 기본으로)
const TUNE_DEFAULTS = { pull: 0.42, wind: 1, slow: 0.3, aiSkill: 1, overShake: 1, guide: 0, strainMs: Rules.STRAIN_MS, cues: 1, fpv: 1, beat: 1, jetLag: 0, airFx: 0, hsCut: 0, airLog: 0, core: 0, swg: 0 };
const EXP_KEYS = new Set(['jetLag', 'airFx', 'hsCut', 'airLog']);
const SWITCH_KEYS = new Set([...EXP_KEYS, 'core', 'swg']); // 슬라이더가 아니라 ⚙ 맨 위 스위치로 바꾸는 값(openTune 슬라이더 목록에서 뺀다 — TUNE_RANGE 에 없음)
const TUNE_RANGE = { pull: [0.25, 0.7, 0.01], wind: [0.6, 1.6, 0.05], slow: [0.12, 1, 0.02], aiSkill: [0.3, 2, 0.05], overShake: [0, 2, 0.1], guide: [0, 1, 1], strainMs: [800, 2400, 50], cues: [0, 1, 1], fpv: [0, 1, 1], beat: [0, 2, 1] };
// 9차: 콩닥 숨 1(차분)을 기본으로(재윤님 '1 차분이 지금보다 괜찮다') — 저장된 튜닝값도 한 번 옮긴다
if ((profile.settings.feelV || 0) < 9) { profile.settings.feel = { ...(profile.settings.feel || {}), beat: 1 }; profile.settings.feelV = 9; Store.save(profile); }
const feel = { ...TUNE_DEFAULTS, ...(profile.settings.feel || {}) };
// ── 실험: 바람 도달 시간 (docs/research/06-own-slowmo.md §8.10·§8.11 · BLOCKERS G12 — 사전 등록 판정 통과, 물리 채택 아님) ──
// 재윤님이 손맛을 보고 게임 물리에 넣을지 정하는 솔로 전용 시험 토글(기본 끔). 지연(끔/켬) × 연출(지금 그대로/공기 앞머리) + 멈칫 줄이기.
//  feel.jetLag 0 | 0.02(화면 s/u): 솔로 blow() 만 table.blow 에 숨 인자로 넘긴다(sim.js armJetLag = simsweep 상수 자세 경로 비트 동일, tools/jetlagcheck.mjs).
//    값은 사전 등록이 고른 0.02 하나만 받는다(저장값·주소 모두 — 그 밖은 0). 판정을 통과한 것은 이 값뿐이다.
//    PvP(ShotRun)·봇·레벨 보정은 언제나 v1 — turn.js 가 jetLag 를 단언으로 막고, 대결 화면에선 expLag() 가 0.
//    마이크 모드도 0(06 §8.10 '마이크는 끔부터, 터치에서 먼저 시험' — 실제 숨이 놓기보다 먼저라 지연이 겹친다).
//    게임 기하(입 거리 2.6 고정)에서는 도달이 늘 물리 약 83 ms = '+9스텝 상수 지연'과 같다. 돌풍 1.2 원 밖 약 +3~4%p(모델 결함, 안 고침).
//  feel.airFx 0 | 1: 공기 앞머리 연출(지연이 켜졌을 때만 뜻이 있다). 놓는 순간(0 ms) 입 쪽 단서(입술·볼·'푸'·가벼운 진동)와 물리·와류 고리가 함께 출발,
//    더미 쪽 단서(충격파·반짝이·번쩍·흔들림·강한 진동·'퍽')·카메라 물러남·슬로모는 물리 도달 스텝에. 히트스톱(멈칫)도 놓을 때가 아니라 도달(충돌 멈칫)에.
//    0 이면 지금 연출 그대로(지연만 켜면 '지금 연출 + 지연'을 비교할 수 있게).
//  feel.hsCut 0 | 1: 멈칫 줄이기(공기 앞머리 연출에서만). 충돌 멈칫 = max(0, 멈칫 − 공기 이동 벽시계) → 놓기~움직임이 지금과 비슷해진다(06 §8.10 '이동 시간만큼 줄이기')
//  feel.airLog 0 | 1: 마지막 내 숨의 '놓기 → 보이는 첫 움직임' 벽시계 ms 를 화면 위에 표시(재윤님이 수치를 인용할 수 있게)
//  브라우저: 주소 ?jetlag=0.02&airfx=1&hscut=1&airlog=1 (이번 실행에만. ⚙ 완료를 누르면 저장). ?jetlag 만 쓰면 0.02
const JET_LAG_TEST = 0.02; // 사전 등록이 고른 값(tools/coresweep/data/react3/choice3.json) — 받는 값은 이것과 0 뿐
const expBit = (v) => (+v >= 0.5 ? 1 : 0);
function expSanitize() { // 저장값·주소·옛 빌드 값이 무엇이든 숨을 막지 않게: jetLag ∈ {0, 0.02}, 스위치 ∈ {0, 1}
  feel.jetLag = +feel.jetLag === JET_LAG_TEST ? JET_LAG_TEST : 0;
  for (const k of ['airFx', 'hsCut', 'airLog']) feel[k] = expBit(feel[k]);
  feel.core = expBit(feel.core); // 조작 깃발도 0/1 만
  feel.swg = expBit(feel.swg); // 쓸기 문법도 0(B)/1(A) 만
}
{
  const jl = param('jetlag');
  if (jl != null) { if (jl === '' || +jl === JET_LAG_TEST) feel.jetLag = JET_LAG_TEST; else if (+jl === 0) feel.jetLag = 0; else console.warn('[실험] jetlag 값 무시(0 · 0.02 만 받음):', jl); }
  for (const [q, k] of [['airfx', 'airFx'], ['hscut', 'hsCut'], ['airlog', 'airLog']]) { const v = param(q); if (v != null) feel[k] = v === '' ? 1 : expBit(v); }
  // 조작 깃발: ?core=sweep|classic · #core=sweep (이번 실행에만, ⚙ 완료를 누르면 저장 — jetLag 와 같은 규칙)
  const cr = param('core');
  if (cr === 'sweep') feel.core = 1; else if (cr === 'classic') feel.core = 0; else if (cr != null) console.warn('[쓸기] core 값 무시(sweep · classic 만 받음):', cr);
  // 쓸기 문법: ?swg=b(놓고 쓸기, 기본) | a(누른 채 쓸기, 옛) — 이번 실행에만(⚙ 완료를 누르면 저장)
  const sg = param('swg');
  if (sg === 'b') feel.swg = 0; else if (sg === 'a') feel.swg = 1; else if (sg != null) console.warn('[쓸기] swg 값 무시(a · b 만 받음):', sg);
  expSanitize();
}
// 9차 물안경(재윤님: '초록 가이드는 아이템을 쓰면 보이게'): 이번 숨에 초록 구간이 보이는 아이템. 평생 첫 3숨은 무료(튜토리얼)
profile.items = Object.assign({ goggles: 3 }, profile.items || {});
let gogglesOn = false;
const GOGGLE_FREE_PUFFS = 3, GOGGLE_MAX = 9;
// 체험(할머니가 빌려준 물안경): 레벨이면 L1~2, 자유 대전이면 평생 첫 3숨 (아이템·PvP 기획서 1.5)
function goggleTrial() { return match?.net ? false : match?.level ? match.level.n <= 2 : (profile.tutorialPuffs || 0) < GOGGLE_FREE_PUFFS; }
// PvP: 물안경은 아이템전(P0.6, 기본 끔)에서만 → 지금은 늘 꺼짐. 접근성 '가이드 항상 보기'도 대결에선 안 켜진다
function gogglesActive() { return match?.net ? false : gogglesOn || goggleTrial() || feel.guide >= 0.5; }
// 9차 입술 높이: 'eye' 눈높이(지금 입) | 'low' 책상에 턱. 판마다 눈높이로 시작, 저장 안 함
let pose = 'eye', poseK = 0;
const POSE_UNLOCK_PUFFS = 9;
if (profile.settings.lang) setLang(profile.settings.lang);
else setLang(getLang());
const sfx = new Sfx();
sfx.muted = !profile.settings.sound;
// 앱(iOS): 무음 모드에서도 소리(기본 켬 = 'playback', 다른 앱 음악은 멈춤 — 재윤님 결정 대기). ⚙ 소리·진동 시험에서 끌 수 있다
// (끄면 'auto' = 무음 스위치를 따르고 음악과 섞임). 게임 소리를 꺼 두면 늘 'auto'. 웹은 영향 없음
AppAudio.silentPlay = profile.settings.silentPlay !== false;
AppAudio.apply();
const mic = new Mic();
let micEnabled = false;
const MIC_BLOW_LV = 0.12; // 마이크 세기(0~1.25)가 이만큼 120ms 이상이면 '불기 시작' (볼이 눈에 띄게 차오르는 정도)

let renderer, scene, camera, fx;
let table = null; // 물리 테이블 (매치 중)
const meshes = new Map(); // disc.id → mesh
const paper = new PaperLook(); // 종이 그림(얇은 몸·휨·착지 휘청). 물리는 읽기만
let homeMeshes = [];
let state = 'boot';
let simOn = false;
let timeScale = 1;
let slowUntil = 0;
let hitStopUntil = 0;
let shake = 0;
let camZoom = 0;
// 조준 시점(4차): 내 차례에 조준하는 동안 카메라를 낮춰 더미 옆면을 크게 — 위에서 내려다보면 10장 옆면이 42px 뿐이라 상하 조준이 거칠었다
let camAim = 0, camAimGoal = 0;
// 9차(재윤님: '딱지 오른쪽을 노리면 몸과 앵글이 그쪽으로 가서 가운데를 맞춰야'): 누른 뒤 1인칭 몸이 옆걸음 → 표적이 입술 바로 앞 가운데.
// 회전이 아니라 평행 이동: 바람은 지금처럼 진행 방향과 평행(물리 그대로) — 돌면 정면으로 맞아 '옆을 불면 반대쪽으로 굴러감'(4차)·★칸 판이 사라진다
let camStrafe = 0, camStrafeGoal = 0;
const reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const camStrafeSide = new THREE.Vector3(1, 0, 0);
const camAimPos = new THREE.Vector3(), camAimTarget = new THREE.Vector3();
let acc = 0;
let lastT = performance.now();
const tweens = [];
let stakeN = 10;
// 'fun' = 친선(끝나면 돌려받음, 기본) / 'keeps' = 따먹기(딴 만큼 내 것). 원칙(GDD §7.2·§9.9 P0-5): 따먹기는 기본 끔.
// 자유 대전 시트에서 직접 고른 값만 profile.settings.mode 에 저장해 다음에도 유지한다(저장값 없음 = 새 설치·예전 판 → 친선)
let mode = profile.settings.mode === 'keeps' ? 'keeps' : 'fun';
let match = null;
let runId = 0; // 매치 세대 번호: 중간에 홈으로 나가면 이전 매치의 비동기 흐름·입력을 끊는다
let cancelInput = null;
let aimCtl = null; // 플레이어 조준 컨트롤러
const piles = { me: [], ai: [] };

// ── 텍스처 ──────────────────────────────────────────────
// 3D 딱지 텍스처·재질·기하는 paper.js(두꺼운 도화지). 여기는 UI 그림(카드 이미지)만
const imgCache = new Map();

function faceImage(id, size = 160) {
  const key = id + ':' + size;
  if (imgCache.has(key)) return imgCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  drawFace(cv.getContext('2d'), size * 2, CARD_BY_ID[id]);
  const url = cv.toDataURL('image/png');
  imgCache.set(key, url);
  return url;
}

// ── 장면 ────────────────────────────────────────────────
function woodTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 1024;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 0);
  grd.addColorStop(0, '#c98b4f'); grd.addColorStop(0.5, '#d89a5a'); grd.addColorStop(1, '#c4844a');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  // 나뭇결
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * 1024;
    g.strokeStyle = `rgba(${90 + Math.random() * 40},${50 + Math.random() * 20},20,${0.06 + Math.random() * 0.1})`;
    g.lineWidth = 1 + Math.random() * 4;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6 + (Math.random() - 0.5) * 3);
    g.stroke();
  }
  // 판자 이음새
  g.fillStyle = 'rgba(60,30,10,0.35)';
  for (const y of [256, 512, 768]) g.fillRect(0, y - 2, 1024, 4);
  // 90년대 책상 낙서
  g.save();
  g.translate(760, 860); g.rotate(-0.12);
  g.font = '48px "Black Han Sans", sans-serif'; g.fillStyle = 'rgba(40,30,60,0.28)';
  g.fillText('딱지왕', 0, 0);
  g.restore();
  g.save(); g.translate(150, 140); g.rotate(0.2); g.strokeStyle = 'rgba(200,40,60,0.25)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 20); g.bezierCurveTo(-30, -10, 0, -30, 20, -5); g.bezierCurveTo(40, -30, 70, -10, 40, 20); g.lineTo(20, 45); g.closePath(); g.stroke(); g.restore();
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}

function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#5fc8ff'); grd.addColorStop(0.55, '#bfe9ff'); grd.addColorStop(1, '#ffe7b8');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

// 배경: 90년대 교실 벽 + 칠판 (빈 하늘을 채우고 '문방구·교실' 향수를 준다)
function classroomBackdrop() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 768;
  const g = cv.getContext('2d');
  // 벽
  const wall = g.createLinearGradient(0, 0, 0, 768);
  wall.addColorStop(0, '#f6e7c4'); wall.addColorStop(1, '#e9cf9c');
  g.fillStyle = wall; g.fillRect(0, 0, 2048, 768);
  // 걸레받이(나무 패널)
  g.fillStyle = '#b07a46'; g.fillRect(0, 600, 2048, 168);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 2048; x += 128) g.fillRect(x, 600, 4, 168);
  // 창문 (양옆, 파란 하늘)
  for (const x0 of [60, 1668]) {
    g.fillStyle = '#ffffff'; g.fillRect(x0 - 12, 88, 344, 384);
    const sky = g.createLinearGradient(0, 100, 0, 460); sky.addColorStop(0, '#5fc8ff'); sky.addColorStop(1, '#c8efff');
    g.fillStyle = sky; g.fillRect(x0, 100, 320, 360);
    g.fillStyle = '#ffffff'; g.fillRect(x0 + 156, 100, 8, 360); g.fillRect(x0, 276, 320, 8);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(x0 + 80, 170, 26, 0, 6.3); g.arc(x0 + 110, 160, 32, 0, 6.3); g.arc(x0 + 140, 172, 24, 0, 6.3); g.fill();
  }
  // 칠판
  g.fillStyle = '#8a5a2f'; g.fillRect(500, 70, 1048, 470);
  const board = g.createLinearGradient(0, 90, 0, 520); board.addColorStop(0, '#2f6b4f'); board.addColorStop(1, '#245640');
  g.fillStyle = board; g.fillRect(520, 90, 1008, 430);
  g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 40; i++) g.fillRect(520 + Math.random() * 1000, 90 + Math.random() * 420, 120 + Math.random() * 200, 6);
  g.fillStyle = 'rgba(255,255,255,0.88)';
  g.font = '92px "Black Han Sans", "Lilita One", sans-serif'; g.textAlign = 'center';
  g.fillText('딱지 대장전!', 1024, 230);
  g.font = '64px "Lilita One", sans-serif';
  g.fillText('PUFF!  Blow · Flip · Keep', 1024, 330);
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6;
  for (const [cx, cy] of [[640, 440], [1400, 440]]) { g.beginPath(); g.arc(cx, cy, 44, 0, 6.3); g.stroke(); g.beginPath(); g.moveTo(cx - 20, cy); g.lineTo(cx + 20, cy); g.stroke(); }
  g.font = '40px "Jua", sans-serif'; g.fillText('오늘의 당번: 민수 · 지우', 1024, 470);
  g.fillStyle = '#c9a77a'; g.fillRect(500, 540, 1048, 22);
  g.fillStyle = '#ffffff'; g.fillRect(620, 528, 60, 14); g.fillStyle = '#ffd34d'; g.fillRect(700, 528, 50, 14);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(36, 13.5), new THREE.MeshBasicMaterial({ map: tx }));
  m.position.set(0, 3.4, -11.5);
  return m;
}

function buildScene() {
  const canvas = $('#c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // 자동 시험(tools/sweepplay.mjs): ?norender = 3D 그리기만 끔(장면·카메라 행렬은 갱신 → 화면 좌표·투영 계산은 그대로). 헤드리스 소프트웨어 렌더는 프레임당 약 1초라 가짜 시계 시험이 안 끝난다
  //   window.__renderOnce = true → 다음 프레임 한 번만 진짜로 그림(화면 캡처용)
  if (param('norender') != null) { const r0 = renderer.render.bind(renderer); renderer.render = (s, c) => { if (window.__renderOnce) { window.__renderOnce = false; return r0(s, c); } s.updateMatrixWorld(); c.updateMatrixWorld(); }; }
  // 품질 프리셋: 터치(폰) 기기는 픽셀 배율·그림자 해상도를 낮춰 발열/프레임 저하를 줄인다
  const mobile = window.matchMedia?.('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(mobile ? 1.75 : 2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Neutral 톤매핑(r162+): ACES 보다 채도를 지켜 클래시/로얄킹덤식 쨍한 색에 가깝다 (아트 리서치)
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = skyTexture();
  // 환경 반사: 홀로/코팅 딱지 광택용 (아트 리서치)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x7a5434, 1.15));
  const sun = new THREE.DirectionalLight(0xffe6c0, 2.4);
  sun.position.set(5, 11, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(window.matchMedia?.('(pointer: coarse)').matches ? 1024 : 2048, window.matchMedia?.('(pointer: coarse)').matches ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.7);
  rim.position.set(-6, 5, -8);
  scene.add(rim);

  // 책상
  const wood = woodTexture();
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(22, 1, 16),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.65 }),
  );
  desk.position.y = -0.5;
  desk.receiveShadow = true;
  scene.add(desk);
  buildChalkCircle();
  // 책상 모서리 띠 (클래시식 두툼한 테두리)
  const trim = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.5, 16.6), new THREE.MeshStandardMaterial({ color: 0x8a5a2f, roughness: 0.6 }));
  trim.position.y = -1.0;
  scene.add(trim);

  scene.add(classroomBackdrop());

  fx = new Fx(scene, camera, $('#fxl'));
  initDiscTextures();
  buildAimGizmo();
  layout();
}

let camBase = new THREE.Vector3(0, 7.2, 10.5);
let camTarget = new THREE.Vector3(0, 0.9, 0);
let pileX = 4.2;
// 판 시작 때 카메라를 즉시 제자리에 (홈 회전 카메라에서 천천히 끌려오며 첫 프레임이 엉뚱해지는 것 방지)
function snapCam() {
  camera.position.copy(camBase);
  camera.lookAt(camTarget);
}

function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const portrait = w / h < 0.85;
  // 세로: 더미를 화면 아래 1/3 쪽에(폰 마이크가 아래에 있어 '부는 방향'과 일치 — 리서치), 상대는 위쪽
  camera.fov = portrait ? 50 : 36;
  camBase.set(0, portrait ? 6.6 : 4.4, portrait ? 8.6 : 6.9);
  camTarget.set(0, portrait ? 0.4 : 0.9, portrait ? -2.4 : -0.8);
  // 낮고 가까이: 더미 옆면이 약 2배(10장 82→169px, 폭 164→266px, three.js 투영 계산)
  camAimPos.set(0, portrait ? 2.4 : 2.0, portrait ? 6.2 : 5.6);
  camAimTarget.set(0, 0, portrait ? -0.8 : -0.3); // y 는 더미 높이의 절반으로 frame 에서 채움
  pileX = portrait ? 2.5 : 4.4;
  camera.updateProjectionMatrix();
  const bc = $('#breath');
  const dpr = Math.min(window.matchMedia?.('(pointer: coarse)').matches ? 1.75 : 2, window.devicePixelRatio || 1); // 오버레이 해상도 상한(모바일 래스터 비용)
  bc.width = Math.round(w * dpr); bc.height = Math.round(h * dpr); bc._dpr = dpr;
}

// ── 분필 원 (재윤님 3차: 너무 세게 불면 손해인 이유를 '눈에 보이는 규칙'으로) ─────────────
// 골목 딱지치기의 분필 원: 원 밖으로 날아간 딱지는 그림이 보여도 무효 → 다시 쌓는다.
let chalk = null;
function buildChalkCircle() {
  const R = table?.T?.circleR ?? 3.2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(77);
  ctx.translate(256, 256);
  const rr = 256 * (R / (R + 0.5));
  ctx.lineCap = 'round';
  // 손으로 두 번 그은 듯한 분필 선 (살짝 어긋난 두 바퀴 + 가루)
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = `rgba(255,255,250,${pass ? 0.55 : 0.8})`;
    ctx.lineWidth = pass ? 7 : 10;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2 + pass * 0.3;
      const r = rr + Math.sin(a * 3 + pass) * 3 + (rng() - 0.5) * 2.5;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { const a = rng() * Math.PI * 2, r = rr + (rng() - 0.5) * 14; ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,255,250,0.35)';
  for (let i = 0; i < 260; i++) { const a = rng() * Math.PI * 2, r = rr + (rng() - 0.5) * 30; ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2); }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  const size = (R + 0.5) * 2;
  chalk = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, opacity: 0.85 }));
  chalk.rotation.x = -Math.PI / 2;
  chalk.position.y = 0.004;
  chalk.renderOrder = 1;
  scene.add(chalk);
}
// ★칸 (황금 딱지 옆으로 넘기기, 5차): 분필 원 안 왼/오른쪽 반달(옆으로 0.6 이상)을 금색 분필 빗금으로.
// 좌우는 플레이어 화면 기준 = 바람 방향 D 의 오른쪽 side=(−D.z, D.x). 카메라가 +z 에서 보므로 화면 오른쪽 = 세계 +x
let pocket = null;
const POCKET_MIN = 0.6;
function pocketSide() {
  const toCam = new THREE.Vector3(camBase.x, 0, camBase.z).normalize();
  return new THREE.Vector3(toCam.z, 0, -toCam.x); // D = −toCam → side = (−D.z, D.x)
}
function buildPocket(which) {
  clearPocket();
  const R = table?.T?.circleR ?? 3.2;
  const sign = which === 'left' ? -1 : 1;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  const sc = 256 / (R + 0.5);
  ctx.translate(256, 256);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R * sc - 6, 0, Math.PI * 2); ctx.clip();
  ctx.beginPath(); ctx.rect(sign > 0 ? POCKET_MIN * sc : -256, -256, 256 - POCKET_MIN * sc, 512); ctx.clip();
  ctx.fillStyle = 'rgba(255,207,51,0.22)'; ctx.fillRect(-256, -256, 512, 512);
  ctx.strokeStyle = 'rgba(255,214,90,0.75)'; ctx.lineWidth = 5;
  for (let i = -20; i < 20; i++) { ctx.beginPath(); ctx.moveTo(i * 26 - 300, -300); ctx.lineTo(i * 26 + 300, 300); ctx.stroke(); }
  ctx.restore();
  // 경계선 + 별 + 화살표
  ctx.strokeStyle = 'rgba(255,214,90,0.95)'; ctx.lineWidth = 8; ctx.setLineDash([16, 10]);
  const xb = sign * POCKET_MIN * sc, yb = Math.sqrt(Math.max(0, (R * sc) ** 2 - xb * xb)) - 6;
  ctx.beginPath(); ctx.moveTo(xb, -yb); ctx.lineTo(xb, yb); ctx.stroke(); ctx.setLineDash([]);
  const cx = sign * (POCKET_MIN + (R - POCKET_MIN) * 0.5) * sc;
  ctx.fillStyle = '#ffcf33'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 6;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 22 : 52; ctx.lineTo(cx + Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,214,90,0.95)';
  ctx.beginPath(); ctx.moveTo(sign * 18, 0); ctx.lineTo(sign * -6, -22); ctx.lineTo(sign * -6, 22); ctx.closePath(); ctx.fill(); // 가운데에서 칸 쪽을 가리키는 작은 화살표
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  const size = (R + 0.5) * 2;
  pocket = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }));
  pocket.rotation.x = -Math.PI / 2;
  // 캔버스 +x 가 '칸 쪽 side' 가 되도록 세로축 회전 (side 가 세계 +x 면 회전 0)
  const sv = pocketSide();
  pocket.rotation.z = Math.atan2(-sv.z, sv.x);
  pocket.position.y = 0.006;
  pocket.renderOrder = 1;
  pocket.userData = { sign, side: sv };
  scene.add(pocket);
}
// 조준 시점에서는 ★칸이 화면 밖일 수 있다 → 화면 가장자리에 ★칸 쪽을 가리키는 화살표(칸이 보이면 그 위에 ★)
function drawPocketHint(now) {
  if (!pocket || state !== 'match') return;
  const cv = $('#breath'), ctx = cv.getContext('2d'), dpr = cv._dpr || 1;
  const sv = pocket.userData.side, sg = pocket.userData.sign, R = table?.T?.circleR ?? 3.2;
  const w = new THREE.Vector3(sv.x * sg * (POCKET_MIN + (R - POCKET_MIN) * 0.5), 0.05, sv.z * sg * (POCKET_MIN + (R - POCKET_MIN) * 0.5));
  const v = w.project(camera);
  const W = cv.width / dpr, H = cv.height / dpr;
  let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
  const off = x < 24 || x > W - 24 || y < 80 || y > H - 40 || v.z > 1;
  const m = 30;
  if (off) { x = Math.min(W - m, Math.max(m, x)); y = Math.min(H * 0.62, Math.max(H * 0.3, y)); }
  const pulse = 0.75 + 0.25 * Math.sin(now * 0.008);
  ctx.save(); ctx.scale(dpr, dpr); ctx.translate(x, y);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffcf33'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 7 : 16) * pulse; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (off) {
    const dir = x > W / 2 ? 1 : -1; // 화면 밖 쪽을 가리키는 삼각형
    ctx.beginPath(); ctx.moveTo(dir * 30, 0); ctx.lineTo(dir * 20, -9); ctx.lineTo(dir * 20, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function clearPocket() { if (pocket) { scene.remove(pocket); pocket.geometry.dispose(); pocket.material.map.dispose(); pocket.material.dispose(); pocket = null; } }
function inPocket(d) {
  if (!pocket || !table.inCircle(d)) return false;
  const p = d.body.translation(), sv = pocket.userData.side;
  return pocket.userData.sign * (p.x * sv.x + p.z * sv.z) >= POCKET_MIN;
}
function pocketPulse(good) {
  if (!pocket) return;
  addTween(0.9, (k) => { const a = Math.sin(Math.PI * k); pocket.material.color.setRGB(1, good ? 1 : 1 - 0.5 * a, good ? 1 - 0.3 * a : 1 - 0.5 * a); pocket.scale.setScalar(1 + 0.03 * a); }, () => { pocket && pocket.material.color.setRGB(1, 1, 1); pocket && pocket.scale.setScalar(1); });
}

// 원 밖으로 날아간 딱지가 있을 때: 분필 원이 번쩍 (규칙을 가리킨다)
function chalkPulse() {
  if (!chalk) return;
  addTween(0.8, (k) => { chalk.material.color.setRGB(1, 1 - 0.55 * Math.sin(Math.PI * k), 1 - 0.55 * Math.sin(Math.PI * k)); chalk.material.opacity = 0.85 + 0.15 * Math.sin(Math.PI * k); }, () => { chalk.material.color.setRGB(1, 1, 1); chalk.material.opacity = 0.85; });
}

// ── 조준 기즈모 ──────────────────────────────────────────
let reticle, layerRing, aimLine, ghostRing;
function buildAimGizmo() {
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }),
  );
  reticle.renderOrder = 10;
  reticle.visible = false;
  scene.add(reticle);
  ghostRing = new THREE.Mesh(
    new THREE.RingGeometry(0.17, 0.22, 32),
    new THREE.MeshBasicMaterial({ color: 0x2a1a12, transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide }),
  );
  ghostRing.renderOrder = 9;
  ghostRing.visible = false;
  scene.add(ghostRing);
  // 틈 줄: 조준 높이에 더미를 감는 가는 흰 줄(내 입력을 비추는 자). 옆을 누르면 기운다(누른 쪽이 들림)
  layerRing = new THREE.Mesh(
    new THREE.TorusGeometry(DISC_R * 1.012, 0.018, 6, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }),
  );
  layerRing.rotation.x = Math.PI / 2;
  layerRing.renderOrder = 9;
  layerRing.visible = false;
  scene.add(layerRing);
  buildCueMeshes();
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  aimLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9, depthTest: false }));
  aimLine.renderOrder = 9;
  aimLine.visible = false;
  scene.add(aimLine);
}

// ── 쏜 뒤: 스냅샷 → 더미 영수증 · 황금 굴러간 길 (5차, 실제 결과만 그린다) ──────────
function pocketLatSign(g) {
  if (!pocket) return 0;
  const sv = pocket.userData.side;
  return Math.sign(pocket.userData.sign * (sv.x * g.side.x + sv.z * g.side.z)) || 0;
}
function takeCueSnap(raw, shot, g) {
  const live = table.liveDiscs();
  const order = live.map((d) => ({ id: d.id, y: d.body.translation().y, golden: d.cardId === 'golden' })).sort((a, b) => b.y - a.y);
  const n = live.length, type = match?.level?.type || 'flip';
  const k = Cues.lidCount(order.map((o) => o.y), shot.h, DISC_H);
  const win = Cues.idealWindow(n, type);
  cue.snap = { order, n, k, win, type, ratio: shot.ratio ?? 1, lat: raw.lat || 0, f: Cues.tideFill(raw.power, n), stH: cueStage('height'), stB: cueStage('breath'), pls: pocketLatSign(g), pose: raw.pose || 'eye' };
  // 카운터는 스냅샷 뒤에 올린다 (이번 영수증은 '쏘기 전 단계'로 그림)
  const c = profile.cue;
  c.breath++; if (n >= 8) c.bBig++;
  if (win) c.height++;
  if (Math.abs(raw.lat || 0) > 0.3 || type === 'goldenSide') c.side++;
  if (type === 'goldenSide') c.star++;
  for (const r of Object.keys(c.relapse)) c.relapse[r] = Math.max(0, c.relapse[r] - 1);
  Store.save(profile);
  trailStart(type === 'goldenSide' ? live.find((d) => d.cardId === 'golden') : null);
}
function makeReceipt(flipped, outs) {
  const sn = cue.snap;
  if (!sn) return;
  const fl = new Set(flipped.map((d) => d.id)), ou = new Set(outs.map((d) => d.id));
  const g = table.liveDiscs().find((d) => d.cardId === 'golden');
  const pocketOk = sn.type === 'goldenSide' && !!g && fl.has(g.id) && inPocket(g);
  // 이 숨으로 판 목표를 채웠나(장수 판: 누적 + 이번 ≥ 목표 / 황금 판: 황금을 뒤집음). 채웠으면 '좋은 결과' → 지적하지 않는다(match.flipped 는 react 뒤에 오른다)
  const lv = match?.solo ? match.level : null;
  const goalHit = !!lv && (lv.type === 'flip' ? (match.flipped || 0) + flipped.length >= lv.target : lv.type === 'golden' ? !!g && fl.has(g.id) : false);
  // 숨 원인 코드는 여기서 한 번만(cues.js shotCause). 숨 글자·큰 글자(react)·이 카드·결과 제목이 모두 sn.verdict 로 문구를 고른다
  const o = { n: sn.n, k: sn.k, ratio: sn.ratio, lat: sn.lat, flips: flipped.length, outs: outs.length, type: sn.type, pocketLatSign: sn.pls, pocketOk, goalHit, pose: sn.pose };
  const v = Cues.shotVerdict(o);
  sn.verdict = v;
  if (match && v.cause) { match.causeCount = match.causeCount || {}; match.causeCount[v.cause] = (match.causeCount[v.cause] || 0) + 1; }
  const kind = Cues.causeFamily(v.cause);
  const c = profile.cue;
  if (kind && kind === c.prev) { c.relapse[kind] = 2; c.prev = null; } else c.prev = kind;
  Store.save(profile);
  // 영수증은 높이·숨 단계가 낮을 때, 또는 꽝·원 밖 2장↑일 때, 또는 규칙이 다시 켜졌을 때만
  const show = sn.stH <= 1 || sn.stB <= 1 || flipped.length === 0 || outs.length >= 2 || (kind && c.relapse[kind] > 0);
  let tip = null;
  if (show) { // 한 줄 조언은 카드를 만들 때 한 번만 고른다(매 프레임 고르면 '입을 책상까지' 횟수가 프레임마다 올라 3프레임 뒤 문구가 바뀌었다)
    const useLowOk = v.cause === 'low' && sn.pose !== 'low' && poseUnlocked() && sn.n >= 8 && (profile.settings.useLowTips || 0) < 3;
    tip = Cues.receiptKey(v, { ...o, useLowOk });
    if (tip === 'rcpUseLow') { profile.settings.useLowTips = (profile.settings.useLowTips || 0) + 1; Store.save(profile); }
  }
  cue.receipt = show ? { ...sn, fl, ou, kind, cause: v.cause, tip, t0: performance.now() } : null;
  window.__puffReceipt = cue.receipt ? { kind, cause: v.cause, tip, flips: flipped.length, outs: outs.length, k: sn.k } : null; // 테스트용
  window.__puffVerdict = { cause: v.cause, goalHit, ratio: sn.ratio, n: sn.n, flips: flipped.length, outs: outs.length }; // 테스트용(카드가 안 떠도)
  trailEnd(pocketOk);
}
// 더미 영수증 '방금 숨' (6차: 재윤님 "빨간 막대가 무슨 뜻인지 모르겠다 — 내가 불었다는 건가?" → 더 친절하게)
// 쏘기 전 더미를 딱지 모양으로 그리고 범례(내 것·원 밖 무효·그대로) + '여기 불었음' 바람 화살표 + 숨 컵('딱 좋음' 눈금) + 한 줄 조언(R.tip = cues.js receiptKey)
function drawReceipt(now) {
  const R = cue.receipt;
  if (!R || state !== 'match') return;
  const DUR = 5.5;
  if (myTurn.on && myTurn.pressed) { cue.receipt = null; return; } // 다음 숨을 누르면 닫힘
  const t1 = (now - R.t0) / 1000;
  if (t1 > DUR) { cue.receipt = null; return; }
  const a = t1 < 0.2 ? t1 / 0.2 : t1 > DUR - 0.4 ? Math.max(0, (DUR - t1) / 0.4) : 1;
  const cv = $('#breath'), ctx = cv.getContext('2d'), dpr = cv._dpr || 1;
  const H = cv.height / dpr, W = cv.width / dpr;
  const cardW = Math.min(W - 16, 196), x0 = 8, y0 = Math.max(92, H * 0.11); // 점수 줄 바로 아래(1인칭 더미를 가리지 않게)
  const rows = R.order.length, rh = clamp(Math.min(150, H - y0 - 128) / rows, 3, 13), dw = 46; // 가로 화면·큰 판돈이면 줄을 얇게
  const stackH = rows * rh;
  const cardH = 30 + stackH + 30 + 44 + 16;
  const bump = (k) => (R.kind === k ? 1 + 0.12 * Math.abs(Math.sin(Math.min(t1, 0.9) * Math.PI * 2 / 0.45)) : 1);
  ctx.save(); ctx.scale(dpr, dpr); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(255,248,236,0.96)'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, cardW, cardH, 12) : ctx.rect(x0, y0, cardW, cardH); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1a12'; ctx.font = '700 14px "Jua", sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(t('rcpTitle'), x0 + 10, y0 + 14);
  // 더미 단면: 딱지 모양(둥근 막대). 파랑 = 내 것(넘김), 빨강 = 원 밖(무효), 회색 = 그대로
  const sx0 = x0 + 34, sy0 = y0 + 28;
  R.order.forEach((o, i) => {
    const y = sy0 + i * rh;
    const col = R.fl.has(o.id) ? '#3a8fe0' : R.ou.has(o.id) ? '#ff4d5e' : '#c9b8a6';
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(42,26,18,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx0, y + 0.5, dw, rh - 1.5, (rh - 1.5) / 2) : ctx.rect(sx0, y + 0.5, dw, rh - 1.5); ctx.fill(); ctx.stroke();
    if (o.golden) { ctx.strokeStyle = '#ffb800'; ctx.lineWidth = 2.5; ctx.stroke(); }
    if (rh >= 9) { ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.min(10, rh - 2)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(R.fl.has(o.id) ? '✓' : R.ou.has(o.id) ? '✗' : '', sx0 + dw / 2, y + rh / 2); ctx.textAlign = 'left'; }
  });
  // 금 괄호: 노리기 좋은 자리(위에서 2~4장째) — 높이 단계 ≤ 1
  if (R.win && R.stH <= 1) {
    const ya = sy0 + (R.win[0] - 1) * rh, yb = sy0 + R.win[1] * rh - 1.5;
    ctx.strokeStyle = '#ffb800'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx0 + dw + 4, ya); ctx.lineTo(sx0 + dw + 8, ya); ctx.lineTo(sx0 + dw + 8, yb); ctx.lineTo(sx0 + dw + 4, yb); ctx.stroke();
  }
  // 바람 화살표 → 내가 분 층 ("여기 불었음")
  const ky = sy0 + (R.k - 0.5) * rh;
  ctx.save(); ctx.translate(sx0 - 4, ky); ctx.scale(bump('height'), bump('height'));
  ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-4, 0); ctx.moveTo(-10, -5); ctx.lineTo(-4, 0); ctx.lineTo(-10, 5); ctx.stroke();
  ctx.strokeStyle = 'rgba(42,26,18,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-24, -6); ctx.lineTo(-14, -6); ctx.moveTo(-24, 6); ctx.lineTo(-14, 6); ctx.stroke();
  ctx.restore();
  // ('내가 분 곳' 글씨는 아래 범례 줄에)
  // 숨 컵: 이번 숨이 채운 만큼. '딱 좋음' 눈금 = 꼭대기(정답의 0.9배)
  const cx = sx0 + dw + 30, cw = 22, cy0 = sy0, ch = stackH;
  ctx.save(); ctx.translate(cx + cw / 2, cy0 + ch / 2); ctx.scale(bump('breath'), bump('breath')); ctx.translate(-(cx + cw / 2), -(cy0 + ch / 2));
  const ff = Math.min(1.25, R.f);
  ctx.fillStyle = R.ratio < Rules.GREEN_LO ? '#ffe28a' : R.ratio <= 1 ? '#59e39a' : '#ff8a8a';
  ctx.fillRect(cx + 2, cy0 + ch * (1 - Math.min(1, ff)), cw - 4, ch * Math.min(1, ff));
  if (R.f > 1) { ctx.beginPath(); ctx.ellipse(cx + cw / 2, cy0, cw / 2 - 1, 7, 0, Math.PI, 0); ctx.fill(); }
  if (R.ratio > 1) { ctx.fillStyle = '#ff4d5e'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + 4 + i * 7, cy0 - 10 - (i % 2) * 5, 2.6, 0, Math.PI * 2); ctx.fill(); } }
  ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2; ctx.strokeRect(cx, cy0, cw, ch);
  ctx.strokeStyle = '#ffb800'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 4, cy0); ctx.lineTo(cx + cw + 4, cy0); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#2a1a12'; ctx.font = '700 10px "Jua", sans-serif';
  ctx.fillText(t('rcpBreath'), cx - 1, cy0 + ch + 10);
  ctx.fillStyle = '#8a5a00'; ctx.font = '700 11px "Jua", sans-serif'; ctx.fillText(t('rcpBrim'), cx + cw + 6, cy0 + 3);
  // 범례
  const ly = sy0 + stackH + 22;
  const chip = (x, col, txt) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, ly - 6, 14, 12, 6) : ctx.rect(x, ly - 6, 14, 12); ctx.fill(); ctx.fillStyle = '#2a1a12'; ctx.font = '700 11px "Jua", sans-serif'; ctx.fillText(txt, x + 17, ly); return x + 17 + ctx.measureText(txt).width + 8; };
  let lx = x0 + 10;
  lx = chip(lx, '#3a8fe0', t('rcpMine')); lx = chip(lx, '#ff4d5e', t('rcpOut')); chip(lx, '#c9b8a6', t('rcpStay'));
  // 둘째 범례 줄: → 내가 분 곳 / [ 노릴 곳
  const ly2 = ly + 16; let mx2 = x0 + 10;
  ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(mx2, ly2); ctx.lineTo(mx2 + 12, ly2); ctx.moveTo(mx2 + 8, ly2 - 3); ctx.lineTo(mx2 + 12, ly2); ctx.lineTo(mx2 + 8, ly2 + 3); ctx.stroke();
  ctx.fillStyle = '#2a1a12'; ctx.font = '700 11px "Jua", sans-serif'; ctx.fillText(t('rcpHere'), mx2 + 17, ly2); mx2 += 17 + ctx.measureText(t('rcpHere')).width + 10;
  if (R.win && R.stH <= 1) {
    ctx.strokeStyle = '#ffb800'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(mx2, ly2 - 5); ctx.lineTo(mx2 + 4, ly2 - 5); ctx.lineTo(mx2 + 4, ly2 + 5); ctx.lineTo(mx2, ly2 + 5); ctx.stroke();
    ctx.fillStyle = '#2a1a12'; ctx.fillText(t('rcpZone'), mx2 + 9, ly2);
  }
  // 한 줄 조언
  ctx.fillStyle = '#2a1a12'; ctx.font = '700 13px "Jua", sans-serif';
  wrapText(ctx, R.tip ? t(R.tip) : '', x0 + 10, ly + 38, cardW - 20, 16);
  ctx.restore();
}
function wrapText(ctx, txt, x, y, maxW, lh) {
  const words = String(txt).split(' ');
  let line = '';
  for (const w of words) {
    const tst = line ? line + ' ' + w : w;
    if (ctx.measureText(tst).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = tst;
  }
  if (line) ctx.fillText(line, x, y);
}
// 황금 굴러간 길 (★ 판): 금색 점선 + 끝 고리(칸 안 = 금, 밖 = 갈색). 다음에 불 때까지 남는다
function trailStart(goldenDisc) {
  if (cue.trail) { scene.remove(cue.trail); cue.trail.geometry.dispose(); cue.trail = null; }
  if (cue.trailEnd) { scene.remove(cue.trailEnd); cue.trailEnd = null; }
  if (!goldenDisc) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  geo.setDrawRange(0, 0);
  cue.trail = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffcf33, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9, depthTest: false }));
  cue.trail.renderOrder = 9; cue.trail.userData = { disc: goldenDisc, n: 0, tick: 0 };
  scene.add(cue.trail);
}
function trailStep() {
  const T = cue.trail;
  if (!T || T.userData.done) return;
  if (++T.userData.tick % 3) return;
  const d = T.userData.disc, n = T.userData.n;
  if (d.removed || n >= 64) return;
  const p = d.body.translation(), arr = T.geometry.attributes.position.array;
  arr[n * 3] = p.x; arr[n * 3 + 1] = 0.02; arr[n * 3 + 2] = p.z;
  T.userData.n = n + 1;
  T.geometry.attributes.position.needsUpdate = true;
  T.geometry.setDrawRange(0, T.userData.n);
}
function trailEnd(ok) {
  const T = cue.trail;
  if (!T) return;
  T.userData.done = true;
  T.computeLineDistances();
  const n = T.userData.n;
  if (n < 1) return;
  const arr = T.geometry.attributes.position.array;
  cue.trailEnd = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 24), new THREE.MeshBasicMaterial({ color: ok ? 0xffcf33 : 0x7a5a3a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
  cue.trailEnd.rotation.x = -Math.PI / 2; cue.trailEnd.position.set(arr[(n - 1) * 3], 0.03, arr[(n - 1) * 3 + 2]); cue.trailEnd.renderOrder = 9;
  scene.add(cue.trailEnd);
}

// 분필 화살표: 옆을 노리면 굴러갈 쪽(반대쪽 대각선). ★판에서 ★쪽을 가리키면 촉이 금색
function drawSlideArrow(ctx, dpr) {
  const st = cue.st;
  if (!st || puffer.who !== 'me' || !table) return;
  const star = st.type === 'goldenSide' && (profile.cue.star || 0) < 8;
  if (!(star || (cueStage('side') === 0 && Math.abs(st.lat) > 0.3))) return;
  const g = shotGeometry({ dir: st.dir, lat: st.lat, h: st.h }); // 누를 때 정한 방향(몸이 옆걸음해도 바람 방향은 그대로)
  const phi = Cues.slideAngle(st.lat), sg = Math.sign(st.lat) || 0;
  const a = new THREE.Vector3(st.c.x, st.top + 0.05, st.c.z);
  const dirv = g.dir.clone().multiplyScalar(Math.cos(phi)).addScaledVector(g.side, -sg * Math.sin(phi));
  const b = a.clone().addScaledVector(dirv, 1.8);
  const pa = a.clone().project(camera), pb = b.clone().project(camera);
  const W = ctx.canvas.width / dpr, H = ctx.canvas.height / dpr;
  const ax = (pa.x * 0.5 + 0.5) * W, ay = (-pa.y * 0.5 + 0.5) * H, bx = (pb.x * 0.5 + 0.5) * W, by = (-pb.y * 0.5 + 0.5) * H;
  const good = st.type === 'goldenSide' && Math.abs(st.lat) >= 0.35 && -sg === pocketLatSign(g);
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
  const ang = Math.atan2(by - ay, bx - ax);
  ctx.fillStyle = good ? '#ffcf33' : 'rgba(255,255,255,0.95)'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx + Math.cos(ang) * 10, by + Math.sin(ang) * 10); ctx.lineTo(bx + Math.cos(ang + 2.5) * 16, by + Math.sin(ang + 2.5) * 16); ctx.lineTo(bx + Math.cos(ang - 2.5) * 16, by + Math.sin(ang - 2.5) * 16); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ── 1인칭 (재윤님 6차: "실제 딱지를 보고 있는 1인칭 — 바람을 모을수록 볼따구가 시야에 보이게") ──────
// 내 차례엔 정면 얼굴 대신 화면 아래 양쪽에서 내 볼이 차오르고, 가운데 아래에 오므린 내 입술이 보인다.
// 볼 크기 = 숨 주머니(절대값). 꽉 = 볼이 눌려 납작 + 떨림, 버팀 = 붉어짐, 콜록 = 화면 흔들림 + 볼 푹.
const myTurn = { on: false, t0: 0, until: 0, pressed: false };
function fpvOn() { return (feel.fpv ?? 1) >= 0.5 && state === 'match'; }
function fpvVisible() { return fpvOn() && (myTurn.on || performance.now() < myTurn.until || (puffer.who === 'me' && (puffer.mode === 'blow' || puffer.mode === 'cough'))); }
function drawFPV(now) {
  if (!fpvVisible() || puffer.who !== 'me') return;
  const cv = $('#breath'), ctx = cv.getContext('2d'), dpr = cv._dpr || 1;
  const W = cv.width / dpr, H = cv.height / dpr;
  const F = Rules.POUCH_FULL;
  const mode = puffer.mode;
  const tm = Math.max(0, (performance.now() - (puffer._t0 || performance.now())) / 1000); // drawPuffer 와 같은 시계(rAF 시각은 느린 기기에서 뒤처짐)
  let fill = mode === 'charge' ? clamp(puffer.p / F, 0, 1.12) : 0;
  const swS = sweep.clock && sweep.ctl ? sweep.ctl.state : null; // 쓸기 숨: 볼은 숨이 나가는 동안 천천히 꺼지고(그대로 숨 주머니), 입 틈 바람은 숨 내내
  if (mode === 'blow') fill = swS ? (puffer.fill || 0) * (0.25 + 0.55 * (1 - clamp(swS.t / Sweep.SWEEP.capD, 0, 1))) : (puffer.fill || 0) * Math.max(0, 1 - tm / 0.22); // 불면 볼이 푹 꺼짐(쓸기: '푸' 순간 2할 꺼지고 숨 내내 천천히)
  if (mode === 'cough') fill = 0.3 * Math.max(0, 1 - tm / 0.3);
  const strain = mode === 'charge' ? puffer.strain || 0 : 0;
  const full = mode === 'charge' && puffer.full;
  const v = 0.18 + 0.82 * Math.min(1, fill); // 볼이 시야에 들어온 정도 (기다릴 때도 살짝 보여 '내 얼굴' 기준을 만든다)
  const shake = (full ? 1.5 : 0) + strain * 4 + (mode === 'cough' ? 9 * Math.max(0, 1 - tm / 0.5) : 0);
  const sx = Math.sin(now * 0.07) * shake, sy = Math.cos(now * 0.09) * shake * 0.6;
  // 쓸기 연습판: 고개를 젖힐수록 입술·볼이 화면 아래로 빠진다(α 10° = 화면 높이의 12%). 줄인 움직임에서도 남긴다 — 카메라 피치를 0 으로 둘 때의 대체 표현(스펙 §5.1)
  const swDy = sweepOn() ? H * 0.012 * clamp(sweepAlphaDeg(), 0, Sweep.SWEEP.maxDeg) : 0;
  ctx.save(); ctx.scale(dpr, dpr); ctx.translate(sx, sy + swDy);
  // 아래 그늘 (얼굴 아래쪽이 시야를 가리는 느낌)
  const vy0 = H * (0.78 - 0.08 * v);
  const vg = ctx.createLinearGradient(0, vy0, 0, H);
  vg.addColorStop(0, 'rgba(60,30,20,0)'); vg.addColorStop(1, `rgba(60,30,20,${0.18 + 0.2 * v})`);
  ctx.fillStyle = vg; ctx.fillRect(-20, vy0, W + 40, H - vy0 + 20); // 그늘이 있는 띠만 칠한다(모바일 래스터 비용)
  const skin = strain > 0 ? mixRGB([255, 208, 156], [255, 120, 100], strain) : [255, 208, 156];
  const skinDk = strain > 0 ? mixRGB([238, 166, 120], [220, 80, 70], strain) : [238, 166, 120];
  for (const sg of [-1, 1]) {
    // 볼: 아래 구석에서 밀고 들어오는 큰 둥근 살 (가까워서 흐릿한 가장자리)
    const squash = full ? 0.9 : 1;
    // 꽉 차도 두 볼 안쪽 끝이 가운데에서 0.12W 떨어져 있게(가운데서 만나면 엉덩이처럼 보임 — 교차 검토)
    const cx = W / 2 + sg * W * (0.66 - 0.12 * v), cy = H * (1.07 - 0.1 * v);
    const rx = W * (0.28 + 0.12 * v) * (full ? 1.04 : 1), ry = H * (0.14 + 0.08 * v) * squash;
    const g = ctx.createRadialGradient(cx - sg * rx * 0.25, cy - ry * 0.45, rx * 0.08, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, `rgba(${skin.map((c) => Math.min(255, c + 25)).join(',')},1)`);
    g.addColorStop(0.7, `rgba(${skin.join(',')},1)`);
    g.addColorStop(0.92, `rgba(${skinDk.join(',')},0.95)`);
    g.addColorStop(1, `rgba(${skinDk.join(',')},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, sg * -0.18, 0, Math.PI * 2); ctx.fill();
    // 볼 홍조 + 팽팽한 윤기
    ctx.fillStyle = `rgba(255,110,120,${0.18 + 0.25 * v + 0.3 * strain})`;
    ctx.beginPath(); ctx.ellipse(cx - sg * rx * 0.2, cy - ry * 0.25, rx * 0.35, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    if (v > 0.45) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 * (v - 0.45) / 0.55})`;
      ctx.beginPath(); ctx.ellipse(cx - sg * rx * 0.38, cy - ry * 0.62, rx * 0.16, ry * 0.08, sg * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 윗입술: 1인칭으로 내려다본 내 입술 — 화면 아래 가운데에 반쯤 걸친 넓적한 큐피드 활 모양. 오므릴수록 좁아지며 앞(위)으로 쭉
  const open = mode === 'blow' ? Math.min(1, tm / 0.05) * (swS ? swS.env : Math.max(0, 1 - tm / 0.5)) : 0;
  const pk = Math.min(1, fill);
  const lw = W * (0.2 - 0.07 * pk + 0.03 * open), lh = H * (0.03 + 0.018 * pk);
  const lx = W / 2, ly = H + 2 - lh * (0.9 + 0.5 * pk); // 윗입술 꼭대기선 높이
  const lg = ctx.createLinearGradient(0, ly - lh, 0, H);
  lg.addColorStop(0, '#f08a94'); lg.addColorStop(0.45, '#d4566a'); lg.addColorStop(1, '#a8304a');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(lx - lw, H + 4);
  ctx.quadraticCurveTo(lx - lw * 0.95, ly + lh * 0.2, lx - lw * 0.5, ly); // 왼쪽 봉우리
  ctx.quadraticCurveTo(lx - lw * 0.18, ly - lh * 0.18, lx, ly + lh * 0.08); // 가운데 골은 얕게(깊으면 하트처럼 보임)
  ctx.quadraticCurveTo(lx + lw * 0.18, ly - lh * 0.18, lx + lw * 0.5, ly);
  ctx.quadraticCurveTo(lx + lw * 0.95, ly + lh * 0.2, lx + lw, H + 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(120,30,40,0.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(lx - lw * 0.45, ly + lh * 0.35, lw * 0.16, lh * 0.18, -0.2, 0, Math.PI * 2); ctx.fill();
  // 오므림 주름
  ctx.strokeStyle = `rgba(120,20,35,${0.25 + 0.35 * pk})`; ctx.lineWidth = 1.5;
  for (const sg of [-1, 1]) for (let q = 1; q <= 2; q++) { ctx.beginPath(); ctx.moveTo(lx + sg * lw * (0.2 + q * 0.15), ly + lh * 0.6); ctx.lineTo(lx + sg * lw * (0.12 + q * 0.12), H); ctx.stroke(); }
  // 불 때: 입 틈에서 바람이 확
  if (open > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.6 * open})`;
    ctx.beginPath(); ctx.ellipse(lx, ly - 6, lw * 0.28 * open, 10 * open, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 참다가 새는 김 (버팀)
  if (strain > Rules.LEAK_AT) {
    const ph = (now * 0.0025) % 1;
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - ph)})`;
    ctx.beginPath(); ctx.arc(lx + lw * 0.7 + ph * 30, ly - 6 - ph * 26, 6 + ph * 8, 0, Math.PI * 2); ctx.fill();
  }
  // 콜록: 회색 기침 구름
  if (mode === 'cough') {
    for (let i = 0; i < 4; i++) { const k = clamp(tm * 2 - i * 0.12, 0, 1); ctx.fillStyle = `rgba(210,205,200,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(lx + (i - 1.5) * 40 * k, ly - 10 - 80 * k, 14 + 20 * k, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
function mixRGB(a, b, k) { return a.map((x, i) => Math.round(x + (b[i] - x) * clamp(k, 0, 1))); }

// 첫 터치 가이드(6차: "처음엔 딱지 어디를 찍을지 가이드 — 찍으라고"): 위에서 3장째 가운데에 손가락이 꾹 → 아래로 쭉 당기는 시범.
// 7차: 평생 첫 TAP_GUIDE_PUFFS 숨(맨 처음 튜토리얼)에만. 공략 단서 토글과 무관한 조작 안내다.
// ── 9차 입술 높이 레일 · 물안경 칩 ──
function giveGoggles(k) { // 9차 물안경 얻기(최대 9). 지금은 시작 3개 + 같은 판 3연패 +1 — 정식 경제는 docs/design/items-pvp.md
  const before = profile.items.goggles || 0;
  profile.items.goggles = Math.min(GOGGLE_MAX, before + k);
  if (profile.items.goggles > before) setTimeout(() => toast(t('goggleGot')), 1200);
}
function poseUnlocked() { return (profile.tutorialPuffs || 0) >= POSE_UNLOCK_PUFFS; }
function setPose(p, quiet) {
  if (p === 'low' && liveCount() < Rules.LOW_POSE_MIN_N) { if (!quiet) toast(t('poseSmall')); p = 'eye'; }
  if (p === pose) return;
  pose = p;
  if (!quiet) { sfx.tone(p === 'low' ? 262 : 330, 0.07, 'triangle', 0.06); navigator.vibrate?.(12); }
  if (p === 'low' && !profile.settings.poseTipSeen) { profile.settings.poseTipSeen = true; Store.save(profile); toast(t('poseLowTip')); }
}
function updateRail() {
  const rail = $('#lipRail'), gg = $('#goggles');
  const mine = state === 'match' && myTurn.on && puffer.who === 'me';
  const showRail = mine && !myTurn.pressed && fpvOn() && poseUnlocked() && !sweepOn(); // 쓸기 연습판엔 입술 높이 레일 없음(입은 바닥)
  if (rail.hidden === showRail) rail.hidden = !showRail;
  const small = liveCount() < Rules.LOW_POSE_MIN_N;
  if (pose === 'low' && small && mine) setPose('eye', true); // 작은 더미: 보이게 눈높이로 되돌림
  rail.classList.toggle('low', pose === 'low');
  rail.classList.toggle('off', small);
  const free = goggleTrial() || feel.guide >= 0.5;
  const showG = mine && !myTurn.pressed && !free && !match?.net && !sweepOn(); // 누르기 전에만 (기획서 1.7). PvP 는 아이템 없음. 쓸기 연습판도 없음(초록 띠가 없다)
  if (gg.hidden === showG) gg.hidden = !showG;
  if (showG) {
    gg.classList.toggle('on', gogglesOn);
    gg.classList.toggle('empty', (profile.items.goggles || 0) <= 0 && !gogglesOn);
    gg.classList.toggle('nudge', !gogglesOn && (profile.cue.relapse.breath || 0) > 0 && (profile.items.goggles || 0) > 0); // 같은 숨 실수 2연속 → '물안경 쓸래?'
    const nTxt = String(profile.items.goggles || 0);
    if ($('#gogglesN').textContent !== nTxt) $('#gogglesN').textContent = nTxt;
  }
}
// 책상 자세의 입 높이를 더미 앞면에 분홍 점선으로(누르기 전에만)
function drawLipLine() {
  if (!(pose === 'low' && poseK > 0.4 && myTurn.on && !myTurn.pressed && table && state === 'match')) return;
  const cv = $('#breath'), ctx = cv.getContext('2d'), dpr = cv._dpr || 1;
  const c = table.pileCenter();
  const dir = new THREE.Vector3(camera.position.x - c.x, 0, camera.position.z - c.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.strokeStyle = 'rgba(255,110,150,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([7, 6]);
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = -1.2 + (2.4 * i) / 12;
    const p = new THREE.Vector3(c.x, Rules.LIP_MIN, c.z).addScaledVector(dir, Math.cos(a) * DISC_R * 1.04).addScaledVector(side, Math.sin(a) * DISC_R * 1.04).project(camera);
    const x = (p.x * 0.5 + 0.5) * window.innerWidth, y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.restore();
}
const TAP_GUIDE_PUFFS = 3;
function drawTapGuide(now) {
  if (sweepOn()) return; // 쓸기 연습판은 자기 시범(sweepDraw)
  if (!myTurn.on || myTurn.pressed || !table || state !== 'match' || cue.receipt) return; // 카드가 떠 있으면 카드 먼저
  // 손가락 시범은 맨 처음 튜토리얼(평생 첫 3숨)에만 (재윤님 7차). 그 뒤 '어디'는 금 띠·영수증이 맡는다
  if ((profile.tutorialPuffs || 0) >= TAP_GUIDE_PUFFS) return;
  if (now - myTurn.t0 < 700) return; // 카메라가 내려앉은 뒤
  const live = table.liveDiscs(), n = live.length;
  if (!n) return;
  const ys = live.map((d) => d.body.translation().y).sort((a, b) => b - a);
  const c = table.pileCenter();
  const dir = { x: c.x - camera.position.x, z: c.z - camera.position.z };
  const type = match?.level?.type || 'flip';
  const gd = type === 'golden' || type === 'goldenSide' ? live.find((d) => d.cardId === 'golden') : null;
  // 노릴 자리: 위에서 3장째(작은 더미는 가운데). 황금 판은 황금 딱지 높이, ★판은 ★ 반대쪽 옆
  let h = ys[Math.min(n, n <= 4 ? Math.ceil(n / 2) : 3) - 1], lat = 0;
  if (gd) {
    h = Math.max(0.03, gd.body.translation().y - DISC_H * 0.3);
    if (type === 'goldenSide' && pocket) lat = -(pocketLatSign(shotGeometry({ dir, lat: 0, h })) || 1) * 0.6 * DISC_R;
  }
  const p = shotGeometry({ dir, lat, h }).aim.clone().project(camera);
  const cv = $('#breath'), ctx = cv.getContext('2d'), dpr = cv._dpr || 1;
  const W = cv.width / dpr, H = cv.height / dpr;
  const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
  const micMode = micEnabled && mic.ready;
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  // 당김 시범 길이: 숨 가이드 단계에서만 '정답 근처', 그 뒤엔 '당긴다'만 알려 주는 고정 길이
  const pull = micMode ? 0 : gogglesActive() ? minDim * feel.pull * sweetHiFor(n) * 0.9 : minDim * 0.12; // 정답 길이는 물안경일 때만
  const cyc = ((now - myTurn.t0) % 2600) / 2600; // 0~0.3 누름, 0.3~0.8 당김, 0.8~1 떼기
  const press = micMode ? Math.min(1, cyc / 0.3) : cyc < 0.3 ? cyc / 0.3 : 1;
  const drag = micMode ? 0 : cyc < 0.3 ? 0 : cyc < 0.8 ? (cyc - 0.3) / 0.5 : 1;
  const fy = y + drag * drag * (3 - 2 * drag) * pull;
  ctx.save(); ctx.scale(dpr, dpr);
  // 누를 자리 물결 고리 (밝은 딱지 위에서도 보이게 어두운 테두리 먼저)
  for (let i = 0; i < 2; i++) {
    const r = 10 + ((now * 0.05 + i * 22) % 44), a = 1 - (r - 10) / 44;
    ctx.strokeStyle = `rgba(42,26,18,${0.45 * a})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  // 당길 길 (점선 화살표) / 마이크 모드는 입김 방울
  if (!micMode && cyc >= 0.3 && cyc < 0.95) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 4; ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x, fy - 6); ctx.stroke(); ctx.setLineDash([]);
  }
  if (micMode && cyc >= 0.3) for (let i = 0; i < 3; i++) { const k = ((cyc - 0.3) / 0.7 + i / 3) % 1; ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(x - 30 + i * 6, y - 20 - 40 * k, 4 + 6 * k, 0, Math.PI * 2); ctx.fill(); }
  // 손가락 (끝 = 누를 자리): 손톱 + 마디 주름
  const fyy = micMode ? y : cyc >= 0.8 ? y + pull : fy, sc = 1 - 0.12 * press * (micMode || cyc < 0.8 ? 1 : 0);
  ctx.translate(x, fyy); ctx.scale(sc, sc);
  ctx.fillStyle = '#ffe1c4'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-11, 0, 22, 62, 11) : ctx.rect(-11, 0, 22, 62); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffc6cf'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-6, 4, 12, 10, 5) : ctx.rect(-6, 4, 12, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-2, 7, 2.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(42,26,18,0.6)'; ctx.beginPath(); ctx.moveTo(-6, 30); ctx.quadraticCurveTo(0, 33, 6, 30); ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
  // 말풍선: 꾹 → 당겨서 숨 모으기 (마이크: 누른 채 후~)
  {
    const txt = cyc < 0.3 ? t('tapHere') : micMode ? t('tapBlow') : t('tapPull');
    ctx.font = '700 15px "Jua", sans-serif';
    const tw = ctx.measureText(txt).width + 18, bx = clamp(x + 40, 8, W - tw - 8), by = y - 40;
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw, 28, 10) : ctx.rect(bx, by, tw, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a1a12'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 9, by + 14);
  }
  ctx.restore();
}

// ── 공략 단서 메시 (5차) ─────────────────────────────────
const cue = { sleeve: null, band: null, tide: null, trail: null, trailEnd: null, st: null, receipt: null, snap: null };
function openCyl(r, color, opacity, order) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 40, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = order; m.visible = false; scene.add(m); return m;
}
function ring(r, tube, color, opacity, order) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = Math.PI / 2; m.renderOrder = order; m.visible = false; scene.add(m); return m;
}
function buildCueMeshes() {
  // 소매: 조준한 딱지부터 꼭대기까지 = '뚜껑' (위에서 몇 장인지 셀 수 있게)
  cue.sleeve = openCyl(DISC_R * 1.035, 0xffffff, 0.16, 7);
  // 금 띠: 위에서 2~4장째 (실측 최고 높이 창) — 높이 단계 0 에서만, 누르는 동안만
  cue.band = { body: openCyl(DISC_R * 1.05, 0xffcf33, 0.28, 8), top: ring(DISC_R * 1.05, 0.02, 0xffcf33, 0.9, 8), bot: ring(DISC_R * 1.05, 0.02, 0xffcf33, 0.9, 8) };
  // 숨 물결: 당기면 책상에서 물이 차오름. 0.9·정답 = 꼭대기에 딱
  const bulge = new THREE.Mesh(new THREE.SphereGeometry(DISC_R * 1.06, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  bulge.renderOrder = 7; bulge.visible = false; scene.add(bulge);
  cue.tide = { body: openCyl(DISC_R * 1.06, 0xffffff, 0.32, 7), line: ring(DISC_R * 1.07, 0.022, 0xffffff, 0.9, 7), brim: ring(DISC_R * 1.08, 0.03, 0xffcf33, 0.8, 7), bulge, f: 0 };
}
function hideCues() {
  if (!cue.sleeve) return;
  cue.sleeve.visible = false;
  for (const m of Object.values(cue.band)) m.visible = false;
  for (const k of ['body', 'line', 'brim', 'bulge']) cue.tide[k].visible = false;
  cue.st = null;
}
// 내 조준 중(누름/당김) 단서 상태를 갱신. 실제 그리기 위치는 frame 의 updateCues 에서(찰랑·맥동)
function showCues(aiming) {
  if (!table || puffer.who !== 'me') return;
  const live = table.liveDiscs();
  const n = live.length, top = table.columnTop();
  if (!aiming.ys) aiming.ys = live.map((d) => d.body.translation().y).sort((a, b) => b - a);
  const k = Cues.lidCount(aiming.ys, aiming.h, DISC_H);
  const type = match?.level?.type || 'flip';
  const win = Cues.idealWindow(n, type);
  const inWin = !!win && k >= win[0] && k <= win[1];
  if (inWin && !aiming.wasIn && (aiming.power || 0) < 0.05 && cueStage('height') === 0) sfx.tone(988, 0.06, 'triangle', 0.05); // 창에 들어오면 '띵'
  aiming.wasIn = inWin;
  cue.st = { n, top, k, win, inWin, h: aiming.h, p: aiming.power || 0, ratio: (aiming.power || 0) / sweetHiFor(n), lat: aiming.lat || 0, ys: aiming.ys, c: table.pileCenter(), type, dir: aiming.dir };
}
function updateCues(now) {
  const st = cue.st;
  if (!st || state !== 'match' || !cue.sleeve) return;
  const { c, h, ys } = st;
  const V = (y) => paper.visY(y, c); // 물리 높이 → 보이는 딱지 높이(얇은 종이 더미는 물리보다 낮다, paper.js 배치). 판정·lidCount 는 물리 그대로
  const top = V(st.top);
  const pulling = st.p >= 0.05;
  // 소매(뚜껑): 조준 딱지 아래 경계 ~ 꼭대기
  const y0 = Math.max(0, V(h) - VIS_H / 2);
  cue.sleeve.visible = true;
  cue.sleeve.position.set(c.x, (y0 + top) / 2, c.z);
  cue.sleeve.scale.set(1, Math.max(0.02, top - y0), 1);
  cue.sleeve.material.opacity = pulling ? 0.05 : 0.16;
  // 금 띠: 위에서 2~4장째
  const showBand = !pulling && st.win && cueStage('height') === 0 && pose !== 'low';
  for (const m of Object.values(cue.band)) m.visible = !!showBand;
  if (showBand) {
    const yTop = V(ys[st.win[0] - 1]) + VIS_H / 2, yBot = V(ys[Math.min(ys.length, st.win[1]) - 1]) - VIS_H / 2; // 보이는 2~4장째 딱지 그대로
    cue.band.body.position.set(c.x, (yTop + yBot) / 2, c.z); cue.band.body.scale.set(1, Math.max(0.02, yTop - yBot), 1);
    cue.band.top.position.set(c.x, yTop, c.z); cue.band.bot.position.set(c.x, yBot, c.z);
    cue.band.body.material.opacity = st.inWin ? 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(now * 0.025)) : 0.2;
  }
  // 숨 물결 (숨 단계 ≤ 1, 당기는 동안)
  const beat = beatOn();
  // 9차: 숨 물결(초록 구간)은 물안경을 쓴 숨에만. 흰 물결도 '꼭대기 = 정답'을 흘리므로 안경이 없으면 아예 없다
  const bst = 0;
  const showTide = pulling && gogglesActive();
  for (const k of ['body', 'line', 'brim', 'bulge']) cue.tide[k].visible = showTide;
  if (!showTide) { cue.tide.f = 0; return; }
  const T = cue.tide;
  T.f += (Cues.tideFill(st.p, st.n) - T.f) * (beat ? 0.7 : 0.35); // 콩닥: 물결이 박동을 늦게 따라가면 타이밍이 어긋남
  const fh = Math.min(T.f, 1) * top;
  const col = bst === 0 ? (st.ratio < Rules.GREEN_LO ? 0xffe9a0 : st.ratio <= 1.0 ? 0x6dffb0 : 0xff8a8a) : 0xffffff;
  const op = bst === 0 ? 0.32 : lerp(0.28, 0.12, clamp(((profile.cue.breath || 0) - 3) / 5, 0, 1));
  T.body.position.set(c.x, fh / 2 + 0.005, c.z); T.body.scale.set(1, Math.max(0.01, fh), 1);
  T.body.material.color.setHex(col); T.body.material.opacity = op;
  const wob = (st.ratio < 0.6 ? 0.025 : 0.008) * Math.sin(now * 0.009);
  T.line.position.set(c.x, fh + wob, c.z); T.line.material.color.setHex(col);
  T.brim.position.set(c.x, top, c.z); T.brim.material.color.setHex(bst === 0 ? 0xffcf33 : 0xffffff); T.brim.material.opacity = bst === 0 ? 0.85 : 0.5;
  const bulge = clamp((T.f - 1) / 0.5, 0, 1) * 0.2;
  T.bulge.visible = bulge > 0.005;
  T.bulge.position.set(c.x, top, c.z); T.bulge.scale.set(1, bulge / (DISC_R * 1.06) + 0.001, 1);
  T.bulge.material.color.setHex(col); T.bulge.material.opacity = op;
  // 넘침(돌풍): 카메라 쪽 테두리에서 물보라
  if (st.ratio > 1.0 && Math.random() < Math.min(1, (st.ratio - 1) / 0.1)) {
    const tc = new THREE.Vector3(camera.position.x - c.x, 0, camera.position.z - c.z).normalize();
    fx.emit({ at: { x: c.x + tc.x * DISC_R, y: top + 0.05, z: c.z + tc.z * DISC_R }, n: 2, color: bst === 0 ? 0xff8a8a : 0xffffff, speed: 1.2, up: 2.2, life: 0.4, size: 0.14, gravity: 3 });
  }
}

// 조준점 색: 정답 색은 숨 물결이 맡는다(5차) → 늘 흰색
function powerColor() { return 0xffffff; }

// 슛 → 월드 조준점 (원기둥 앞쪽 접평면)
function shotGeometry(shot) {
  const c = table.pileCenter();
  const dir = new THREE.Vector3(shot.dir.x, 0, shot.dir.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  // 바람이 닿는 곳 = 원기둥 곡면 위의 점 (좌우 lat, 높이 h). 옆을 노리면 곡면을 따라 뒤로 돌아간 자리
  const lat = clamp(shot.lat || 0, -0.95 * DISC_R, 0.95 * DISC_R);
  const aim = new THREE.Vector3(c.x, shot.h, c.z).addScaledVector(dir, -Math.sqrt(DISC_R * DISC_R - lat * lat)).addScaledVector(side, lat);
  const normal = aim.clone().sub(new THREE.Vector3(c.x, shot.h, c.z)).normalize(); // 곡면 바깥 방향
  const pitch = 0.1;
  const d3 = new THREE.Vector3(dir.x * Math.cos(pitch), -Math.sin(pitch), dir.z * Math.cos(pitch));
  const origin = aim.clone().addScaledVector(d3, -2.6);
  return { aim, origin, dir, side, center: c, normal };
}

function showGizmo(shot, color = 0xffffff) {
  const g = shotGeometry(shot);
  puffer.aimX = (shot.lat || 0) / DISC_R;
  const va = visAim(g); // 화면에 그리는 조준점(보이는 딱지 높이). 물리는 g.aim
  if (breath.mode !== 'blow') {
    breath.aim = va.clone();
    breath.p = (shot.power || 0) / Rules.POUCH_FULL; // 절대값(주머니 비율). 정답 대비로 그리면 숨겨진 정답 게이지가 된다
    if (breath.mode !== 'charge') { breath.mode = 'charge'; breath.t = 0; }
  }
  reticle.visible = layerRing.visible = aimLine.visible = true;
  reticle.position.copy(va).addScaledVector(g.dir, -0.02);
  reticle.lookAt(va.clone().add(g.normal)); // 표적 고리가 원기둥 곡면에 붙어 보이게 (옆을 노리면 비스듬히 누움)
  reticle.material.color.setHex(color);
  // 지난 숨 고스트: 직전 조준 자리 (내 차례일 때만)
  if (lastBreath.aim && puffer.who === 'me' && breath.mode === 'charge') {
    ghostRing.visible = true;
    ghostRing.position.copy(lastBreath.aim).addScaledVector(g.dir, -0.03);
    ghostRing.lookAt(lastBreath.aim.clone().add(lastBreath.normal || g.normal));
  }
  const s = 0.8 + (shot.power || 0) * 0.6;
  reticle.scale.setScalar(s);
  layerRing.position.set(g.center.x, va.y, g.center.z);
  // 기운 틈: 옆을 누르면 누른 쪽이 들리고 굴러갈 반대쪽이 내려간다 (좌우 단계 ≤ 1 이면 크게)
  const tiltA = (puffer.who === 'me' && cueStage('side') <= 1 ? 0.25 : 0.1) * clamp(shot.lat || 0, -1, 1);
  layerRing.quaternion.setFromAxisAngle(g.dir, -tiltA).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  const from = g.origin.clone().lerp(g.aim, 0.15);
  aimLine.visible = false; // 숨 줄기(2D 오버레이)로 대체
  aimLine.geometry.setFromPoints([from, g.aim]);
  aimLine.computeLineDistances();
  aimLine.material.color.setHex(color);
}

function hideGizmo() {
  hideCues();
  reticle.visible = layerRing.visible = aimLine.visible = false;
  if (ghostRing) ghostRing.visible = false;
  if (breath.mode === 'charge') { breath.mode = 'off'; puffer.aimX = 0; } // 취소: 얼굴도 정면으로 (불 때는 바람 방향 유지)
}

// ── 숨 줄기 (재윤님 피드백 2: '입 → 바람 → 딱지' 인과를 눈으로) ─────────────
// 당기는 동안: 입과 조준점 사이에 숨 줄기가 생기고 공기가 입으로 빨려 들어간다(들숨).
// 놓으면: 줄기가 번쩍이며 공기가 조준점으로 쏟아진다(날숨). 이후 3D 에선 가장자리 밑으로 공기가 파고드는 입자.
const breath = { mode: 'off', p: 0, t: 0, who: 'me', aim: null, ratio: 1, air: null }; // air = 실험 공기 앞머리 연출의 숨(airShot)
function drawBreath(dt) {
  const cv = $('#breath');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, dpr = cv._dpr || 1;
  ctx.clearRect(0, 0, W, H);
  if (breath.mode === 'off' || !breath.aim || state !== 'match') return;
  if (!(breath.mode === 'charge' && breath.full)) breath.t += dt; // 꽉: 숨 줄기가 멈춘다(더 안 들어감)
  // 분필 화살표는 1인칭 볼 위에 그린다(frame 에서 drawFPV 다음). 엄지 눈금은 1인칭을 끈 경우에만
  const r = $('#puffWrap').getBoundingClientRect();
  let mx = (r.left + r.width * 0.5) * dpr, my = (r.top + r.height * 0.68) * dpr;
  if (fpvOn() && puffer.who === 'me' && breath.who === 'me') { mx = W / 2; my = H - 0.05 * H; } // 1인칭: 내 입술에서 (얼굴 숨김과 같은 조건)
  // 실험 공기 앞머리 연출(airShot): 줄기 머리 = 와류 고리(공기 앞머리)의 화면 자리 → 앞머리가 하나(고리와 같은 시계·같은 자리).
  //   흐려짐·'퍽' 방사선 시계는 충돌 멈칫이 끝난 뒤부터. 약한 숨은 고리가 흩어진 자리(aStop)에서 위로 흩어짐. 연출 끔이면 아래는 예전 그대로
  const A = breath.mode === 'blow' && breath.air && breath.air === airShot && airShot.aStop ? airShot : null;
  let ax, ay, U = 1, bt = breath.t;
  if (A) {
    const aD = airFront(A);
    expP.set(A.o.x + A.d.x * aD, A.o.y + A.d.y * aD, A.o.z + A.d.z * aD).project(camera);
    ax = (expP.x * 0.5 + 0.5) * W; ay = (-expP.y * 0.5 + 0.5) * H;
    U = clamp(aD / A.aFront, 0, 1);
    bt = A.arrAt == null ? 0 : Math.max(0, (performance.now() - A.arrAt - (A.hsImpact || 0)) / 1000);
  } else {
    const v = breath.aim.clone().project(camera);
    ax = (v.x * 0.5 + 0.5) * W; ay = (-v.y * 0.5 + 0.5) * H;
  }
  const p = clamp(breath.p, 0, 1.3);
  const dx = ax - mx, dy = ay - my, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const w0 = (4 + p * 8) * dpr, w1 = (12 + p * 34) * dpr, wh = A ? w0 + (w1 - w0) * U : w1;
  let alpha;
  if (breath.mode === 'charge') alpha = 0.08 + 0.2 * Math.min(1, p);
  else {
    const k = bt / 0.55;
    if (k >= 1) { breath.mode = 'off'; return; }
    alpha = 0.6 * (1 - k);
  }
  const grad = ctx.createLinearGradient(mx, my, ax, ay);
  const sr = breath.mode === 'charge' ? breath.strain || 0 : 0; // 버팀: 숨 줄기가 붉어짐
  grad.addColorStop(0, `rgba(255,${Math.round(255 - 130 * sr)},${Math.round(255 - 130 * sr)},${alpha})`);
  grad.addColorStop(1, `rgba(215,243,255,${alpha * 0.55})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(mx + nx * w0, my + ny * w0); ctx.lineTo(ax + nx * wh, ay + ny * wh);
  ctx.lineTo(ax - nx * wh, ay - ny * wh); ctx.lineTo(mx - nx * w0, my - ny * w0);
  ctx.closePath(); ctx.fill();
  const blow = breath.mode === 'blow';
  const N = blow ? 26 : 16;
  ctx.lineCap = 'round';
  // 실패 서명(글자 없이 원인 보이기): 숨 부족 = 닿기 전에 흐려지며 위로 흩어짐 / 과호흡 = 지그재그로 흔들림
  const weak = blow && breath.ratio < 0.75;
  const reach = A ? 1 : weak ? 0.45 + 0.55 * (breath.ratio / 0.75) : 1; // 공기 앞머리: reach 는 머리(고리) 자리에 이미 들어 있음
  const zig = blow && breath.ratio > 1.1 ? Math.min(1, (breath.ratio - 1.1) * 4) : 0;
  for (let i = 0; i < N; i++) {
    const uRaw = A ? 1 - 0.55 * (i / N) + bt * 3 : breath.t * 3 + (i / N) * 0.55; // 공기 앞머리: 줄기들이 머리 뒤에 늘어섬
    let u = blow ? Math.min(reach, uRaw) : 1 - ((breath.t * (0.5 + p * 0.6) + i / N) % 1);
    const off = Math.sin(i * 12.9898) * 0.85 + zig * Math.sin(u * 18 + breath.t * 40) * 1.4;
    const wl = w0 + ((A ? wh : w1) - w0) * u;
    let x = mx + dx * u + nx * off * wl, y = my + dy * u + ny * off * wl;
    if (weak && u >= reach - 0.02) y -= (uRaw - reach) * 120 * dpr; // 힘이 빠져 위로 흩어짐
    const len = (blow ? 30 : 9) * dpr * (0.5 + p);
    const sgn = blow ? 1 : -1;
    ctx.strokeStyle = `rgba(255,255,255,${blow ? 0.95 * (1 - bt / 0.55) : 0.55})`;
    ctx.lineWidth = (blow ? 3.2 : 2) * dpr;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (dx / L) * len * sgn, y - (dy / L) * len * sgn); ctx.stroke();
  }
  if (blow && bt < 0.3 && (!A || (A.arrAt != null && !A.weak))) {
    // 조준점에 '퍽' 방사선 (공기 앞머리 연출이면 공기가 더미에 닿은 뒤, 충돌 멈칫 동안은 첫 모습 그대로)
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - bt / 0.3)})`;
    ctx.lineWidth = 3 * dpr;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r0 = (10 + bt * 160) * dpr, r1 = r0 + 14 * dpr;
      ctx.beginPath(); ctx.moveTo(ax + Math.cos(a) * r0, ay + Math.sin(a) * r0); ctx.lineTo(ax + Math.cos(a) * r1, ay + Math.sin(a) * r1); ctx.stroke();
    }
  }
}

// 엄지 옆 멈춤 눈금: 누른 점에서 '꽉' 거리만큼 아래, 손가락 옆(엄지가 얼굴을 가려도 보이게).
// 점선 → 꽉이면 실선 → 꽉 너머로 우겨넣으면 빨강 + 용수철. 판마다 같은 자리(절대 자) — 정답이 아니다.
function drawThumbTick(ctx, dpr) {
  const pr = breath.press, f = breath.finger || pr;
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  const F = Rules.POUCH_FULL;
  const ty = pr.y + F * minDim * feel.pull;
  const side = pr.x < window.innerWidth * 0.3 ? 1 : -1;
  const x = pr.x + side * 48;
  const over = breath.over, full = breath.full;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  // 누른 점 → 눈금까지 세로 안내선
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, pr.y); ctx.lineTo(x, ty); ctx.stroke();
  // 꽉 눈금
  ctx.setLineDash(full || over ? [] : [6, 5]);
  ctx.strokeStyle = 'rgba(42,26,18,0.85)'; ctx.lineWidth = full || over ? 9 : 6;
  ctx.beginPath(); ctx.moveTo(x - 16, ty); ctx.lineTo(x + 16, ty); ctx.stroke();
  ctx.strokeStyle = over ? '#ff4d5e' : full ? '#ffffff' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = full || over ? 5 : 3;
  ctx.beginPath(); ctx.moveTo(x - 15, ty); ctx.lineTo(x + 15, ty); ctx.stroke();
  ctx.setLineDash([]);
  // 꽉 너머: 눈금 → 손가락까지 용수철(더 안 늘어남)
  if (over && f.y > ty + 4) {
    ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, ty);
    const n = 8, L = f.y - ty;
    for (let i = 1; i <= n; i++) ctx.lineTo(x + (i % 2 ? 7 : -7) * (i < n ? 1 : 0), ty + (L * i) / n);
    ctx.stroke();
  }
  ctx.restore();
}

// ── 퍼퍼(볼 빵빵 얼굴) ───────────────────────────────────
const puffer = { p: 0, mode: 'idle', t: 0, who: 'me', snapUntil: 0, snapP: 0, snapN: 0, strain: 0, full: false, fill: 0, ratio: 1 };
const lastBreath = { p: null, aim: null }; // 지난 숨 고스트 (내 숨만)
function drawPuffer() {
  const cv = $('#puffCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = cv.width;
  const now = performance.now();
  if (puffer.mode !== puffer._m) { puffer._m = puffer.mode; puffer._t0 = now; }
  const t = (now - (puffer._t0 || now)) / 1000;
  const F = Rules.POUCH_FULL;
  const ai = puffer.who === 'ai';
  const blowing = puffer.mode === 'blow';
  const fill = clamp(puffer.p / F, 0, POWER_MAX / F); // 주머니 채움(절대값). 정답과 무관
  const stage = guideStage();
  // 얼굴: 충전 중 볼 = 주머니, 빨개짐 = 꽉에서 버틴 시간 / 불 때 = 결과 숨 비율(약함·적정·돌풍 표정)
  drawBlowFace(ctx, S, {
    mode: puffer.mode === 'cough' ? 'cough' : blowing ? 'blow' : puffer.mode === 'charge' ? 'charge' : 'idle',
    p: blowing ? puffer.ratio : fill, fill: puffer.fill, t, who: puffer.who,
    strain: ai ? 0 : puffer.strain, full: !ai && puffer.full,
    windAng: ai ? Math.PI / 2 : -Math.PI / 2, // 상대는 화면 위에서 아래 더미로 분다
    aimX: clamp((puffer.aimX || 0) * (ai ? -1 : 1), -1, 1), // 노리는 쪽으로 고개·눈동자·바람이 기운다 (상대는 마주 보므로 반대)
  });
  // 숨 주머니 고리: 내 얼굴엔 항상(절대 자). 상대 얼굴엔 가이드 단계에서만 (보이면 상대의 정답 숨을 베껴 쓸 수 있음)
  if (!blowing && (!ai || stage <= 1)) {
    drawPouchRing(ctx, S, { fill, full: !ai && puffer.full, over: puffer.p > F + 0.01, strain: ai ? 0 : puffer.strain, t });
  }
  // 지난 숨 고스트: 직전 볼 크기(절대값) — 결과 지식, 정답 아님
  if (!blowing && !ai && lastBreath.p != null && puffer.mode === 'charge') {
    const g = clamp(lastBreath.p / F, 0, 1);
    const cr = Math.sqrt(0.055 ** 2 + (0.137 ** 2 - 0.055 ** 2) * g), k = (cr - 0.055) / 0.082, cx = 0.17 + 0.085 * k;
    ctx.save(); ctx.scale(S, S); ctx.translate(0.5, 0.655);
    ctx.setLineDash([0.02, 0.018]); ctx.lineWidth = 0.01; ctx.strokeStyle = 'rgba(42,26,18,0.55)';
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(sg * cx, 0.075, cr, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  // 원호 게이지는 5차에서 삭제 — 정답 숨은 더미 위 '숨 물결'이 보여 준다(cues)
}

// ── 임팩트 연출 ─────────────────────────────────────────
function flash(a = 0.5) {
  const el = $('#flash');
  el.style.transition = 'none';
  el.style.opacity = String(a);
  void el.offsetWidth;
  el.style.transition = 'opacity 0.18s ease-out';
  el.style.opacity = '0';
}

// 뒤집혀 드러난 딱지에 '누구 것이 됐는지' 색 테두리 (나=파랑, 상대=빨강)
function ownerGlow(d, color) {
  const m = meshes.get(d.id);
  if (!m) return;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(DISC_R * 1.02, 0.06, 8, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = VIS_H / 2 + 0.01;
  m.add(ring);
  addTween(0.9, (k) => { ring.material.opacity = 0.95 * (1 - k * k); ring.scale.setScalar(1 + k * 0.15); }, () => { m.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
}

function shockwave(c, power) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.05, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(c.x, 0.03, c.z);
  scene.add(ring);
  addTween(0.45, (k) => {
    const sc = 1 + k * (2.5 + power * 2.5);
    ring.scale.set(sc, sc, sc);
    ring.material.opacity = 0.8 * (1 - k);
  }, () => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
}

// 마지막 1~3장: 긴장 카메라 + 심장박동 (Peggle 'Extreme Fever' 류 — 리서치)
let heartTimer = null;
function tension(on) {
  clearInterval(heartTimer);
  heartTimer = null;
  if (!on) { camZoom = 0; return; }
  camZoom = 0.22;
  const beat = () => { sfx.tone(55, 0.12, 'sine', 0.35); setTimeout(() => sfx.tone(50, 0.1, 'sine', 0.25), 160); };
  beat();
  heartTimer = setInterval(beat, 850);
}

// ── 메인 루프 ───────────────────────────────────────────
function addTween(dur, update, done) {
  return new Promise((res) => tweens.push({ t: 0, dur, update, done: () => { done && done(); res(); } }));
}

function syncMeshes() {
  if (!table) return;
  const items = [];
  for (const d of table.liveDiscs()) {
    const m = meshes.get(d.id);
    if (!m || m.userData.anim) continue;
    items.push({ id: d.id, body: d.body, mesh: m });
  }
  paper.apply(items); // 자세 = 물리 그대로, 높이 = 받침에 닿게 내린 배치(얇은 종이 더미에 틈이 안 뜨게, paper.js). 판이 있으면 매 프레임
}
// 화면용 조준점: 물리 조준점 g.aim(바람·판정은 이것 그대로)을 보이는 딱지 높이로 — 얇은 종이 더미는 물리보다 낮다(paper.js 배치)
function visAim(g) { const a = g.aim.clone(); a.y = paper.visY(a.y, g.center); return a; }

const simWatch = { revealed: new Set(), count: 0, lastClack: 0, vy: new Map(), resolve: null, simTime: 0, quiet: 0, glowed: new Set(), outShown: new Set(), outs: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  sweepTick(now); // 쓸기 연습판: 엄지 인식(gesture.tick)을 물리 스텝 전에 — 사건이 없어도 판정(연습판 밖이면 아무것도 안 함)
  const swClock = sweepClockOn(); // 쓸기 숨(푸 시작 ~ 숨 끝): 0.5배 고정 · 히트스톱·슬로모 무시(솔로 연습판만, 대결이면 늘 false)
  if (now < hitStopUntil && !swClock) dt = 0;
  expSlowKick(now); // 실험 공기 앞머리 연출: 충돌 멈칫이 끝난 첫 프레임에 슬로모(끄면 아무것도 안 함)
  // 슬로모
  const targetScale = now < slowUntil ? feel.slow : 1;
  timeScale = lerp(timeScale, targetScale, targetScale < timeScale ? 0.5 : 0.08);
  if (swClock) timeScale = 0.5; else if (sweep.clockEnded) { sweep.clockEnded = false; timeScale = 1; } // 쓸기 숨이 끝나면 바로 1배(lerp 없음)
  $('#vignette').style.opacity = String(swClock ? 0.3 : clamp((1 - timeScale) * 1.3, 0, 0.85));

  if (simOn && table && dt > 0) {
    acc += dt * timeScale;
    let n = 0;
    while (acc >= table.T.dt && n < 8) {
      table.step();
      acc -= table.T.dt;
      simWatch.simTime += table.T.dt;
      n++;
      // 실험(바람 도달 시간): 첫 바람·첫 움직임 측정, 공기가 처음 닿은 스텝에서 더미 쪽 단서(공기 앞머리 연출이면 충돌 멈칫 → 이 프레임 스텝을 여기서 멈춤)
      const A = airShot;
      if (A?.started && !match?.net) {
        expStep(A, now);
        if (A.lag && A.arrPhys == null && table.air?.arrivedT != null && expArrive(A)) break;
      }
      if (sweep.shot && sweepOn() && sweepAfterStep()) break; // 쓸기 연습판: 숨 기록 + 스텝 판정(판정 스텝에서 멈춤 = Node 측정과 같은 스텝 수). 연습판 밖 표에는 절대 안 돈다
    }
    if (sweep.shot && sweepOn()) sweepFrameSteps(n, swClock);
    syncMeshes();
    // 가장자리 밑으로 파고든 공기 → 위로 들어 올리는 입자 (왜 넘어가는지 보이게)
    if (table.lastHits) {
      for (const h of table.lastHits) {
        const k = h.s * h.liftF;
        if (k < 0.05 || Math.random() > 0.55) continue;
        fx.emit({ at: h.e, n: 2, color: 0xe2f6ff, speed: 0.35, up: 1.6 + k * 3, life: 0.45, size: 0.15 + k * 0.12, gravity: -2.5, dir: { x: h.dir.x * 2.4, y: 0.4, z: h.dir.z * 2.4 } });
        if (k > 0.18 && !simWatch.glowed.has(h.id)) {
          simWatch.glowed.add(h.id);
          fx.emit({ at: h.e, n: 1, color: 0xffffff, speed: 0, up: 0, life: 0.3, size: 0.55, gravity: 0 });
        }
      }
    }
    watchSim();
  }
  if (match?.net) netFrame(dt, now); // PvP: 미리 시뮬·궤적 재생(솔로는 안 지나감)
  expFrame(); // 실험(바람 도달 시간): 와류 고리·부는 얼굴 유지·수치 표시. 끄면 표시만 숨김
  // 트윈
  stepTweens(dt);
  if (table) syncMeshes(); // 물리가 쉬는 동안(조준·턴 사이·히트스톱·대결 대기)에도 배치를 유지 — 트윈에서 막 돌아온 장도 이번 프레임에 자리로
  paper.tick(now, dt * timeScale); // 배치 높이·휨 따라가기(실제 시간)·착지 휘청(게임 시간: 슬로모·멈칫 따라감)
  fx.update(dt * (0.4 + 0.6 * timeScale));
  // 카메라
  shake *= Math.pow(0.02, dt);
  const sh = shake;
  const target = camTarget.clone();
  if (table && state === 'match') target.y += clamp(table.columnTop() * 0.25, 0, 1.2);
  camAim += ((state === 'match' ? camAimGoal : 0) - camAim) * Math.min(1, dt * 5);
  camStrafe += ((state === 'match' && fpvOn() ? camStrafeGoal : 0) - camStrafe) * Math.min(1, dt * 6);
  const poseGoal = state === 'match' && fpvOn() && pose === 'low' && (myTurn.on || performance.now() < myTurn.until + 450) ? (reducedMotion ? 0.5 : 1) : 0;
  poseK += (poseGoal - poseK) * Math.min(1, dt * 6);
  let aimPos = camAimPos;
  if (camAim > 0.001 && table) {
    const top = table.columnTop();
    if (sweepOn()) { // 쓸기 연습판: 낮은 앞-옆 시점 + 고개 따라 피치(sweepView)
      const v = sweepView(top);
      aimPos = v.pos;
      target.lerp(v.target, camAim);
    } else if (fpvOn()) {
      // 1인칭(6차): 입 높이에서 더미를 바라본다 — 10장 옆면 121px·폭 87% (three.js 투영 계산), 더미는 아래 입술·볼 위에
      const portrait = window.innerWidth / window.innerHeight < 0.85;
      // 9차 책상 자세: 고개를 책상까지 숙임 — 더미 앞 가운데가 화면 같은 높이(±4px)에 오게 시선을 맞춤(설계 패널)
      const eyeP = new THREE.Vector3(0, top * 0.7 + (portrait ? 1.0 : 0.9), portrait ? 5.2 : 4.6), lowP = new THREE.Vector3(0, 0.36, portrait ? 4.9 : 4.4);
      aimPos = eyeP.lerp(lowP, poseK).addScaledVector(camStrafeSide, camStrafe);
      target.lerp(new THREE.Vector3(0, top * 0.5, 0).lerp(new THREE.Vector3(0, 0.12 + 0.667 * top, 0), poseK).addScaledVector(camStrafeSide, camStrafe), camAim);
    } else target.lerp(camAimTarget.clone().setY(top * 0.5), camAim);
  }
  const pos = camBase.clone().lerp(aimPos, camAim).lerp(new THREE.Vector3(0, 1, 0), camZoom);
  pos.x += (Math.random() - 0.5) * sh; pos.y += (Math.random() - 0.5) * sh;
  if (state === 'home') {
    const a = now * 0.00012;
    pos.set(Math.sin(a) * 12.5, 7.2, Math.cos(a) * 12.5);
    target.set(0, 2.2, 0);
  }
  camera.position.lerp(pos, state === 'home' ? 1 : 0.2);
  camera.lookAt(target);
  if (state === 'home') for (const m of homeMeshes) m.rotation.y += dt * 0.15;
  if (puffer.mode !== puffer._m) { puffer._m = puffer.mode; puffer._t0 = performance.now(); } // drawFPV 도 이 시계를 씀
  const meFpv = fpvOn() && puffer.who === 'me'; // 이때 #puffWrap 은 숨김 → 그리지 않는다(성능)
  if (puffer.mode !== 'hidden' && !meFpv) drawPuffer();
  drawBreath(Math.min(0.05, (now - (frame._last || now)) / 1000));
  drawFPV(now);
  if (breath.mode === 'charge' && breath.aim && state === 'match') {
    const bc = $('#breath'), bctx = bc.getContext('2d'), bdpr = bc._dpr || 1;
    // 거꾸로 T(꽉 눈금)는 1인칭에서는 그리지 않는다: 볼이 차오르고 꽉이면 납작해지는 것이 같은 '절대 자'다 (재윤님 7차 '이게 뭔지 모르겠다')
    if (breath.press && breath.who === 'me' && !fpvOn()) drawThumbTick(bctx, bdpr);
    drawSlideArrow(bctx, bdpr);
  }
  sweepDraw(now); // 쓸기 연습판: 바람 자국·리본·바닥 입·엄지 궤적·손가락 시범·숨 소리(연습판 밖이면 숨김만)
  drawTapGuide(now);
  drawLipLine();
  // 물안경 렌즈 테(파란 선)는 그리지 않는다 — 재윤님 10차 '이상하다'. 효과는 숨 물결(초록 띠)과 칩 불빛으로만 (설계서 v2 §8.2)
  updateRail();
  drawPocketHint(now);
  updateCues(now);
  drawReceipt(now);
  $('#puffWrap').classList.toggle('fpvhide', fpvOn() && puffer.who === 'me'); // 1인칭 모드: 내 정면 얼굴은 안 보임(상대 차례엔 상대 얼굴)
  frame._last = now;
  renderer.render(scene, camera);
}

function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.update(k);
    if (k >= 1) { tweens.splice(i, 1); tw.done(); }
  }
}

function watchSim() {
  // 착지 '탁' 소리 + 뒤집혀 드러나는 순간 연출
  const now = performance.now();
  trailStep();
  for (const d of table.liveDiscs()) {
    const v = d.body.linvel();
    const prev = simWatch.vy.get(d.id) ?? 0;
    if (prev < -1.2 && v.y > -0.3 && now - simWatch.lastClack > 35) {
      sfx.clack(Math.min(1, -prev / 6));
      simWatch.lastClack = now;
    }
    if (prev < -1.2 && v.y > -0.3) { // 종이 탄성: 착지한 장마다 가장자리 휘청(그림만)
      paper.land(meshes.get(d.id), Math.min(1, -prev / 6));
    }
    simWatch.vy.set(d.id, v.y);
    const up = table.faceUp(d);
    const speed = Math.hypot(v.x, v.y, v.z);
    if (up > 0.5 && speed < 2.2 && !simWatch.revealed.has(d.id) && !table.inCircle(d)) {
      if (!simWatch.outShown.has(d.id) && !d.off) {
        simWatch.outShown.add(d.id);
        const p = d.body.translation();
        fx.text(new THREE.Vector3(p.x, p.y + 0.5, p.z), 'OUT', 'out');
        sfx.tone(196, 0.12, 'square', 0.05);
      }
    } else if (up > 0.5 && speed < 2.2 && !simWatch.revealed.has(d.id)) {
      simWatch.revealed.add(d.id);
      simWatch.count++;
      // 쓸기 연습판 30장 이상: 뒤집힘 틱은 40 ms 에 하나로 묶고 음높이는 15번째(3.5 kHz)에서 멈춤 — 5장마다 한 옥타브라 24번째부터 배음이 22 kHz 를 넘어 안 들렸다(검토 2)
      if (!(sweepOn() && match.n >= 30 && now - sweep.lastFlipSnd < 40)) { sfx.flip(sweepOn() ? Math.min(simWatch.count - 1, 14) : simWatch.count - 1); sweep.lastFlipSnd = now; }
      const p = d.body.translation();
      const c = CARD_BY_ID[d.cardId];
      fx.emit({ at: { x: p.x, y: p.y + 0.1, z: p.z }, n: 14 + (c.rarity !== 'common' ? 16 : 0), color: new THREE.Color(RARITY[c.rarity].ring[1]).getHex(), speed: 2.5, up: 3, life: 0.7, size: 0.22 });
      if (!sweepOn()) fx.text(new THREE.Vector3(p.x, p.y + 0.6, p.z), '+1', 'plus'); // 연습판(보상 없음)은 '+1'·희귀도 글자 없이 반짝이만
      ownerGlow(d, simWatch.shooter === 'ai' ? 0xff4d5e : 0x3a8fe0);
      if (c.rarity !== 'common' && !sweepOn()) fx.text(new THREE.Vector3(p.x, p.y + 1.1, p.z), RARITY[c.rarity].label, 'rar r-' + c.rarity);
      if (simWatch.count >= 4 && !sweepOn()) { slowUntil = Math.max(slowUntil, now + 450); camZoom = Math.min(0.28, camZoom + 0.04); } // 쓸기 샷은 '4장 이상 슬로모 연장' 없음(숨 단계 0.5배로 바꿈)
      if (sweepOn()) sweepFlipVib(now); else navigator.vibrate?.(12);
    } else if (up < 0.2 && simWatch.revealed.has(d.id)) {
      simWatch.revealed.delete(d.id); // 다시 엎어짐
      simWatch.count = Math.max(0, simWatch.count - 1);
    }
  }
  // 정지 판정: 기대 선 딱지의 미세 떨림 때문에 영원히 안 멈추는 경우가 있어(실측) 2.5초 이후엔 느린 떨림도 정지로 본다. 상한 5초.
  const ms = table.maxSpeed();
  const settled = !table.puff && simWatch.simTime > 0.6 && (ms < 0.08 || (simWatch.simTime > 2.5 && ms < 0.5));
  simWatch.quiet = settled ? simWatch.quiet + 1 : 0;
  if ((simWatch.quiet > 12 || simWatch.simTime > 5) && simWatch.resolve) {
    const r = simWatch.resolve;
    simWatch.resolve = null;
    r();
  }
}

// ── 화면 전환 ───────────────────────────────────────────
function show(id) {
  for (const s of ['#home', '#hud', '#result', '#album', '#boot', '#sheet', '#map']) $(s).hidden = s !== id;
}

function refreshTexts() {
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  $('#langBtn').textContent = t('lang');
  $('#sweepBtn').hidden = !(feel.core >= 0.5); // 조작 깃발 '쓸어 올리기'를 켜면 홈에 '쓸기 연습'
  $('#swGNote').textContent = t(sweepGB() ? 'swGbNote' : 'swPuckNote'); // 연습 시트: 지금 문법의 한 줄
  $('#micBtn').textContent = micEnabled ? t('micOn') : t('micOff');
  $('#invCount').textContent = Store.total(profile);
  $('#albumProg').textContent = `${Store.ownedKinds(profile)}/${CARDS.length}`;
  $('#sheetBtn').classList.toggle('ready', sheetReady());
  $('#dailyBtn').textContent = `${t('daily')} #${dayNumber()}`;
  $('#playLv').textContent = `${t('levelWord')} ${prog().level}`;
  $('#sndBtn').setAttribute('aria-pressed', String(!sfx.muted));
  $('#sndBtn').classList.toggle('off', sfx.muted);
  const max = Store.maxStake(profile);
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('#chips button').forEach((b) => {
    const n = +b.dataset.n;
    b.disabled = n > max;
    b.classList.toggle('on', n === stakeN);
  });
  if (stakeN > max) stakeN = [5, 10, 20].filter((n) => n <= max).pop() || 5;
}

function clearMatchMeshes() {
  clearPocket();
  trailStart(null); cue.receipt = null; cue.snap = null; hideCues();
  for (const m of meshes.values()) scene.remove(m);
  meshes.clear();
  for (const who of ['me', 'ai']) { for (const m of piles[who]) scene.remove(m); piles[who] = []; }
}

// 무료 딱지판: 마분지 판에서 동그라미를 톡톡 떼어내는 개봉 의식 (TCG Pocket 팩 개봉을 한국 문방구 '판딱지'로 — 리서치)
// 목업에선 쿨다운 2분(기획: 12시간, 최대 2장 적립)
const SHEET_COOLDOWN = 2 * 60 * 1000;
function sheetReady() { return Date.now() - (profile.lastSheet || 0) >= SHEET_COOLDOWN; }
function openSheet() {
  if (!sheetReady()) { toast(t('sheetWait')); return; }
  sfx.unlock(); sfx.pop();
  const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  const ids = Array.from({ length: 6 }, (_, i) => rollCard(rng, i === 5 ? 'rare' : null)); // 마지막 칸은 레어 이상 확정
  const before = new Set(Object.keys(profile.inv).filter((k) => profile.inv[k] > 0));
  const grid = $('#sheetGrid');
  grid.innerHTML = '';
  let opened = 0;
  ids.forEach((id, i) => {
    const c = CARD_BY_ID[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pop';
    b.setAttribute('aria-label', 'ddakji ' + (i + 1));
    b.innerHTML = `<span class="f back"><img alt="" src="${backImage()}"></span><span class="f face r-${c.rarity}"><img alt="${cardName(c)}" src="${faceImage(id, 80)}"></span>`;
    if (c.rarity !== 'common') b.classList.add('glow');
    b.onclick = () => {
      if (b.classList.contains('open')) return;
      b.classList.add('open');
      sfx.clack(1);
      setTimeout(() => {
        sfx.flip(opened);
        if (c.rarity !== 'common') sfx.big();
        if (!before.has(id)) { const em = document.createElement('em'); em.textContent = t('newCard'); b.appendChild(em); }
      }, 180);
      opened++;
      profile.inv[id] = (profile.inv[id] || 0) + 1;
      if (opened === ids.length) {
        profile.lastSheet = Date.now();
        Store.save(profile);
        $('#sheetDone').hidden = false;
      }
    };
    grid.appendChild(b);
  });
  $('#sheetDone').hidden = true;
  show('#sheet');
}

let backUrl = null;
function backImage() {
  if (backUrl) return backUrl;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 160;
  drawBack(cv.getContext('2d'), 160);
  backUrl = cv.toDataURL('image/png');
  return backUrl;
}

function goHome() {
  runId++;
  netStop(); // PvP 정리(방 나가기·구독 끊기·월드 반납). 솔로면 아무것도 안 함
  sweepStop(); // 쓸기 연습판 정리(입력·숨·시계·소리·카드). 연습판이 아니면 표시만 숨김
  $('#dailyCard').hidden = true;
  $('#lvResult').hidden = true;
  $('#lvIntro').hidden = true;
  $('#freeSheet').hidden = true;
  $('#potLbl').textContent = t('pot');
  $('#hud').classList.remove('no-pot');
  cancelInput?.();
  tension(false);
  simWatch.resolve = null;
  puffer.who = 'me'; $('#puffWrap').classList.remove('ai'); myTurn.on = false; cue.receipt = null; pose = 'eye'; gogglesOn = false;
  // 파산 방지: 딱지가 바닥나면 문방구 할머니가 기본 딱지 10장 (리서치: 빈털터리 방지)
  if (Store.maxStake(profile) < 5) {
    const rng = mulberry32((Date.now() & 0xffff) + 11);
    const commons = CARDS.filter((c) => c.rarity === 'common');
    for (let i = 0; i < 10; i++) { const id = commons[Math.floor(rng() * commons.length)].id; profile.inv[id] = (profile.inv[id] || 0) + 1; }
    Store.save(profile);
    setTimeout(() => toast(t('grandma')), 600);
  }
  state = 'home';
  puffer.mode = 'hidden';
  hideGizmo();
  clearMatchMeshes();
  if (match?.sweep) { // 쓸기 연습판에서 나감: 더미 월드 반납 + 문지기 끔(홈에서 sweepOn() 이 참으로 남지 않게)
    if (table && !table.puppet) { try { table.world.free(); } catch (e) { /* 이미 반납 */ } }
    match.sweep = false;
  }
  table = null;
  simOn = false;
  camZoom = 0;
  // 홈 장식: 딱지 탑
  for (const m of homeMeshes) scene.remove(m);
  homeMeshes = [];
  const rng = mulberry32(7);
  const ids = Object.keys(profile.inv).filter((k) => profile.inv[k] > 0);
  const towerN = clamp(Store.total(profile), 4, 30); // 내 딱지가 늘면 홈의 탑도 높아진다(자산이 '보이게' 쌓임)
  for (let i = 0; i < towerN; i++) {
    const id = ids[Math.floor(rng() * ids.length)] || 'mandu';
    const m = makeDiscMesh(id);
    m.position.set((rng() - 0.5) * 0.12, pileY(i), (rng() - 0.5) * 0.12);
    m.rotation.y = rng() * 6.28;
    m.rotation.x = i === towerN - 1 ? 0 : Math.PI;
    scene.add(m);
    homeMeshes.push(m);
  }
  // 펼쳐 놓은 딱지 몇 장
  const showIds = ['horangi', 'gumiho', 'king', 'dokkaebi', 'mandu', 'kimchi'];
  showIds.forEach((id, i) => {
    const m = makeDiscMesh(id);
    const a = (i / showIds.length) * Math.PI * 2;
    m.position.set(Math.cos(a) * 3.2, VIS_H / 2, Math.sin(a) * 3.2);
    m.rotation.y = -a + Math.PI / 2;
    setBend(m, -0.012 - 0.004 * (i % 3), i * 1.3); // 쓰던 도화지 딱지: 가장자리가 살짝 들림
    scene.add(m);
    homeMeshes.push(m);
  });
  refreshTexts();
  show('#home');
  maybeOfferMic(); // 판 결과를 닫고 돌아온 자리(홈, 또는 곧 지도)에서만 — 경기 도중엔 안 띄운다
}

// ── 매치 ───────────────────────────────────────────────
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function aiStakeFor(n, rng) {
  // 상대 판돈: 일반 위주 + 내가 없는 레어 1장(미끼) 보장 → "저거 따고 싶다"
  const out = [];
  const missing = CARDS.filter((c) => c.rarity !== 'common' && !(profile.inv[c.id] > 0));
  if (missing.length) out.push(missing[Math.floor(rng() * missing.length)].id);
  while (out.length < n) out.push(rollCard(rng, null));
  return out;
}

async function startMatch(opts = {}) {
  sfx.unlock();
  const my = ++runId;
  sweepStop(); // 쓸기 연습판 흔적(입력·숨·시계·카드·자국)을 고전 판으로 끌고 오지 않는다(goHome 을 거치지 않는 진입 대비)
  for (const m of homeMeshes) scene.remove(m);
  homeMeshes = [];
  const lv = opts.level || null;
  micOfferArmed = false; cue.receipt = null; // 지난 판의 마이크 제안 무장·'방금 숨' 카드를 새 판으로 끌고 오지 않는다
  lastBreath.aim = null; // 레벨의 라이벌 판: '레벨용 딱지'로 겨룸 → 내 컬렉션은 잃지 않음
  const seed = lv ? lv.seed >>> 0 : (Math.floor(performance.now() * 1000) ^ 0x5bd1e995) >>> 0;
  const rng = mulberry32(seed);
  // 첫 판 = 연습 판: 친선·5장씩·내가 먼저·상대 약하게 (첫 경험에서 바로 '우수수'를 맛보게 — 리서치 10장)
  const practice = !lv && profile.stats.matches === 0;
  const n = lv ? lv.stake : practice ? 5 : stakeN;
  const myStake = lv ? Array.from({ length: n }, () => rollCard(rng, null)) : Store.pickStake(profile, n, rng);
  if (myStake.length < n) { toast(t('notEnough')); return; }
  const aiStake = aiStakeFor(n, rng);
  const pot = shuffle([...myStake.map((id) => ({ id, from: 'me' })), ...aiStake.map((id) => ({ id, from: 'ai' }))], rng);
  const rv = lv ? RIVALS.find((r) => r.id === lv.rival) : null;
  const rivalName = rv ? (getLang() === 'ko' ? rv.ko : rv.en) : t('rivals')[Math.floor(rng() * 5)];
  const rivalCard = rv ? CARD_BY_ID[rv.card] : CARDS[Math.floor(rng() * CARDS.length)];
  match = { seed, rng, myStake, aiStake, pot, rivalName, rivalCard, mode: practice || lv ? 'fun' : mode, practice, n, level: lv, aiSkill: lv ? lv.aiSkill : 1, turn: 'me', turnNo: 0, best: 0, flipsMe: 0 };
  table = new Table(seed, { lift: 519.59 * feel.wind });
  table.addPile(pot.map((p) => p.id));
  table.discs.forEach((d, i) => { d.from = pot[i].from; });
  table.settle();
  clearMatchMeshes();
  for (const d of table.discs) {
    const m = makeDiscMesh(d.cardId);
    meshes.set(d.id, m);
    scene.add(m);
  }
  syncMeshes();
  state = 'match'; pose = 'eye'; gogglesOn = false;
  camZoom = 0;
  snapCam();
  $('#rivalName').textContent = rivalName;
  $('#rivalAva').src = faceImage(rivalCard.id, 48);
  $('#meScore').textContent = '0';
  $('#aiScore').textContent = '0';
  $('#potN').textContent = String(pot.length);
  $('#potLbl').textContent = t('pot');
  // 레벨의 라이벌 판엔 판돈(POT) 상자를 쓰지 않는다(GDD §9.9 P0-5: POT 은 자유 대전 안에서만). 라벨 단어는 그대로(결정 대기) — 상자만 숨김(자리는 유지)
  $('#hud').classList.toggle('no-pot', !!lv);
  puffer.mode = 'idle';
  puffer.p = 0;
  show('#hud');
  await vsSplash();
  if (my !== runId) return;
  await introDrop();
  if (my !== runId) return;
  // 레벨 라이벌은 플레이어 선공, 보스판은 보스가 먼저 분다 (선공 이점 — GDD 시뮬레이션 확인)
  // 라이벌판도 원작처럼 가위바위보로 선공 (3차 실측: 작은 판은 선공이 승부를 거의 정한다). 보스판만 보스 선공
  match.turn = match.level ? (match.level.role === 'boss' ? 'ai' : await rps()) : match.practice ? 'me' : await rps();
  if (my !== runId) return;
  await gameLoop(my);
}

async function vsSplash() {
  const el = $('#vs');
  const bait = match.aiStake.map((id) => CARD_BY_ID[id]).find((c) => c.rarity !== 'common');
  $('#vsMe').textContent = `${t('you')} · ${match.n}`;
  $('#vsAi').textContent = `${match.rivalName} · ${match.n}`;
  $('#vsBait').innerHTML = bait ? `<span class="bounty">${t('bounty')}</span> <img alt="" src="${faceImage(bait.id, 40)}"> <b class="r-${bait.rarity}">${cardName(bait)}</b>` : '';
  $('#vsMode').textContent = match.level ? `${t('levelWord')} ${match.level.n}` : match.practice ? t('practice') : match.mode === 'fun' ? t('modeFun') : t('modeKeeps');
  if (match.level) $('#vsBait').innerHTML = '';
  el.hidden = false;
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  sfx.whoosh();
  await wait(1700);
  el.hidden = true;
}

async function introDrop() {
  // 딱지가 하나씩 쌓이는 연출 (물리 결과 위치로 떨어짐)
  const live = table.liveDiscs();
  const finals = live.map((d) => ({ m: meshes.get(d.id), p: meshes.get(d.id).position.clone() }));
  for (const f of finals) { f.m.position.y += 6; f.m.visible = false; f.m.userData.anim = true; }
  for (let i = 0; i < finals.length; i++) {
    const f = finals[i];
    f.m.visible = true;
    const y0 = f.p.y + 4;
    addTween(0.22, (k) => { f.m.position.y = lerp(y0, f.p.y, k * k); }, () => { f.m.userData.anim = false; sfx.clack(0.5); paper.land(f.m, 0.5); });
    await wait(Math.max(30, 110 - i * 3));
  }
  await wait(300);
}

// 선공 정하기: 가위바위보 (세계 공통 + 한국 놀이 문화 그대로, 공정성 장치 — 리서치)
const HANDS = ['rock', 'scissors', 'paper'];
const HAND_ICON = { rock: '✊', scissors: '✌️', paper: '✋' };
async function rps() {
  const el = $('#rps');
  for (let round = 0; round < 3; round++) {
    el.hidden = false;
    $('#rpsTitle').textContent = t('rps');
    $('#rpsAi').textContent = '❔';
    $('#rpsRes').textContent = '';
    el.querySelectorAll('button').forEach((b) => { b.disabled = false; b.classList.remove('pick'); });
    const mine = await new Promise((res) => el.querySelectorAll('button').forEach((b) => { b.onclick = () => { sfx.unlock(); sfx.pop(); res(b.dataset.h); }; }));
    el.querySelectorAll('button').forEach((b) => { b.disabled = true; b.classList.toggle('pick', b.dataset.h === mine); });
    const ai = HANDS[Math.floor(match.rng() * 3)];
    await wait(250);
    $('#rpsAi').textContent = HAND_ICON[ai];
    sfx.clack(1);
    const win = (mine === 'rock' && ai === 'scissors') || (mine === 'scissors' && ai === 'paper') || (mine === 'paper' && ai === 'rock');
    if (mine !== ai) {
      $('#rpsRes').textContent = win ? t('rpsWin') : t('rpsLose');
      await wait(900);
      el.hidden = true;
      return win ? 'me' : 'ai';
    }
    $('#rpsRes').textContent = t('rpsDraw');
    await wait(800);
  }
  el.hidden = true;
  return match.rng() < 0.5 ? 'me' : 'ai';
}

async function gameLoop(my) {
  const alive = () => my === runId && table;
  while (alive() && table.liveDiscs().length > 0 && match.turnNo < MAX_TURNS) {
    const who = match.turn;
    await banner(who === 'me' ? t('yourTurn') : t('rivalTurn'), who === 'me' ? 'b-me' : 'b-ai');
    const left = table.liveDiscs().length;
    tension(left <= 3);
    const shot = who === 'me' ? await playerShot() : await aiShot();
    tension(false);
    if (!alive() || !shot) return; // 홈으로 나감
    await blow(shot, who);
    const flipped = await simulate();
    if (!alive()) return;
    await react(flipped, who);
    await collect(flipped, who);
    if (!alive()) return;
    if (who === 'me' && flipped.length >= 5) match.bigPuff = true; // 마이크 제안은 판 결과를 닫은 뒤에(maybeOfferMic) — 경기 도중엔 끊지 않는다
    if (table.liveDiscs().length === 0) break;
    await restack();
    if (!alive()) return;
    match.turn = who === 'me' ? 'ai' : 'me';
    match.turnNo++;
  }
  if (!alive()) return;
  await endMatch();
}

function banner(text, cls) {
  const el = $('#banner');
  el.textContent = text;
  el.className = 'banner ' + cls;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('go');
  sfx.pop();
  return wait(900).then(() => { el.hidden = true; });
}

function bigText(text, cls) {
  const el = $('#big');
  el.textContent = text;
  el.className = 'big ' + cls;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('go');
  return wait(1150).then(() => { el.hidden = true; });
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 2200);
}

// 플레이어 입력: 누르고(조준) → 당기고(파워) → 놓기
const ray = new THREE.Raycaster();
function pointerAim(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
  const ny = -((ev.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const c = table.pileCenter();
  const body = camera.position.clone().addScaledVector(camStrafeSide, -camStrafe); // 옆걸음 전 몸 자리
  const toCam = new THREE.Vector3(body.x - c.x, 0, body.z - c.z).normalize();
  // PvP: 쏜 사람의 바람은 늘 정규 좌표 −z(ShotRun 과 같은 기하, 좌우 공평성을 잰 방향)
  const dir = match?.net ? new THREE.Vector3(NET_CANON.x, 0, NET_CANON.z) : toCam.clone().negate();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const top = table.columnTop();
  const vtop = paper.visY(top, c); // 보이는 꼭대기: 얇은 종이 더미는 물리보다 낮다(paper.js 배치) → 손가락은 보이는 딱지를, 조준 h 는 physY 로 물리 높이
  // 누른 곳 = 바람이 닿는 곳 (재윤님 4차: 좌우·상하 모두). 표적은 손가락 바로 밑, 당기는 동안 움직이지 않는다.
  // 터치 광선을 실제 원기둥(반지름 R, 높이 0~top)에 쏴서 맞은 점을 그대로 쓴다.
  // (전에는 더미 중심을 지나는 세로 평면에서 읽어서, 위에서 내려다보는 카메라로는 표적이 손가락보다 0.25~0.7 아래에 찍혔다 — 4차 교차 검토)
  const o = ray.ray.origin, v = ray.ray.direction;
  const ox = o.x - c.x, oz = o.z - c.z;
  const qa = v.x * v.x + v.z * v.z, qb = 2 * (ox * v.x + oz * v.z), qc = ox * ox + oz * oz - DISC_R * DISC_R;
  const disc = qb * qb - 4 * qa * qc;
  let hit = null;
  if (qa > 1e-6 && disc >= 0) {
    const t = (-qb - Math.sqrt(disc)) / (2 * qa);
    const y = o.y + t * v.y;
    if (y <= vtop) hit = new THREE.Vector3(o.x + t * v.x, Math.max(0.015, y), o.z + t * v.z); // 옆면(아래로 넘치면 맨 아래)
    else if (v.y < 0) {
      const tt = (vtop - o.y) / v.y; // 옆면 위로 넘치면 윗면을 누른 것 → 맨 위 층
      hit = new THREE.Vector3(o.x + tt * v.x, vtop - 0.01, o.z + tt * v.z);
    }
  }
  if (!hit) {
    // 더미 바깥(옆)을 누름: 중심 세로 평면으로 읽어 가장자리로 붙인다
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(toCam, new THREE.Vector3(c.x, 0, c.z));
    hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
  }
  const lat = clamp(new THREE.Vector3(hit.x - c.x, 0, hit.z - c.z).dot(side), -0.9 * DISC_R, 0.9 * DISC_R);
  const h = clamp(paper.physY(hit.y, c), 0.03, Math.max(0.05, top - 0.02)); // 보이는 높이 → 물리 높이
  return { dir: { x: dir.x, z: dir.z }, lat, h, power: 0 };
}

function playerShot() {
  return new Promise((resolve) => {
    const el = renderer.domElement;
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    let aiming = null;
    let inhale = null;
    let micPeak = 0, micBlowing = false, micTimer = null, micAbove = 0;
    const F = Rules.POUCH_FULL;
    camAimGoal = 1; // 조준 시점으로
    myTurn.on = true; myTurn.t0 = performance.now(); myTurn.pressed = false;
    // ── 숨 주머니: 꽉 래치 · 버팀 · 콜록 (3차 설계 패널 A안) ──
    const resetPouch = () => {
      puffer.strain = breath.strain = 0;
      puffer.full = breath.full = false;
      breath.over = false;
      breath.press = null;
    };
    const updatePouch = () => {
      const was = aiming.full;
      aiming.full = Rules.fullLatch(aiming.power, was);
      if (aiming.full && !was) { sfx.cork(); navigator.vibrate?.(25); inhale?.hold(); } // 꽉: '읍' + 손끝 톡 + 들숨 소리 끊김
      if (!aiming.full && was) inhale?.resume();
      puffer.full = breath.full = aiming.full;
      breath.over = aiming.power > F + 0.01;
    };
    // 콜록: 꽉에서 너무 오래 참음 → 숨이 터져 나가 취소. 숨·차례는 쓰지 않는다 (재윤님 4차 결정)
    const cough = () => {
      profile.coughs = (profile.coughs || 0) + 1;
      sfx.cough();
      navigator.vibrate?.([40, 60, 40]);
      aiming = null;
      inhale?.stop(); inhale = null;
      hideGizmo();
      resetPouch();
      puffer.mode = 'cough'; puffer.p = 0;
      breathFeedback(0, 'me', 'fbCough');
      setTimeout(() => { if (puffer.mode === 'cough') puffer.mode = 'idle'; }, 700);
      unpress();
    };
    let raf = 0, lastT = 0, leakAt = 0, pulseAt = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (!aiming || (micEnabled && mic.ready)) { lastT = 0; return; }
      const dt = lastT ? Math.min(50, now - lastT) : 0; // 백그라운드에서 돌아와도 한꺼번에 콜록하지 않게 50ms 상한
      lastT = now;
      if (aiming.beat || aiming.bc) {
        // 콩닥 숨: 당긴 숨(가운데) + 박동 → 볼·물결·숨 줄기가 모두 유효 숨으로 오르내림. 꽉 래치·버팀은 당긴 숨 기준(안정)
        if (aiming.bc) aiming.eff = aiming.bc.to(now - aiming.bcT0, aiming.power); // PvP: 고정 30Hz 하위 스텝(turn.js BeatClock, 턴 시드)
        else {
          const off = Rules.beatStep(aiming.beat, dt, now - aiming.beat.t0, aiming.power / F, feel.beat, aiming.beat.rng);
          aiming.eff = clamp(aiming.power + sweetHiFor(aiming.n) * off, 0, POWER_MAX);
          aiming.beat.buf.push({ t: now, eff: aiming.eff });
          while (aiming.beat.buf.length > 2 && aiming.beat.buf[0].t < now - 400) aiming.beat.buf.shift();
        }
        if (aiming.bc) netAimPresence(aiming);
        puffer.p = aiming.eff;
        breath.over = aiming.eff > F + 0.01;
        inhale?.set(aiming.eff / F);
        if (aiming.power >= 0.05) { showGizmo({ ...aiming, power: aiming.eff }, powerColor()); showCues({ ...aiming, power: aiming.eff }); }
      }
      aiming.strain = Rules.strainStep(aiming.strain || 0, aiming.power, dt, aiming.full, feel.strainMs);
      puffer.strain = breath.strain = aiming.strain;
      if (aiming.strain >= Rules.LEAK_AT && now >= leakAt) { sfx.leak(); leakAt = now + lerp(260, 140, (aiming.strain - Rules.LEAK_AT) / (1 - Rules.LEAK_AT)); }
      if (breath.over && now >= pulseAt) { chalkPulse(); pulseAt = now + 500; } // 꽉 너머: 분필 원이 빨갛게 — '넘치면 원 밖으로' 예고
      if (aiming.strain >= 1) cough();
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => { if (document.hidden) cancel(); };
    const first = profile.firstPlay;
    $('#hint').hidden = false;
    $('#hint').className = 'hint' + (first ? ' first' : '');
    $('#hintText').textContent = micEnabled && mic.ready ? t('hintMic') : `${t('hintAim')} · ${t('hintPull')}`;
    cancelInput = () => finish(null);
    // PvP 샷 시계가 다 되면: 누르고 있으면 그 숨으로, 아니면 헛숨(아무 데나 숨 0)
    if (match?.net) match.net.forceFire = () => {
      if (aiming && !(micEnabled && mic.ready) && aiming.power >= 0.06) { up(null); return; }
      const top = table ? table.columnTop() : 1;
      aiming = null; hideGizmo(); resetPouch(); inhale?.stop(); inhale = null;
      finish({ dir: { ...NET_CANON }, lat: 0, h: Math.max(0.03, top * 0.8), power: 0, auto: true, pose });
    };
    const finish = (shot) => {
      cancelInput = null;
      if (match?.net) { match.net.forceFire = null; netAimPresence(null); }
      myTurn.on = false;
      myTurn.until = shot ? performance.now() + 650 : 0; // 불고 난 뒤 잠깐 볼이 꺼지는 모습까지
      hideCues();
      // 불고 나면 뒤집히는 장면을 보도록 원래 시점으로. 실험 공기 앞머리 연출이면 공기가 더미에 닿을 때부터(blow → A.onArrive)
      if (!(shot && expAirOn())) { camAimGoal = 0; camStrafeGoal = 0; }
      cancelAnimationFrame(raf);
      resetPouch();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', cancel);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      clearInterval(micTimer);
      $('#hint').hidden = true;
      inhale?.stop();
      resolve(shot);
    };
    const down = (ev) => {
      if (state !== 'match') return;
      sfx.unlock();
      const s = pointerAim(ev);
      if (!s) return;
      aiming = { ...s, sx: ev.clientX, sy: ev.clientY, full: false, strain: 0, pose };
      const my = Rules.mouthYFor(pose); if (my != null) aiming.mouthY = my; // 눈높이는 mouthY 를 아예 안 넘김(물리 비트 동일)
      if (match?.net) { // PvP: 박동은 판 설정 등급 + 턴 시드(beatSeed)로, 고정 30Hz 하위 스텝 → 놓은 뒤 누구나 trace 로 다시 계산
        const M = match.net;
        if (M.beatTier >= 1 && !(micEnabled && mic.ready) && M.cur?.seeds) { aiming.n = liveCount(); aiming.bc = new BeatClock(M.cur.seeds.beat, M.beatTier, aiming.n); aiming.bcT0 = performance.now(); aiming.eff = 0; }
      } else if (beatOn()) { aiming.n = liveCount(); aiming.beat = { ph: 0, k: 0, u: 0, t0: performance.now(), buf: [], rng: mulberry32((Math.random() * 2 ** 31) | 0) }; aiming.eff = 0; } // 박동 난수는 경기 rng 와 따로(켜고 꺼도 상대·판 흐름이 같게)
      myTurn.pressed = true;
      camStrafeSide.set(-s.dir.z, 0, s.dir.x).normalize(); camStrafeGoal = s.lat || 0; // 몸이 표적 쪽으로 옆걸음
      try { el.setPointerCapture?.(ev.pointerId); } catch (e) { /* 합성 포인터(?pvpbot)는 잡을 포인터가 없다 */ }
      if (match?.net) netAimPresence(aiming);
      puffer.mode = 'charge';
      puffer.p = 0;
      resetPouch();
      breath.who = 'me';
      breath.press = { x: ev.clientX, y: ev.clientY };
      breath.finger = { x: ev.clientX, y: ev.clientY };
      showGizmo(aiming, powerColor(0));
      showCues(aiming);
      $('#hint').hidden = true;
      if (micEnabled && mic.ready) {
        micPeak = 0; micBlowing = false; micAbove = 0;
        micTimer = setInterval(() => {
          if (!aiming) { clearInterval(micTimer); return; }
          const { level, blowing } = mic.sample();
          puffer.p = Math.min(POWER_MAX, level);
          breath.over = puffer.p > F + 0.01; // 마이크: 버팀·콜록 없음, 꽉 너머면 고리만 빨갛게
          // 불기 시작 = 바람 소리 판정(blowing) 또는 세기(level)만으로. 아이폰은 마이크가 바람 소리의 저역을 깎아(바람 소음 억제)
          // blowing 이 거의 안 서서, 볼은 빵빵해지는데 발사가 안 됐다(재윤님 실기기). 짧은 딸깍·말소리는 120ms 지속 조건으로 거른다
          if (blowing || level >= MIC_BLOW_LV) { micAbove += 30; micPeak = Math.max(micPeak, level); if (micAbove >= 120) micBlowing = true; }
          if (micBlowing && level < micPeak * 0.45) {
            // 불기 끝 → 발사
            const shot = { ...aiming, power: clamp(micPeak, 0.15, POWER_MAX) };
            micBlowing = false;
            fire(shot);
            return;
          }
          showGizmo({ ...aiming, power: puffer.p }, powerColor(puffer.p));
          if (aiming) showCues({ ...aiming, power: puffer.p });
        }, 30);
      } else {
        inhale = sfx.inhale();
      }
    };
    const move = (ev) => {
      if (!aiming) {
        if (state === 'match' && ev.pointerType === 'mouse') {
          const s = pointerAim(ev);
          if (s) { showGizmo(s, 0xffffff); breath.mode = 'off'; }
        }
        return;
      }
      if (micEnabled && mic.ready) return;
      const dy = ev.clientY - aiming.sy;
      // 당긴 거리 → 숨 주머니: 꽉(F)까지 1:1, 꽉에서 손끝이 걸리고(디텐트), 그 너머는 고무줄처럼 뻑뻑하게 벽(POWER_MAX)까지
      aiming.power = Rules.pouchPower(dy / (minDim * feel.pull));
      breath.finger = { x: ev.clientX, y: ev.clientY };
      updatePouch();
      if (aiming.beat || aiming.bc) return; // 콩닥 숨: 볼·물결·조준은 rAF 루프가 유효 숨으로 그린다
      if (match?.net) netAimPresence(aiming);
      puffer.p = aiming.power;
      inhale?.set(aiming.power / F);
      // 음계 8칸(0~꽉)은 가이드 단계에서만. 이후엔 연속 들숨 소리만 (음이 시작되는 칸이 정답표가 되지 않게)
      if (gogglesActive() && aiming.power < F) { // 음계 8칸도 정답 단서 → 물안경일 때만
        const step = Math.min(7, Math.floor((aiming.power / F) * 8));
        if (step !== aiming.step) { aiming.step = step; if (step > 0) sfx.tone([392, 440, 494, 523, 587, 659, 698, 784][step], 0.05, 'triangle', 0.06); }
      }
      showGizmo(aiming, powerColor(aiming.power));
      showCues(aiming);
    };
    const fire = (shot) => {
      aiming = null;
      if (gogglesOn) { profile.items.goggles = Math.max(0, (profile.items.goggles || 0) - 1); gogglesOn = false; Store.save(profile); } // 놓을 때 1개(콜록·취소면 안 씀)
      profile.firstPlay = false;
      finish(shot);
    };
    const up = (ev) => {
      if (!aiming) return;
      if (micEnabled && mic.ready) {
        // 불던 중(또는 분 뒤)에 손을 떼면 그때까지의 최고 세기로 쏜다. 한 번도 안 불었으면 취소
        if (micBlowing || micPeak >= MIC_BLOW_LV) { const shot = { ...aiming, power: clamp(micPeak, 0.15, POWER_MAX) }; micBlowing = false; clearInterval(micTimer); fire(shot); return; }
        aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); clearInterval(micTimer); unpress();
        return;
      }
      if (aiming.power < 0.06) {
        aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); resetPouch(); inhale?.stop(); inhale = null; unpress();
        return;
      }
      if (aiming.bc) {
        // PvP: 놓은 순간까지 하위 스텝을 채우고 '마지막으로 끝난 하위 스텝'의 유효 숨(최대 33ms 앞). trace 를 함께 낸다(다시 계산용)
        const e = aiming.bc.to((ev?.timeStamp || performance.now()) - aiming.bcT0, aiming.power);
        const trace = aiming.bc.trace.slice();
        const { beat, bc, bcT0, eff, ...rest } = aiming;
        fire({ ...rest, power: e, beatTier: match.net.beatTier, trace });
        return;
      }
      if (aiming.beat) {
        // 놓은 순간(화면·터치 지연 50ms 앞당김)의 유효 숨. 고리 버퍼에서 읽는다 — 모두에게 같은 보정
        const tt = (ev?.timeStamp || performance.now()) - 50, buf = aiming.beat.buf;
        let e = buf.length ? buf[0].eff : aiming.power;
        for (const b of buf) if (b.t <= tt) e = b.eff;
        const { beat, eff, ...rest } = aiming;
        fire({ ...rest, power: e });
        return;
      }
      fire({ ...aiming });
    };
    const unpress = () => { camStrafeGoal = 0; if (match?.net) netAimPresence(null); if (!myTurn.on) return; myTurn.pressed = false; myTurn.t0 = performance.now(); $('#hint').hidden = false; }; // 누름이 취소되면 안내를 다시
    const cancel = () => { if (!aiming) return; aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); resetPouch(); inhale?.stop(); inhale = null; unpress(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', cancel);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });
}

async function aiShot() {
  // 상대: 그럴듯한 조준 + 실수 (난이도 중간)
  const rng = match.rng;
  const g0 = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const g = () => g0() * (match.practice ? 1.8 : 1) / (match.aiSkill || 1);
  const top = table.columnTop();
  const c = table.pileCenter();
  const body = camera.position.clone().addScaledVector(camStrafeSide, -camStrafe);
  const toCam = new THREE.Vector3(body.x - c.x, 0, body.z - c.z).normalize();
  const dir = toCam.clone(); // 상대는 맞은편에서 내 쪽으로 분다
  // 삐져나온 딱지 노리기(Rules.pickProtrusion)는 꺼 둔다 — 4차 교차 검토: 이득이 실측되지 않았고, 아래쪽 딱지를 노려 고수일수록 약해졌다
  const target = null;
  const shot = {
    dir: { x: dir.x, z: dir.z },
    lat: clamp((target ? target.lat : 0) + g() * 0.3 / feel.aiSkill, -0.9, 0.9),
    h: target ? clamp(target.h + g() * 0.05, 0.03, top) : clamp(top * clamp(0.68 + 0.18 * clamp(((match.aiSkill || 1) - 1) / 1.2, 0, 1) + g() * 0.17 / feel.aiSkill, 0.05, 1), 0.03, top),
    power: clamp(sweetHiFor(table.liveDiscs().length) * (0.89 + g() * 0.14 / feel.aiSkill), 0.2, POWER_MAX),
  };
  puffer.mode = 'charge';
  puffer.who = 'ai';
  breath.who = 'ai';
  if (cue.receipt) cue.receipt.t0 = Math.min(cue.receipt.t0, performance.now() - 5100); // 상대 차례: 카드는 바로 사라지기 시작
  puffer.strain = 0; puffer.full = false;
  breath.press = null; breath.full = false; breath.over = false; breath.strain = 0;
  $('#puffWrap').classList.add('ai');
  // 조준 흔들기 연출
  const startH = top * rng(), startLat = (rng() - 0.5) * 1.4;
  const run = runId;
  await addTween(0.9, (k) => {
    if (run !== runId || !table) return; // 홈으로 나간 뒤 남은 트윈이 다음 판에 조준을 그리지 않게
    const e = easeInOut(k);
    const s = { ...shot, lat: lerp(startLat, shot.lat, e), h: lerp(startH, shot.h, e), power: shot.power * e };
    puffer.p = s.power;
    showGizmo(s, powerColor(s.power));
  });
  await wait(220);
  return shot;
}

// 숨 세기 해석: 더미 양에 맞는 숨(hi)을 물리의 0.95 로 정규화.
// 너무 세게 불면 힘은 더 안 오르고, 숨이 차서 조준이 흔들린다 (게임 규칙으로 만든 '과유불급')
function resolveShot(shot, rng) {
  return Rules.resolveShot(shot, liveCount(), table.columnTop(), rng, feel.overShake);
}

// 불고 난 뒤 '숨 결과' 피드백 — 게이지 없이 감을 익히게 하는 결과 지식(knowledge of results)
// 초록 숨은 쏜 직후 '딱 좋은 숨!'(어떤 원인과도 반대말이 아니다). 초록이 아니면 결과를 본 뒤 react 가 원인 코드로 고른 키를 넘긴다
// (cues.js breathKey: 결과가 좋으면 약했든 셌든 지적하지 않는다)
function breathFeedback(ratio, who, forceKey) {
  const key = forceKey || (ratio >= Rules.GREEN_LO && ratio <= 1.0 ? 'fbPerfect' : null);
  if (!key) return;
  if (who === 'me') {
    const st = guideStage();
    if (key === 'fbPerfect' && st >= 2) sfx.tone(1568, 0.25, 'sine', 0.12); // '칭' — 좋은 숨엔 소리
    if (st === 3) return; // 16번째 숨부터 글자 없음 (콜록도 소리·표정만)
    if (st === 2 && key !== 'fbPerfect' && key !== 'fbCough' && ratio >= 0.7 && ratio <= 1.12) return; // 크게 틀렸을 때만 교정
  } else if (who === 'ai' && guideStage() >= 2) return;
  const el = $('#breathFb');
  el.textContent = (who === 'ai' ? t('rival') + ': ' : '') + t(key);
  el.className = 'breath-fb ' + key + (who === 'ai' ? ' ai' : '');
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('go');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 1600);
}

// ── 실험: 바람 도달 시간 — 숨 하나의 상태 (위 TUNE_DEFAULTS 아래 '실험' 주석 · 06 §8.10·§8.11 · BLOCKERS G12) ──
let shotSeq = 0;
let airShot = null; // 지금(마지막) 솔로 숨: { seq, who, lag, air, cut, relT, hs, started, arrPhys, arrAt, hsImpact, hitPhys, movePhys, moveWall, ring, meas, ... }
let expMine = null; // 수치 표시는 '내' 마지막 숨(상대 차례에도 그대로 보임)
const expHist = []; // 최근 '내' 숨의 '놓기 → 보이는 첫 움직임' 벽시계 ms (없음 = null). 상대(AI) 숨은 안 넣는다(기준이 '놓기'가 아니라 조준 연출 뒤)
const EXP_MOVE_PX = 3; // 보이는 첫 움직임: 기준 자리(아래 expStep) 테두리 점이 지금 카메라로 화면에서 3 CSS px 움직인 첫 스텝(슬로모 중에도 같은 눈금)
const EXP_MOVE_D = 0.03; // 물리 첫 움직임(u, 3D) = react3 첫 움직임 FM 과 같은 크기 — 수치 둘째 줄(물리 ms)
function expMicOn() { return micEnabled && mic.ready; }
// 이 숨에 실제로 쓸 지연: 대결(PvP)·마이크 모드면 언제나 0(turn.js 도 단언). 값은 0.02 하나(expSanitize)
function expLag() { return match?.net || expMicOn() || sweepOn() ? 0 : feel.jetLag === JET_LAG_TEST ? JET_LAG_TEST : 0; } // 쓸기 연습판도 0(이 판은 실험 지연 무시)
function expAirOn() { return expLag() > 0 && feel.airFx >= 0.5; }
// 이 숨의 물리 시각(화면 초): 숨 시작(table.blow) 전 0 · 다음 숨이 시작되거나 버리면 Infinity(옛 연출 끝). 스텝 사이는 acc 로 보간
function airClock(A) {
  if (A !== airShot) return Infinity;
  if (!A.started) return 0;
  return simWatch.simTime + (table ? Math.min(acc, table.T.dt) : 0);
}
// 화면에 보이는 공기 앞머리(제트 축 거리 u): 물리 시계 × A.vDisp, aStop(더미 앞면 = 조준점, 약한 숨은 그 reach 비율)에서 멈춤.
//   도달 규칙(sim.js)은 딱지 '중심'(앞면보다 약 1~1.5 u 뒤, aMin)이라 1/jetLag 그대로 날리면 고리가 앞면에 먼저 닿아 약 2프레임 서 있다가 충돌한다
//   → 그 멈춤이 렉처럼 읽히지 않게 vDisp = 앞면 거리 / 물리 도달 스텝 끝 시각(≈ aMin·jetLag + 1스텝) ≈ 0.6/jetLag: 고리가 도달 프레임에 앞면에 닿는다(시각은 물리 그대로)
function airFront(A) { return Math.min(airClock(A) * A.vDisp, A.aStop); }
function pufferIdle() { puffer.mode = 'idle'; puffer.p = 0; puffer.aimX = 0; $('#puffWrap').classList.remove('ai'); puffer.who = 'me'; }
// 첫 움직임 측정(feel.airLog): 숨 전(정지) 테두리 점(위·아래 면 × 8 방향)
const EXP_RIM = Array.from({ length: 16 }, (_, j) => new THREE.Vector3(Math.cos((j >> 1) * Math.PI / 4) * DISC_R, (j & 1 ? 0.5 : -0.5) * DISC_H, Math.sin((j >> 1) * Math.PI / 4) * DISC_R));
const expQ = new THREE.Quaternion(), expV = new THREE.Vector3(), expP = new THREE.Vector3();
function expRim(d) { const p = d.body.translation(), q = d.body.rotation(); expQ.set(q.x, q.y, q.z, q.w); return EXP_RIM.map((v) => v.clone().applyQuaternion(expQ).add(expV.set(p.x, p.y, p.z))); }
function expPx(v) { expP.copy(v).project(camera); return [(expP.x * 0.5 + 0.5) * window.innerWidth, (-expP.y * 0.5 + 0.5) * window.innerHeight]; }
function expStep(A, now) {
  if (A.hitPhys == null && table.lastHits?.some((h) => h.s > 0)) A.hitPhys = simWatch.simTime; // 바람(세기 > 0)이 처음 닿은 스텝 끝(react3 'arr' 와 같은 뜻)
  const M = A.meas;
  if (!M) return;
  // 화면 기준 자리: 지연 숨이면 '공기가 처음 닿은 스텝의 시작' 자리(그 전 83 ms 동안 정지 더미가 약 1.5 px 기어가는 것을 공기 탓으로 세지 않게).
  //   지연 없음이면 숨 시작 자리(바람이 첫 스텝부터 닿으니 같은 뜻). 물리 ms(3D 0.03 u)는 react3 처럼 늘 숨 시작 자리 기준
  const wait = A.lag > 0 && !A.measPx;
  if (wait && table.air?.arrivedT != null) A.measPx = A.pre || M; // 이 스텝이 도달 스텝
  if (A.moveWall != null && A.movePhys != null) return;
  const PX = A.lag > 0 ? A.measPx : M;
  const pre = A.lag > 0 && !A.measPx ? new Map() : null;
  for (const d of table.liveDiscs()) {
    const ref = M.get(d.id);
    if (!ref || d.off) continue;
    const cur = expRim(d);
    if (pre) pre.set(d.id, cur);
    const refPx = PX?.get(d.id);
    for (let j = 0; j < cur.length; j++) {
      if (A.movePhys == null && cur[j].distanceTo(ref[j]) >= EXP_MOVE_D) A.movePhys = simWatch.simTime;
      if (A.moveWall == null && refPx) { // 같은 (지금) 카메라로 기준·지금 자리를 투영 → 카메라가 움직여도 딱지 움직임만 잰다
        const p0 = expPx(refPx[j]), p1 = expPx(cur[j]);
        if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= EXP_MOVE_PX) A.moveWall = now - A.relT;
      }
    }
  }
  if (pre) A.pre = pre;
  if (A.moveWall != null) expRecord(A);
}
function expRecord(A) {
  if (A.logged) return;
  A.logged = true;
  if (A.who !== 'me') return;
  expHist.unshift(A.moveWall != null ? Math.round(A.moveWall) : null);
  if (expHist.length > 6) expHist.length = 6;
}
// 공기가 처음 더미에 닿은 스텝(sim.js table.air.arrivedT). 공기 앞머리 연출이면 더미 쪽 단서·충돌 멈칫을 여기서 → true(이 프레임 스텝을 멈춤)
function expArrive(A) {
  A.arrPhys = simWatch.simTime;
  A.arrAt = performance.now();
  if (!A.air || !A.onArrive) return false;
  A.onArrive();
  return true;
}
// 시동 와류 고리: 놓는 순간 입(제트 원점)에서 나가 물리 시계로(airFront) 날아가 도달 스텝에 더미 앞면에 닿는다. 반경 = 제트 폭(jetR0 + a·jetSpread).
// 충돌 멈칫 동안 앞면에 그대로 → 멈칫이 끝나면 퍼지며 사라짐. 약한 숨은 reach 에서 흩어짐.
// 밝은 하늘색 + 얇은 남색 테두리(밝은 나무 바닥·흰 딱지 위 대비, 흰 조준 고리와 다르게)
let ringLive = 0; // 장면에 있는 고리 수(시험용: 대결 중엔 늘 0)
function ringStart(A) {
  const T = table.T;
  const mk = (tube, color) => new THREE.Mesh(new THREE.TorusGeometry(1, tube, 10, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
  const edge = mk(0.2, 0x123a5c), core = mk(0.12, 0xc8f0ff);
  edge.renderOrder = 3; core.renderOrder = 4;
  const grp = new THREE.Group();
  grp.add(edge, core);
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(A.d.x, A.d.y, A.d.z));
  grp.visible = false;
  scene.add(grp);
  ringLive++;
  A.ring = { grp, edge, core, r0: T.jetR0, sp: T.jetSpread };
}
function ringStop(A) {
  const R = A?.ring;
  if (!R) return;
  scene.remove(R.grp);
  for (const m of [R.edge, R.core]) { m.geometry.dispose(); m.material.dispose(); }
  ringLive--;
  A.ring = null;
}
function ringUpdate(A) {
  const R = A.ring, w = performance.now();
  const aRaw = airClock(A) * A.vDisp, a = Math.min(aRaw, A.aStop);
  let op = 0.66 * Math.min(1, a / 0.35), sc = 1;
  if (A.weak) {
    op *= clamp((A.aStop - aRaw) / (0.2 * A.aStop), 0, 1); // 힘이 빠져 더미 앞에서 흩어짐
    if (aRaw >= A.aStop || A.arrAt != null) return ringStop(A);
  } else if (A.arrAt != null) {
    const k = (w - A.arrAt - (A.hsImpact || 0)) / 160; // 충돌 멈칫 동안 0 이하(앞면에 붙은 채), 끝나면 퍼지며 사라짐
    if (k >= 1) return ringStop(A);
    if (k > 0) { op *= 1 - k; sc = 1 + 0.7 * k; }
  }
  if (!(aRaw < Infinity) || w - A.relT > 4000) return ringStop(A);
  R.grp.position.set(A.o.x + A.d.x * a, A.o.y + A.d.y * a, A.o.z + A.d.z * a);
  R.grp.scale.setScalar((R.r0 + a * R.sp) * sc);
  R.core.material.opacity = op;
  R.edge.material.opacity = op * 0.5;
  R.grp.visible = a > 0 && op > 0.005;
}
// 프레임 맨 위(슬로모 계산 전): 공기 앞머리 연출의 충돌 멈칫이 끝난 첫 프레임에 슬로모를 건다(지금 연출이 히트스톱 끝에 거는 것과 같은 자리)
//   카메라 물러남도 여기서(지금 연출이 놓을 때 거는 것을 공기 앞머리 연출은 충돌 멈칫 뒤로 — 멈칫 동안 화면이 미끄러지지 않게)
function expSlowKick(now) {
  const A = airShot;
  if (A?.resumeAt != null && now >= A.resumeAt) {
    slowUntil = Math.max(slowUntil, A.resumeAt + 120 + 380);
    A.resumeAt = null;
    if (A.camHold) { A.camHold = false; camAimGoal = 0; camStrafeGoal = 0; }
  }
}
// 프레임마다: 고리·부는 얼굴 유지·측정 마무리·수치 표시
function expFrame() {
  const A = airShot;
  if (A && (state !== 'match' || match?.net || !table)) { // 판을 떠남·대결 → 버림(얼굴은 화면 전환이 맡음)
    ringStop(A);
    if (A.camHold) { camAimGoal = 0; camStrafeGoal = 0; }
    airShot = null;
  }
  if (state !== 'match' || match?.net) expMine = null;
  if (A && airShot === A && A.started) {
    if (A.ring) ringUpdate(A);
    // 부는 얼굴: 공기 앞머리 연출이면 도달 + 숨 끝(물리)까지, 그리고 지금처럼 최소 450 ms
    if (A.air && !A.faceDone) {
      const w = performance.now(), end = A.arrPhys != null ? A.arrPhys + table.T.puffDuration : Infinity;
      if ((w >= A.faceMin && airClock(A) >= end) || w - A.relT > 3000) { A.faceDone = true; pufferIdle(); }
    }
    if (A.meas && !A.logged && !simOn) expRecord(A); // 판정까지 안 움직임(약한 숨)
  }
  expReadout();
}
function expReadout() {
  const el = (expReadout.el ||= $('#expLog')); // 매 프레임 부름 → 한 번만 찾음
  if (!el) return;
  if (sweepOn() && state === 'match') { // 쓸기 연습판: 실험 지연을 켜 둔 채면 '이 판에서는 꺼져요' 한 줄만(개발용 숫자는 카드 '자세히'·기록 복사로)
    const exp = feel.jetLag > 0 || feel.airFx >= 0.5 || feel.hsCut >= 0.5;
    if (!exp) { if (!el.hidden) el.hidden = true; return; }
    if (el.hidden) el.hidden = false;
    const txt = `<span>${t('swLagOff')}</span>`;
    if (el._txt !== txt) { el._txt = txt; el.innerHTML = txt; }
    return;
  }
  const solo = state === 'match' && !match?.net;
  const active = solo && (feel.jetLag > 0 || feel.airFx >= 0.5 || feel.hsCut >= 0.5); // 실험이 켜진 채 저장돼 있으면 판 화면에 늘 표시(잊고 손맛을 보지 않게)
  const show = solo && (feel.airLog >= 0.5 || active);
  if (el.hidden === show) el.hidden = !show;
  if (!show) return;
  const lag = expLag();
  const mode = lag > 0
    ? `${t('expLagShort')} ${lag} · ${feel.airFx >= 0.5 ? t('expFxAir') + (feel.hsCut >= 0.5 ? ' · ' + t('expCutShort') : '') : t('expFxNow')}`
    : feel.jetLag > 0 && expMicOn() ? t('expMicOff') : `${t('expLagShort')} ${t('expOff')}${feel.airFx >= 0.5 ? ' · ' + t('expFxNeedsLagShort') : ''}`;
  let txt;
  if (feel.airLog < 0.5) txt = `<span>${t('expBadge')} · ${mode}</span>`; // 수치 끔: 한 줄 표시만
  else {
    const A = expMine; // 수치는 내 숨만(상대 숨은 '놓기' 기준이 아님)
    const ms = (v) => (v == null ? '…' : Math.round(v * 1000));
    if (!A || !A.meas) txt = `<b>${t('expRead')} —</b><span>${mode}</span>`;
    else {
      const mv = A.moveWall != null ? `${Math.round(A.moveWall)} ms` : A.logged ? t('expNone') : '…';
      const hsTxt = A.air ? `${t('expHsHit')} ${A.hsImpact ?? '…'}/${A.hs}` : `${t('expHs')} ${A.hs}`;
      txt = `<b>${t('expRead')} ${mv}</b>`
        + `<span>${hsTxt} · ${t('expPhys')} ${t('expHit')} ${ms(A.arrPhys ?? A.hitPhys)} · ${t('expMove')} ${A.logged && A.movePhys == null ? '–' : ms(A.movePhys)} ms</span>`
        + `<span>${mode}</span>`
        + `<span>${t('expRecent')} ${expHist.map((v) => (v == null ? '–' : v)).join(' · ') || '—'}</span>`;
    }
  }
  if (el._txt !== txt) { el._txt = txt; el.innerHTML = txt; }
}

// 자동 시험용(실험 토글): 마지막 숨의 측정·상태
window.__puffExp = () => {
  const A = airShot, el = $('#expLog');
  return {
    feel: { jetLag: feel.jetLag, airFx: feel.airFx, hsCut: feel.hsCut, airLog: feel.airLog, core: feel.core, swg: feel.swg }, lagNow: expLag(), hist: expHist.slice(), readout: el && !el.hidden ? el.textContent : null,
    breathAir: !!breath.air, rings: ringLive,
    sweep: { core: feel.core, on: sweepOn(), clock: sweep.clock, input: !!sweep.input, shot: !!sweep.shot, shots: window.__puffSweep.shots, ribbon: !!sweep.ribbon?.visible }, // 쓸기 흔적(대결 중엔 모두 꺼져 있어야 — pvp-check)
    last: A && { seq: A.seq, who: A.who, lag: A.lag, air: A.air, cut: !!A.cut, hs: A.hs, hsImpact: A.hsImpact ?? null, arrPhys: A.arrPhys ?? null, hitPhys: A.hitPhys ?? null, movePhys: A.movePhys ?? null, moveWall: A.moveWall ?? null,
      arrWall: A.arrAt != null ? A.arrAt - A.relT : null, faceDone: !!A.faceDone, ring: !!A.ring, logged: !!A.logged, slowLeft: Math.max(0, slowUntil - performance.now()) },
  };
};
// 실험 숨으로 table.blow: 지연은 숨 인자로만(안 넘기면 v1 비트 동일). 값은 expLag() 가 거른 0.02 뿐이라 throw 는 없어야 하지만, 실험 값이 판을 멈추지는 않게 v1 로 다시 분다
function expBlowTable(args, lag) {
  if (!(lag > 0)) return table.blow(args);
  try { return table.blow({ ...args, jetLag: lag }); } catch (e) { console.warn('[실험] jetLag 숨 실패 → v1 로 다시', e); return table.blow(args); }
}

async function blow(rawShot, who) {
  // 실험(바람 도달 시간): 솔로만. 지연 끔·연출 끔이면 아래는 예전 그대로(물리도 v1 비트 동일)
  const lag = expLag();
  const airOn = lag > 0 && feel.airFx >= 0.5; // 공기 앞머리 연출: 놓는 순간 출발, 더미 쪽 단서·충돌 멈칫·슬로모·카메라는 물리 도달 스텝에
  ringStop(airShot); // 지난 숨 고리가 남았으면(정상이면 이미 없음)
  const A = (airShot = { seq: ++shotSeq, who, lag, air: airOn, cut: airOn && feel.hsCut >= 0.5, relT: performance.now(), started: false, camHold: airOn && who === 'me' });
  if (who === 'me') expMine = A;
  if (feel.airLog >= 0.5 && !match?.net) A.meas = new Map(table.liveDiscs().filter((d) => !d.off).map((d) => [d.id, expRim(d)])); // 숨 전(정지) 자리
  const shot = resolveShot(rawShot, match.rng);
  const g = shotGeometry(shot);
  if (who === 'me') takeCueSnap(rawShot, shot, g);
  const va = visAim(g); // 화면 연출용 조준점(보이는 딱지 높이) — 물리 바람은 아래 blowArgs = g.aim 그대로
  if (who === 'me') {
    puffer.snapUntil = performance.now() + 900; puffer.snapP = rawShot.power; puffer.snapN = liveCount();
    lastBreath.p = rawShot.power; lastBreath.aim = visAim(g); lastBreath.normal = g.normal.clone(); // 고스트 = 화면 자리(보이는 딱지 높이)
    profile.tutorialPuffs = (profile.tutorialPuffs || 0) + 1; Store.save(profile);
  }
  setTimeout(() => breathFeedback(shot.ratio, who), 380);
  breath.mode = 'blow'; breath.t = 0; breath.p = Math.min(1.2, rawShot.power / sweetHiFor(liveCount())); breath.who = who; breath.ratio = shot.ratio;
  breath.air = airOn ? A : null; // 숨 줄기(2D) 머리를 고리(공기 앞머리)에 붙임(drawBreath)
  puffer.mode = 'blow';
  puffer.p = shot.power;
  puffer.fill = clamp(rawShot.power / Rules.POUCH_FULL, 0, 1);
  puffer.ratio = shot.ratio ?? 1;
  puffer.strain = 0; puffer.full = false;
  breath.press = null; breath.full = false; breath.over = false; breath.strain = 0;
  const hs = Math.round(60 + 60 * clamp(shot.ratio ?? 0.8, 0, 1)); // 히트스톱 60~120ms, 숨 세기에 비례 (2라운드 리서치)
  A.hs = hs;
  // 더미 쪽 단서: 지금 연출은 숨 시작(히트스톱 뒤)에. 공기 앞머리 연출이면 물리 도달 스텝에(A.onArrive ← 프레임 루프 expArrive)
  const pileHit = () => {
    if (shot.h < table.columnTop() * 0.15) fx.emit({ at: { x: g.aim.x, y: 0.05, z: g.aim.z }, n: 40, color: 0xc9a77a, speed: 2.4, up: 1.2, life: 0.8, size: 0.32, gravity: 2 }); // 너무 낮게: 바닥 먼지
    fx.emit({ at: { x: g.aim.x, y: Math.max(0.05, va.y), z: g.aim.z }, n: 18, color: 0xfff6e0, speed: 2.2 * shot.power, up: 1.2, life: 0.5, size: 0.3, gravity: 1 });
    shake = 0.18 + rawShot.power * 0.22;
    flash(0.55 * Math.min(1, rawShot.power));
    shockwave(table.pileCenter(), rawShot.power);
  };
  const pileBlast = () => {
    if (shot.blast > 0.15) {
      // 너무 센 숨 = 돌풍: 휘잉~ 먼지바람이 더미를 통째로 밀어 버린다 (들어 올리지 못하고 날려 버림)
      sfx.whoosh();
      shake += 0.25 * Math.min(1, shot.blast);
      for (let i = 0; i < 3; i++) fx.emit({ at: { x: g.aim.x, y: 0.15 + i * 0.4, z: g.aim.z }, n: 22, color: 0xd9c7a8, speed: 7 * Math.min(1.2, shot.blast), up: 0.6, life: 0.9, size: 0.38, gravity: 0.5, dir: { x: g.dir.x, y: 0, z: g.dir.z } });
    }
  };
  const blowArgs = { aim: { x: g.aim.x, y: g.aim.y, z: g.aim.z }, dir: { x: g.dir.x, z: g.dir.z }, power: shot.power, blast: shot.blast || 0, ...(rawShot.mouthY != null ? { mouthY: rawShot.mouthY } : {}) };
  const windColor = who === 'me' ? 0xffffff : 0xffe7a0;
  if (!airOn) {
    // 지금 연출(지연만 켰으면 물리만 늦음): 놓은 뒤 히트스톱 → 숨 시작에 입·더미 단서 모두
    hitStopUntil = performance.now() + hs;
    await wait(hs);
    hideGizmo();
    sfx.puff(Math.min(1.2, rawShot.power), shot.ratio ?? 1); // '푸' — 약함·초록·셈에 따라 길이·거칠기
    navigator.vibrate?.(Math.round(20 + shot.power * 30));
    if (who === 'me') window.__lastShot = { pose: rawShot.pose || 'eye', mouthY: rawShot.mouthY ?? null, power: rawShot.power }; // 테스트용
    const windFrom = rawShot.mouthY != null ? new THREE.Vector3(g.aim.x - g.dir.x * Rules.LIP_BACK, rawShot.mouthY, g.aim.z - g.dir.z * Rules.LIP_BACK) : g.origin; // 책상 입: 낮은 곳에서 올려 붊
    fx.wind(windFrom, va, shot.power, windColor);
    pileHit();
    // 물리에 바람 적용 (실험 jetLag 는 솔로 시험 토글이 켜졌을 때만 숨 인자로 — 안 넘기면 v1 비트 동일)
    expBlowTable(blowArgs, lag);
    pileBlast();
  } else {
    // 공기 앞머리 연출: 놓는 순간(0 ms) 입 쪽 단서('푸'·가벼운 톡)·물리·와류 고리·바람 줄기가 함께 출발. 조준 고리는 곧바로 숨김(공기 고리와 헷갈리지 않게)
    hideGizmo();
    sfx.puff(Math.min(1.2, rawShot.power), shot.ratio ?? 1);
    navigator.vibrate?.(10);
    if (who === 'me') window.__lastShot = { pose: rawShot.pose || 'eye', mouthY: rawShot.mouthY ?? null, power: rawShot.power }; // 테스트용
    expBlowTable(blowArgs, lag);
    const air = table.air;
    const ratio = shot.ratio ?? 1;
    A.weak = ratio < 0.75; // 숨 줄기(2D)의 '약함' 서명과 같은 기준: 고리가 더미 앞에서 흩어지고 '퍽'·강한 진동 없음
    if (air) {
      A.o = air.o; A.d = air.d;
      A.aFront = Math.max(0.3, (g.aim.x - air.o.x) * air.d.x + (g.aim.y - air.o.y) * air.d.y + (g.aim.z - air.o.z) * air.d.z); // 입 → 조준점(더미 앞면) 축 거리
      A.aStop = A.aFront * (A.weak ? 0.45 + 0.55 * (ratio / 0.75) : 1);
      // 화면 공기 앞머리 속도(airFront 주석): 도달 스텝이 끝나는 물리 시각(숨 시각이 aMin·jetLag 를 넘는 첫 스텝 + 1스텝 = jetlagcheck (e))에 앞면
      const dt = table.T.dt, tArr = (Math.ceil(Math.max(air.aMin, A.aFront) * lag / dt - 1e-9) + 1) * dt;
      A.vDisp = A.aFront / tArr;
      A.onArrive = () => {
        const w = performance.now();
        A.hsImpact = A.cut ? Math.max(0, Math.round(hs - (w - A.relT))) : hs; // 충돌 멈칫(멈칫 줄이기면 공기 이동 벽시계만큼 뺌)
        hitStopUntil = w + A.hsImpact;
        A.resumeAt = w + A.hsImpact; // 멈칫이 끝난 첫 프레임에 슬로모(expSlowKick)
        pileHit(); pileBlast();
        if (A.weak) navigator.vibrate?.(15);
        else { navigator.vibrate?.(Math.round(20 + shot.power * 30)); sfx.airHit(Math.min(1.2, rawShot.power)); }
      };
      ringStart(A);
      // 바람 줄기(3D): 고리와 같은 시계·속도로 고리 뒤에 가늘게 5줄 — 더미 앞면(aStop)을 지나면 0.4 u 안에 녹아 사라지고 고리만 남는다
      const o3 = new THREE.Vector3(air.o.x, air.o.y, air.o.z), d3 = new THREE.Vector3(air.d.x, air.d.y, air.d.z);
      fx.wind(o3, o3.clone().addScaledVector(d3, A.aStop), shot.power, windColor, { clock: () => airClock(A), speed: A.vDisp, n: 5, thin: 0.55 });
    } else { // 지연 숨이 v1 로 떨어짐(expBlowTable) → 지금 연출로 마무리
      A.air = false; breath.air = null;
      if (A.camHold) { A.camHold = false; camAimGoal = 0; camStrafeGoal = 0; }
      pileHit(); pileBlast();
      navigator.vibrate?.(Math.round(20 + shot.power * 30));
    }
  }
  if (A.lag && !table.air) A.lag = 0; // 지연 숨이 v1 로 떨어졌으면(expBlowTable) 측정·표시도 v1 로
  resetSimWatch(who);
  // 날아오르는 순간만 짧게 슬로모(대박 조짐이면 watchSim 에서 연장). 공기 앞머리 연출이면 공기가 가는 동안 1배, 충돌 멈칫이 끝나면(expSlowKick)
  slowUntil = A.air ? 0 : performance.now() + 120 + 380;
  acc = 0;
  simOn = true;
  A.started = true;
  // 부는 얼굴: 지금은 450 ms 뒤 쉼. 공기 앞머리 연출이면 도달 + 숨 끝(물리)까지 유지(expFrame), 최소 450 ms
  if (A.air) A.faceMin = performance.now() + 450;
  else setTimeout(pufferIdle, 450);
}

// 숨 시작 때 판 지켜보기(뒤집힘 연출·멈춤 판정) 상태를 비운다 — 고전 blow 와 쓸기 blowSweep 이 같이 쓴다
function resetSimWatch(who) {
  simWatch.revealed = new Set(table.liveDiscs().filter((d) => table.faceUp(d) > 0.5).map((d) => d.id));
  simWatch.count = 0;
  simWatch.glowed = new Set();
  simWatch.outShown = new Set();
  simWatch.outs = 0;
  simWatch.shooter = who;
  simWatch.simTime = 0;
  simWatch.quiet = 0;
  simWatch.vy.clear();
}

function simulate() {
  return new Promise((resolve) => {
    simWatch.resolve = () => {
      simOn = false;
      // 분필 원 안에서 그림이 보이는 것만 내 것. 원 밖(또는 책상 밖)으로 날아간 건 그림이 보여도 무효 → 다시 쌓임
      const flipped = table.liveDiscs().filter((d) => table.faceUp(d) > 0.2 && table.inCircle(d));
      const outs = table.liveDiscs().filter((d) => !table.inCircle(d));
      simWatch.outs = outs.length;
      for (const d of outs) {
        if (simWatch.outShown.has(d.id) || d.off) continue;
        const p = d.body.translation();
        fx.text(new THREE.Vector3(p.x, p.y + 0.5, p.z), 'OUT', 'out');
      }
      if (outs.length) chalkPulse();
      if (simWatch.shooter === 'me') makeReceipt(flipped, outs);
      resolve(flipped);
    };
  });
}

// 이번 숨의 판정(원인 코드). 내 숨은 makeReceipt 가 한 번 계산한 것을 그대로, 상대 숨은 숨·결과만으로(높이·옆은 모름 → 판정 안 함)
function shotVerdictFor(flipped, who, R) {
  if (who === 'me' && cue.snap?.verdict) return { v: cue.snap.verdict, ratio: cue.snap.ratio, n: cue.snap.n };
  const ratio = breath.ratio ?? 1;
  return { v: Cues.shotVerdict({ n: R, ratio, flips: flipped.length, outs: simWatch.outs }), ratio, n: R };
}
const BIG_CLS = { miss: 'r0', close: 'r0', blownOut: 'r0', nice: 'r1', great: 'r2', amazing: 'r3', perfect: 'r4' };
async function react(flipped, who) {
  const n = flipped.length;
  const remainingBefore = table.liveDiscs().length;
  const nearMiss = table.liveDiscs().some((d) => Math.abs(table.faceUp(d)) < 0.45);
  const sv = shotVerdictFor(flipped, who, remainingBefore);
  const key = Cues.bigKey(sv.v, { flips: n, R: remainingBefore, outs: simWatch.outs, nearMiss }), cls = BIG_CLS[key];
  const fk = Cues.breathKey(sv.v, sv.ratio, sv.n);
  if (fk && fk !== 'fbPerfect') breathFeedback(sv.ratio, who, fk); // 초록은 쏜 직후에 이미 보였다
  if (who === 'me') {
    match.best = Math.max(match.best, n);
    match.flipsMe += n;
  }
  camZoom = 0;
  if (cls === 'r4' || cls === 'r3') {
    fx.confetti({ x: 0, y: 0, z: 0 }, cls === 'r4' ? 220 : 110);
    sfx.big();
  }
  let label = n > 0 ? `${t(key)} <small>${n} ${t('flipped')}</small>` : t(key);
  if (simWatch.outs > 0 && (n > 0 || simWatch.outs >= 2 || key === 'blownOut')) label += `<small class="outs">${fmt(t('outCount'), { k: simWatch.outs })}</small>`;
  // '너무 세게 불면 원 밖으로' 첫 안내는 셈일 때만(초록 숨에 '너무 세게'라고 하지 않는다)
  if (Cues.outTipOk(sv.v, simWatch.outs) && !profile.settings.outTipSeen) { profile.settings.outTipSeen = true; Store.save(profile); if (!cue.receipt) setTimeout(() => toast(t('outTip')), 900); }
  const el = $('#big');
  el.innerHTML = label;
  el.className = 'big ' + cls + (who === 'ai' ? ' ai' : '');
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('go');
  await wait(n > 0 ? 900 : 1000);
  el.hidden = true;
}

// "진짜로 불어볼래?" — 내가 대박(5장↑)을 낸 판이 끝나고, 결과 화면을 닫은 뒤(홈·지도로 돌아갈 때) 딱 한 번(GDD §9.9 P0-14).
// 경기 도중(대박 직후)엔 띄우지 않는다: 손맛 흐름을 끊는다. 마이크 권한은 첫 실행에 묻지 않는다(리서치).
// TODO(연령 확인, GDD §12.1·§13.8): 연령 확인 체계가 생기면 확인 뒤에만 띄우고 13세 미만(한국 14세 미만)은 기본 끔. 지금은 연령 체계가 없다
// 무장은 결과 화면을 닫는 모든 출구에서 소비한다: 홈(goHome) · 지도(lrMap→goHome) · 다음 판/다시/한 판 더(then = 제안을 닫은 뒤 이어서 시작).
// 그래서 무장이 다음 판으로 넘어가 엉뚱한 때(다음 판 도중 HOME, 두 레벨 뒤)에 뜨지 않는다. 판을 시작할 때도 꺼 둔다(startMatch·startLevel)
let micOfferArmed = false; // endMatch 가 match.bigPuff 를 보고 켠다
function maybeOfferMic(then) {
  const go = () => { then?.(); };
  if (!micOfferArmed) return go();
  micOfferArmed = false;
  if (micEnabled || profile.settings.micOffered || !navigator.mediaDevices?.getUserMedia) return go();
  profile.settings.micOffered = true;
  Store.save(profile);
  const el = $('#micOffer');
  el.hidden = false;
  $('#micNo').onclick = () => { el.hidden = true; go(); };
  $('#micYes').onclick = async () => {
    el.hidden = true;
    const ok = await mic.start();
    micEnabled = ok;
    toast(ok ? t('micOn') : t('micFail'));
    refreshTexts();
    go();
  };
}

async function collect(flipped, who) {
  // 뒤집힌 딱지가 차례로 포물선을 그리며 내 더미로 날아온다
  const dest = who === 'me' ? new THREE.Vector3(-pileX, 0, 2.4) : new THREE.Vector3(pileX, 0, -3.6);
  const sorted = flipped.slice().sort((a, b) => a.body.translation().y - b.body.translation().y);
  let i = 0;
  for (const d of sorted) {
    const m = meshes.get(d.id);
    table.remove(d);
    meshes.delete(d.id);
    paper.release(m); // 판에서 빠짐: 휨 펴고 배치에서 뺌(더미로 날아감)
    m.userData.anim = true;
    const from = m.position.clone();
    const q0 = m.quaternion.clone();
    const idx = piles[who].length;
    piles[who].push(m);
    const to = dest.clone().add(new THREE.Vector3(0, pileY(idx), 0));
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (Math.random() - 0.5) * 0.6, 0));
    const k0 = i;
    addTween(0.42, (k) => {
      const e = ease(k);
      m.position.lerpVectors(from, to, e);
      m.position.y += Math.sin(Math.PI * k) * 2.2;
      m.quaternion.slerpQuaternions(q0, q1, e);
    }, () => {
      sfx.coin(k0);
      const el = $(who === 'me' ? '#meScore' : '#aiScore');
      el.textContent = String(piles[who].length);
      el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
    });
    i++;
    await wait(85);
  }
  if (flipped.length) await wait(480);
  if (match.solo) updateLevelHud(); else $('#potN').textContent = String(table.liveDiscs().length);
}

async function restack() {
  // 남은 딱지를 다시 원기둥으로. 물리를 먼저 쌓아 가라앉힌 뒤 그 자세로 트윈한다
  // (전에는 이상적인 높이로 트윈 → 끝에서 settle 이 기둥을 한 프레임에 툭 내려앉혔음 — 4차 교차 검토)
  const live = table.liveDiscs();
  const before = new Map(live.map((d) => { const m = meshes.get(d.id); m.userData.anim = true; return [d.id, { p: m.position.clone(), q: m.quaternion.clone() }]; }));
  table.applyRestack(table.restackTargets({ x: 0, z: 0 }));
  table.settle(240);
  const rest = paper.restPositions(live.map((d) => ({ id: d.id, body: d.body, mesh: meshes.get(d.id) }))); // 새 더미의 보이는 자리(얇은 몸 + 받침에 닿게 내림, paper.js) → 끝에서 안 튐
  const anims = live.map((d) => {
    const m = meshes.get(d.id), b = before.get(d.id), r = rest.get(d.id);
    return { m, from: b.p, q0: b.q, to: r.p, q1: r.q };
  });
  sfx.whoosh();
  await addTween(0.55, (k) => {
    const e = easeInOut(k);
    for (const a of anims) {
      a.m.position.lerpVectors(a.from, a.to, e);
      a.m.position.y += Math.sin(Math.PI * k) * 0.8;
      a.m.quaternion.slerpQuaternions(a.q0, a.q1, e);
    }
  });
  for (const a of anims) a.m.userData.anim = false;
  syncMeshes();
  for (const a of anims) paper.land(a.m, 0.5); // 내려앉으며 종이 휘청(맨 위 장만 살짝 통)
  sfx.clack(0.6);
  await wait(200);
}

async function endMatch() {
  simOn = false;
  if (match.bigPuff) micOfferArmed = true; // 판이 끝까지 갔을 때만(중간에 나가면 안 켬)
  if (match.level) { await finishLevel({ win: piles.me.length > piles.ai.length, me: piles.me.length, ai: piles.ai.length }); return; }
  // 턴 제한으로 남은 딱지는 원래 주인에게
  const leftover = table.liveDiscs();
  const meWon = piles.me.length;
  const aiWon = piles.ai.length;
  const wonIds = [];
  // piles 의 메시 → 카드 id 역추적
  for (const m of piles.me) wonIds.push(m.userData.cardId);
  const before = new Set(Object.keys(profile.inv).filter((k) => profile.inv[k] > 0));
  for (const id of match.myStake) profile.inv[id] = Math.max(0, (profile.inv[id] || 0) - 1);
  for (const id of wonIds) profile.inv[id] = (profile.inv[id] || 0) + 1;
  for (const d of leftover) if (d.from === 'me') profile.inv[d.cardId] = (profile.inv[d.cardId] || 0) + 1;
  let net = wonIds.length + leftover.filter((d) => d.from === 'me').length - match.myStake.length;
  if (match.mode === 'fun') {
    // 친선전: 판돈 원상복구 (뒤집는 손맛과 기록만 남김)
    for (const id of wonIds) profile.inv[id] = Math.max(0, (profile.inv[id] || 0) - 1);
    for (const d of leftover) if (d.from === 'me') profile.inv[d.cardId] = Math.max(0, (profile.inv[d.cardId] || 0) - 1);
    for (const id of match.myStake) profile.inv[id] = (profile.inv[id] || 0) + 1;
    net = 0;
  }
  profile.stats.matches++;
  if (meWon > aiWon) profile.stats.wins++;
  profile.stats.bestTurn = Math.max(profile.stats.bestTurn, match.best);
  profile.stats.totalFlips += match.flipsMe;
  Store.save(profile);
  const res = meWon > aiWon ? 'win' : meWon < aiWon ? 'lose' : 'draw';
  sfx.fanfare(res !== 'lose');
  if (res === 'win') fx.confetti({ x: 0, y: 0, z: 0 }, 260);
  await wait(500);
  $('#resTitle').textContent = t(res);
  $('#resTitle').className = 'res-title ' + res;
  $('#resScore').innerHTML = `<b>${meWon}</b> <span>:</span> <b>${aiWon}</b>`;
  $('#resBest').textContent = `${t('bestPuff')} ${match.best}`;
  $('#resNet').innerHTML = match.mode === 'fun' ? t('funNote') : `${t('net')} <b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${net}</b>`;
  const grid = $('#resCards');
  grid.innerHTML = '';
  const counts = {};
  for (const id of wonIds) counts[id] = (counts[id] || 0) + 1;
  Object.entries(counts).sort((a, b) => ['legendary', 'epic', 'rare', 'common'].indexOf(CARD_BY_ID[a[0]].rarity) - ['legendary', 'epic', 'rare', 'common'].indexOf(CARD_BY_ID[b[0]].rarity)).forEach(([id, cnt], i) => {
    const c = CARD_BY_ID[id];
    const div = document.createElement('div');
    div.className = 'rc r-' + c.rarity;
    div.style.animationDelay = (i * 0.06) + 's';
    div.innerHTML = `<img alt="${cardName(c)}" src="${faceImage(id, 64)}">${cnt > 1 ? `<i>x${cnt}</i>` : ''}${!before.has(id) ? `<em>${t('newCard')}</em>` : ''}`;
    grid.appendChild(div);
  });
  state = 'result';
  puffer.mode = 'hidden';
  show('#result');
}

// ── 오늘의 더미 (워들식 데일리): 모두 같은 배치, 한 방에 몇 장? → 이모지 카드 공유 (리서치 8·10장) ──
const DAILY_TRIES = 3;
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayNumber() { return Math.floor((Date.parse(todayKey()) - Date.parse('2026-10-12')) / 86400000) + 1; }
function dailyState() {
  const k = todayKey();
  if (!profile.daily || profile.daily.date !== k) profile.daily = { date: k, best: 0, tries: 0 };
  return profile.daily;
}

async function startDaily() {
  sfx.unlock(); sfx.pop();
  const ds = dailyState();
  if (ds.tries >= DAILY_TRIES) { showDailyCard(); return; }
  lastBreath.aim = null;
  const my = ++runId;
  sweepStop(); // 쓸기 연습판 흔적을 끌고 오지 않는다(runId 를 올린 뒤 — 남은 연습판 약속이 null 로 풀려도 옛 runId 라 아무것도 안 함)
  for (const m of homeMeshes) scene.remove(m);
  homeMeshes = [];
  let h = 2166136261;
  for (const ch of todayKey()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const seed = h >>> 0;
  const rng = mulberry32(seed);
  const ids = Array.from({ length: 20 }, () => rollCard(rng, null));
  match = { seed, rng, myStake: [], aiStake: [], pot: ids.map((id) => ({ id, from: 'daily' })), rivalName: '', rivalCard: CARDS[0], mode: 'fun', daily: true, n: 20, turn: 'me', turnNo: 0, best: 0, flipsMe: 0 };
  table = new Table(seed, { lift: 519.59 * feel.wind });
  table.addPile(ids);
  table.settle();
  clearMatchMeshes();
  for (const d of table.discs) { const m = makeDiscMesh(d.cardId); meshes.set(d.id, m); scene.add(m); }
  syncMeshes();
  state = 'match'; pose = 'eye'; gogglesOn = false;
  camZoom = 0;
  snapCam();
  $('#rivalName').textContent = t('daily');
  $('#rivalAva').src = backImage();
  $('#meScore').textContent = '0';
  $('#aiScore').textContent = `#${dayNumber()}`;
  $('#potN').textContent = '20';
  puffer.mode = 'idle'; puffer.p = 0;
  show('#hud');
  await introDrop();
  if (my !== runId) return;
  await banner(`${t('daily')} #${dayNumber()} · ${ds.tries + 1}/${DAILY_TRIES}`, 'b-me');
  const shot = await playerShot();
  if (my !== runId || !shot) return;
  await blow(shot, 'me');
  const flipped = await simulate();
  if (my !== runId) return;
  await react(flipped, 'me');
  ds.tries++;
  ds.best = Math.max(ds.best, flipped.length);
  ds.last = flipped.length;
  Store.save(profile);
  await wait(400);
  if (my !== runId) return;
  showDailyCard(flipped.length);
}

function dailyShareText(n) {
  const full = Math.round(n / 4);
  const bar = '🟡'.repeat(full) + '⚪'.repeat(5 - full);
  return `PUFF! ${t('daily')} #${dayNumber()} ${bar} ${n}/20\nBlow. Flip. Keep.`;
}

function showDailyCard(n) {
  const ds = dailyState();
  const shown = n ?? ds.best;
  $('#dailyNum').textContent = `#${dayNumber()}`;
  $('#dailyScore').textContent = `${shown}/20`;
  $('#dailyMeta').textContent = `${t('dailyBest')} ${ds.best}/20 · ${t('dailyLeft')} ${Math.max(0, DAILY_TRIES - ds.tries)}`;
  $('#dailyShare').value = dailyShareText(ds.best);
  $('#dailyAgain').disabled = ds.tries >= DAILY_TRIES;
  $('#dailyCard').hidden = false;
}

// ── 레벨 (재윤님 피드백 4: 컴퓨터와 하는 1만 판 구조) ─────────────────────────
// 맵(아래→위) · 레벨 소개 · 혼자 하는 판(N장 중 T장 / 황금 딱지, 숨 K번) · 라이벌 판(대전 재사용) · 별 & 보상
const fmt = (str, v) => str.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
function prog() {
  profile.level = profile.level || 1;
  profile.stars = profile.stars || {};
  return profile;
}
function chapterName(ci) { const c = CHAPTERS[ci % CHAPTERS.length]; return getLang() === 'ko' ? c.ko : c.en; }
function rivalName(id) { const r = RIVALS.find((x) => x.id === id); return r ? (getLang() === 'ko' ? r.ko : r.en) : '?'; }
function goalText(spec) {
  if (spec.type === 'flip') return fmt(t('goalFlip'), { n: spec.N, t: spec.target, p: spec.puffs });
  if (spec.type === 'golden') return fmt(t('goalGolden'), { p: spec.puffs });
  if (spec.type === 'goldenSide') return fmt(t('goalGoldenSide'), { p: spec.puffs, a: spec.pocket === 'left' ? '←' : '→' });
  return fmt(t('goalRival'), { r: rivalName(spec.rival), s: spec.stake });
}
function tierLabel(tier) { return tier === 'hard' ? t('hard') : tier === 'superhard' ? t('superhard') : ''; }

function openMap() {
  sfx.unlock(); sfx.pop();
  prog();
  const cur = profile.level;
  const shown = Math.max(60, Math.ceil((cur + 15) / CHAPTER_LEN) * CHAPTER_LEN);
  const STEP = 96, PAD = 140;
  const H = shown * STEP + PAD * 2;
  const path = $('#mapPath');
  path.innerHTML = '';
  path.style.height = H + 'px';
  const pts = [];
  for (let n = 1; n <= shown; n++) {
    const spec = levelSpec(n);
    const y = H - PAD - (n - 1) * STEP;
    const x = 50 + Math.sin(n * 0.85) * 26;
    pts.push(`${x},${y}`);
    if (spec.idx === 1) {
      const band = document.createElement('div');
      band.className = 'chap';
      band.style.top = (y - STEP * (CHAPTER_LEN - 0.5)) + 'px';
      band.style.height = (STEP * CHAPTER_LEN) + 'px';
      band.style.setProperty('--c', CHAPTERS[spec.chapterIdx % CHAPTERS.length].color);
      band.innerHTML = `<span>${t('chapter')} ${spec.chapterIdx + 1} · ${chapterName(spec.chapterIdx)}</span>`;
      path.appendChild(band);
    }
    const b = document.createElement('button');
    b.type = 'button';
    const done = profile.stars[n] > 0;
    b.className = `lv ${spec.tier} ${n === cur ? 'cur' : n < cur || done ? 'done' : 'locked'} t-${spec.type}`;
    b.style.left = x + '%';
    b.style.top = y + 'px';
    const st = profile.stars[n] || 0;
    b.innerHTML = `<b>${n}</b>${spec.tier === 'hard' || spec.tier === 'superhard' ? `<em>${tierLabel(spec.tier)}</em>` : ''}${done ? `<i>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</i>` : ''}${spec.type === 'rival' ? '<u>VS</u>' : spec.type === 'golden' ? '<u class="g">★</u>' : spec.type === 'goldenSide' ? `<u class="g">${spec.pocket === 'left' ? '←★' : '★→'}</u>` : ''}`;
    b.disabled = n > cur;
    b.addEventListener('click', () => openLevelIntro(n));
    path.appendChild(b);
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'trail');
  svg.setAttribute('viewBox', `0 0 100 ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.6" stroke-dasharray="2 2.4" vector-effect="non-scaling-stroke" />`;
  path.prepend(svg);
  const teaser = document.createElement('div');
  teaser.className = 'teaser';
  const far = levelSpec(10000);
  teaser.innerHTML = `${t('teaser')}<br><small>Lv.10000 · ${chapterName(far.chapterIdx)} · ${goalText(far)}</small>`;
  teaser.style.top = '20px';
  path.appendChild(teaser);
  const total = Object.values(profile.stars).reduce((a, b) => a + b, 0);
  $('#mapStars').textContent = `★ ${total}`;
  $('#mapTitle').textContent = `${t('chapter')} ${chapterOf(cur).ci + 1} · ${chapterName(chapterOf(cur).ci)}`;
  show('#map');
  const sc = $('#mapScroll');
  requestAnimationFrame(() => { sc.scrollTop = H - PAD - (cur - 1) * STEP - sc.clientHeight * 0.6; });
}

function openLevelIntro(n) {
  sfx.pop();
  const spec = levelSpec(n);
  $('#liTitle').textContent = `${t('levelWord')} ${n}`;
  const tl = tierLabel(spec.tier);
  $('#liTier').textContent = tl;
  $('#liTier').className = 'tier-tag ' + spec.tier;
  $('#liTier').hidden = !tl;
  $('#liGoal').textContent = goalText(spec);
  const img = $('#liImg');
  img.src = spec.type === 'golden' || spec.type === 'goldenSide' ? faceImage('golden', 70) : spec.type === 'rival' ? faceImage(RIVALS.find((r) => r.id === spec.rival).card, 70) : backImage();
  const intro = spec.intro || (spec.heavy && n === 11 ? 'heavy' : null);
  $('#liNew').hidden = !intro;
  if (intro) $('#liNewText').textContent = t('intro_' + intro);
  $('#liHeavy').hidden = !spec.heavy;
  $('#liHeavy').textContent = fmt(t('heavyNote'), { k: spec.heavy });
  $('#lvIntro').hidden = false;
  $('#liPlay').onclick = () => { $('#lvIntro').hidden = true; startLevel(n); };
}

function updateLevelHud() {
  if (!match || !match.solo || !match.level) return; // 쓸기 연습판(solo·레벨 없음)은 목표 상자가 없다
  const sp = match.level;
  $('#potLbl').textContent = t('goal');
  $('#potN').textContent = sp.type === 'flip' ? `${match.flipped}/${sp.target}` : match.goldenTaken ? '✓' : '★';
  $('#rivalName').textContent = t('puffsLeft');
  $('#aiScore').textContent = String(match.puffsLeft);
}

async function startLevel(n) {
  sfx.unlock();
  const spec = levelSpec(n);
  if (spec.type === 'rival') return startMatch({ level: spec });
  lastBreath.aim = null;
  micOfferArmed = false; cue.receipt = null;
  $('#hud').classList.remove('no-pot'); // 솔로 판은 가운데 상자 = 목표
  const my = ++runId;
  sweepStop(); // 쓸기 연습판 흔적을 끌고 오지 않는다(runId 를 올린 뒤 — 남은 연습판 약속이 null 로 풀려도 옛 runId 라 아무것도 안 함)
  for (const m of homeMeshes) scene.remove(m);
  homeMeshes = [];
  const rng = mulberry32(spec.seed >>> 0);
  const ids = Array.from({ length: spec.N }, () => rollCard(rng, null));
  let goldenIdx = -1;
  if (spec.type === 'golden' || spec.type === 'goldenSide') { goldenIdx = Math.round((1 - spec.goldenDepth) * (spec.N - 1)); ids[goldenIdx] = 'golden'; }
  const heavy = new Set();
  while (heavy.size < Math.min(spec.heavy, spec.N - 1)) { const i = Math.floor(rng() * spec.N); if (i !== goldenIdx) heavy.add(i); }
  match = { seed: spec.seed, rng, myStake: [], aiStake: [], pot: ids.map((id) => ({ id, from: 'level' })), rivalName: '', rivalCard: CARDS[0], mode: 'fun', level: spec, solo: true, n: spec.N, turn: 'me', turnNo: 0, best: 0, flipsMe: 0, puffsLeft: spec.puffs, flipped: 0, goldenTaken: false };
  table = new Table(spec.seed >>> 0, { lift: 519.59 * feel.wind });
  table.addPile(ids, { heavy });
  table.settle();
  clearMatchMeshes();
  for (const d of table.discs) { const m = makeDiscMesh(d.cardId, d.heavy); meshes.set(d.id, m); scene.add(m); }
  syncMeshes();
  state = 'match'; pose = 'eye'; gogglesOn = false;
  camZoom = 0;
  snapCam();
  $('#meScore').textContent = '0';
  $('#rivalAva').src = spec.type === 'golden' || spec.type === 'goldenSide' ? faceImage('golden', 48) : backImage();
  if (spec.type === 'goldenSide') buildPocket(spec.pocket);
  updateLevelHud();
  puffer.mode = 'idle'; puffer.p = 0;
  show('#hud');
  await introDrop();
  if (my !== runId) return;
  await banner(`${t('levelWord')} ${n}${spec.tier === 'hard' || spec.tier === 'superhard' ? ' · ' + tierLabel(spec.tier) : ''}`, spec.tier === 'normal' || spec.tier === 'relief' ? 'b-me' : 'b-ai');
  const goalMet = () => (spec.type === 'flip' ? match.flipped >= spec.target : match.goldenTaken);
  while (match.puffsLeft > 0 && !goalMet()) {
    tension(spec.type === 'flip' && spec.target - match.flipped <= 2 && match.puffsLeft === 1);
    const shot = await playerShot();
    tension(false);
    if (my !== runId || !shot) return;
    match.puffsLeft--;
    updateLevelHud();
    await blow(shot, 'me');
    const flipped = await simulate();
    if (my !== runId) return;
    if (spec.type === 'goldenSide') {
      // ★칸 밖에 뒤집힌 황금 딱지는 무효 → 가져가지 않고 다시 쌓는다
      const g = flipped.find((d) => d.cardId === 'golden');
      if (g && !inPocket(g)) {
        flipped.splice(flipped.indexOf(g), 1);
        const p = g.body.translation();
        fx.text(new THREE.Vector3(p.x, p.y + 0.6, p.z), t('pocketMiss'), 'out');
        pocketPulse();
      } else if (g) pocketPulse(true);
    }
    await react(flipped, 'me');
    if (flipped.length >= 5) match.bigPuff = true; // 솔로 레벨 대박도 마이크 제안 무장 대상(코덱스 최종 리뷰) — 제안은 결과 창을 닫을 때
    if (flipped.some((d) => d.cardId === 'golden')) match.goldenTaken = true;
    match.flipped += flipped.length;
    await collect(flipped, 'me');
    if (my !== runId) return;
    if (goalMet() || match.puffsLeft === 0 || table.liveDiscs().length === 0) break;
    await restack();
    if (my !== runId) return;
  }
  await finishLevel({ win: goalMet(), flipped: match.flipped, puffsLeft: match.puffsLeft });
}

async function finishLevel(res) {
  simOn = false;
  tension(false);
  const spec = match.level;
  if (match.bigPuff) micOfferArmed = true; // 판이 끝까지 갔을 때만(중간에 나가면 finishLevel 에 오지 않음)
  prog();
  // '가이드 항상 보기'를 켜면 별은 최대 2개 (진행은 막지 않고 최상위 보상만 잠금 — 마리오카트 보조 조향 방식)
  const stars = Math.min(feel.guide >= 0.5 ? 2 : 3, starsFor(spec, res));
  const before = new Set(Object.keys(profile.inv).filter((k) => profile.inv[k] > 0));
  const rewards = [];
  profile.failStreak = profile.failStreak || {};
  if (res.win) delete profile.failStreak[spec.n];
  else if ((profile.failStreak[spec.n] = (profile.failStreak[spec.n] || 0) + 1) >= 3) { profile.failStreak[spec.n] = 0; giveGoggles(1); } // 같은 판 3연패 → 물안경 1
  if (res.win) {
    profile.stars[spec.n] = Math.max(profile.stars[spec.n] || 0, stars);
    profile.level = Math.max(profile.level, spec.n + 1);
    // 보상: 별 수만큼 딱지 (하드/슈퍼하드는 +1) — '하면 할수록 쌓이는 자산'
    const k = stars + (spec.tier === 'hard' || spec.tier === 'superhard' ? 1 : 0);
    const rr = mulberry32((spec.seed ^ (Date.now() & 0xffff)) >>> 0);
    for (let i = 0; i < k; i++) { const id = rollCard(rr, spec.tier === 'superhard' && i === 0 ? 'rare' : null); rewards.push(id); profile.inv[id] = (profile.inv[id] || 0) + 1; }
  }
  profile.stats.levelsPlayed = (profile.stats.levelsPlayed || 0) + 1;
  Store.save(profile);
  sfx.fanfare(res.win);
  if (res.win) fx.confetti({ x: 0, y: 0, z: 0 }, 120 + stars * 60);
  await wait(450);
  // '아깝다…'는 목표까지 2장 이하로 모자랄 때만(GDD §8.3). 그 밖의 실패 = 중립 제목 + 이 판에 가장 많이 나온 원인 아이콘(cues.js)
  const titleKey = Cues.resultTitleKey(spec, res);
  $('#lrTitle').textContent = t(titleKey);
  $('#lrTitle').className = 'res-title ' + (res.win ? 'win' : 'lose');
  const top = titleKey === 'notYet' ? Cues.topCause(match?.causeCount) : null;
  $('#lrCause').hidden = !top;
  if (top) $('#lrCause').innerHTML = `<span class="ic">${Cues.CAUSE_ICON[top]}</span> ${t(Cues.causeLabelKey(top))} <small>· ${fmt(t('causeTimes'), { k: match.causeCount[top] })}</small>`;
  $('#lrStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.25}s">★</span>`).join('');
  let detail = '';
  if (spec.type === 'flip') detail = `${res.flipped} / ${spec.target}`;
  else if (spec.type === 'golden') detail = res.win ? t('goldenGot') : t('goldenMiss');
  else if (spec.type === 'goldenSide') detail = res.win ? t('goldenGot') : t('goldenSideMiss');
  else detail = `${res.me} : ${res.ai}`;
  if (spec.type === 'flip' && Cues.nearGoal(spec, res)) detail += ` — ${fmt(t('nearMiss'), { k: spec.target - res.flipped })}`; // 제목 '아깝다…'와 같은 규칙
  $('#lrDetail').textContent = detail;
  const grid = $('#lrCards');
  grid.innerHTML = '';
  rewards.forEach((id, i) => {
    const c = CARD_BY_ID[id];
    const div = document.createElement('div');
    div.className = 'rc r-' + c.rarity;
    div.style.animationDelay = (0.9 + i * 0.12) + 's';
    div.innerHTML = `<img alt="${cardName(c)}" src="${faceImage(id, 64)}">${!before.has(id) ? `<em>${t('newCard')}</em>` : ''}`;
    grid.appendChild(div);
  });
  $('#lrNext').hidden = !res.win;
  // 다음 판 소개는 지도 위에 연다(지도에서 고를 때와 같은 자리): 지난 판 HUD('판돈 0'·점수)·카드가 소개 뒤에 남지 않고, '뒤로'를 눌러도 빈 HUD 에 갇히지 않는다
  // 대박 판이었으면 마이크 제안을 먼저 닫고 이어 간다(maybeOfferMic(then))
  $('#lrNext').onclick = () => maybeOfferMic(() => { goHome(); openMap(); openLevelIntro(spec.n + 1); });
  $('#lrRetry').onclick = () => maybeOfferMic(() => { $('#lvResult').hidden = true; clearMatchMeshes(); startLevel(spec.n); });
  $('#lrMap').onclick = () => { $('#lvResult').hidden = true; goHome(); openMap(); };
  state = 'result';
  puffer.mode = 'hidden';
  $('#lvResult').hidden = false;
}

// ── 손맛 튜닝 패널 ─────────────────────────────────────
function openTune() {
  sfx.unlock(); sfx.pop();
  const box = $('#tuneRows');
  box.innerHTML = '';
  box.appendChild(coreSection()); // 맨 위: 조작 깃발 '쓸어 올리기(푸어억)' + 쓸기 연습판(스위치) — 아래 슬라이더 목록에선 뺀다
  box.appendChild(expSection()); // 그다음: 실험 '바람 도달 시간'(스위치)
  for (const k of Object.keys(TUNE_DEFAULTS)) {
    if (SWITCH_KEYS.has(k)) continue;
    const [mn, mx, st] = TUNE_RANGE[k];
    const row = document.createElement('label');
    row.className = 'trow';
    row.innerHTML = `<span>${t('tune_' + k)}</span><input id="tune-${k}" type="range" min="${mn}" max="${mx}" step="${st}" value="${feel[k]}"><b>${(+feel[k]).toFixed(2)}</b>`;
    const inp = row.querySelector('input');
    inp.addEventListener('input', () => { feel[k] = +inp.value; row.querySelector('b').textContent = (+inp.value).toFixed(2); });
    box.appendChild(row);
  }
  // 테스트용 레벨 바로가기 (재윤님이 새 판을 바로 해보게) — 주소 끝 #lv18 로도 열림
  const jump = document.createElement('div');
  jump.className = 'trow';
  jump.innerHTML = `<span>${t('tune_jump')}</span><input id="tune-jump" type="number" min="1" max="10000" value="${prog().level}" style="width:5.5em"><button class="btn blue" type="button" id="tuneJumpGo">GO</button>`;
  jump.querySelector('#tuneJumpGo').onclick = () => { const n = Math.max(1, Math.min(10000, +jump.querySelector('input').value || 1)); $('#tune').hidden = true; openLevelIntro(n); };
  box.appendChild(jump);
  // 소리·진동 시험(실기기에서 '푸'·진동이 안 올 때 캡처 한 장으로 원인 가르기 — diag.js)
  mountSoundTest(box, {
    sfx, t, micOn: () => micEnabled && mic.ready, micCtx: () => mic.ctxState, toggleMic,
    setSilentPlay: (v) => { AppAudio.setSilentPlay(v); profile.settings.silentPlay = !!v; Store.save(profile); },
  });
  $('#tune').hidden = false;
}
// ⚙ 맨 위 실험 칸: '바람 도달 시간'(06 §8.10·§8.11 · BLOCKERS G12). 지연·연출·멈칫 줄이기를 따로 켜서 비교, 수치 표시. 완료를 눌러야 저장(다른 손맛 값과 같음)
function expSection() {
  const wrap = document.createElement('div');
  wrap.className = 'exp';
  const sw = (k, on, val) => `<button type="button" class="exp-sw${on ? ' on' : ''}" id="exp-${k}" data-k="${k}" aria-pressed="${on}">${t('exp_' + k)} <b>${on ? t('expOn') + (val ? ` · ${val}` : '') : t('expOff')}</b></button>`;
  const render = () => {
    const lag = feel.jetLag > 0, fx = feel.airFx >= 0.5, cut = feel.hsCut >= 0.5;
    const warn = [fx && !lag ? t('expFxNeedsLag') : '', cut && !(lag && fx) ? t('expCutNeedsFx') : '', lag && expMicOn() ? t('expMicNote') : ''].filter(Boolean).join(' ');
    wrap.innerHTML = `<h3>${t('expTitle')}</h3><p class="exp-how">${t('expHow')}</p>`
      + `<div class="exp-btns">${sw('jetLag', lag, lag ? feel.jetLag : '')}${sw('airFx', fx)}${sw('hsCut', cut)}${sw('airLog', feel.airLog >= 0.5)}</div>`
      + `<p class="exp-how">${warn ? `<b>${warn}</b> ` : ''}${t('expNote')}</p>`;
    wrap.querySelectorAll('.exp-sw').forEach((b) => b.addEventListener('click', () => {
      sfx.pop();
      const k = b.dataset.k;
      if (k === 'jetLag') feel.jetLag = feel.jetLag > 0 ? 0 : JET_LAG_TEST;
      else feel[k] = feel[k] >= 0.5 ? 0 : 1;
      render();
    }));
  };
  render();
  return wrap;
}
function closeTune(reset) {
  if (reset) Object.assign(feel, TUNE_DEFAULTS);
  expSanitize();
  $('#sweepBtn').hidden = !(feel.core >= 0.5);
  profile.settings.feel = { ...feel };
  Store.save(profile);
  if (reset) openTune(); else $('#tune').hidden = true;
}
function tuneSummary() {
  return Object.entries(feel).map(([k, v]) => `${k}=${k === 'jetLag' ? +v : (+v).toFixed(2)}`).join(' ');
}

// ── 앨범 ───────────────────────────────────────────────
// 수집 테마 시안 탭 (2라운드 리서치 1순위: 동물 크리처 × 시즌 의상 × 시크릿) — 재윤님 비교용
function creatureImage(item, size, silhouette) {
  const key = 'cr:' + item.id + ':' + size + ':' + (silhouette ? 1 : 0);
  if (imgCache.has(key)) return imgCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  drawCreature(cv.getContext('2d'), size * 2, item, { silhouette });
  const url = cv.toDataURL('image/png');
  imgCache.set(key, url);
  return url;
}
function openPreview() {
  const grid = $('#albumGrid');
  grid.innerHTML = '';
  for (const it of SERIES_A.items) {
    const div = document.createElement('div');
    div.className = 'ac' + (it.secret ? ' r-epic' : '');
    div.innerHTML = `<img alt="${getLang() === 'ko' ? it.ko : it.en}" src="${creatureImage(it, 72, false)}"><span>${getLang() === 'ko' ? it.ko : it.en}</span>`;
    grid.appendChild(div);
  }
  $('#albumBar').style.width = '0%';
  $('#albumCount').textContent = getLang() === 'ko' ? SERIES_A.ko + ' — 9종 + 시크릿 1 (시안)' : SERIES_A.en + ' — 9 + 1 secret (concept)';
  document.querySelectorAll('#albumTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'preview'));
}

function openAlbum() {
  sfx.unlock(); sfx.pop();
  document.querySelectorAll('#albumTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'mine'));
  const grid = $('#albumGrid');
  grid.innerHTML = '';
  for (const c of CARDS) {
    const cnt = profile.inv[c.id] || 0;
    const div = document.createElement('div');
    div.className = 'ac r-' + c.rarity + (cnt ? '' : ' locked');
    div.innerHTML = `<img alt="${cardName(c)}" src="${faceImage(c.id, 72)}"><span>${cnt ? cardName(c) : '???'}</span>${cnt ? `<i>x${cnt}</i>` : ''}`;
    grid.appendChild(div);
  }
  $('#albumBar').style.width = (Store.ownedKinds(profile) / CARDS.length) * 100 + '%';
  $('#albumCount').textContent = `${Store.ownedKinds(profile)}/${CARDS.length}`;
  show('#album');
}

// ── 네트워크 PvP (P0.5a: 같은 브라우저 두 탭 = LocalNet · P0.5b: claude.ai 아티팩트 = ArtifactNet) ─────────────────────────
// 🧭 가설: 그 턴에 부는 사람의 기기가 심판(ShotRun: 새 월드·턴별 시드·스텝 판정)이고, 두 화면 모두 30Hz 궤적을 '꼭두각시 월드'
//   (turn.js puppetTable — 스텝을 안 돌리고 자세만 꽂는 월드, d.id = 판 id)에 꽂아 재생하면(쏜 사람도 자기 버퍼를 재생)
//   솔로 연출 코드(watchSim·react·collect·영수증)를 그대로 쓰면서 두 화면의 턴별 상태 해시가 100% 같다.
//   솔로 경로는 match.net 이 없으면 이 절의 함수를 하나도 안 부른다(가드 한 줄씩). 판가름 = tools/pvp-check.mjs
// 흐름: 로비(4자 코드) → 가위바위보(커밋-리빌) → 3판(판마다 선공 교대) → 결과. 상태 = 매치 문서 + 샷 문서의 순수 함수(pvp.js replayState)
// 시험 토글: ?pvplocal(LocalNet 켬) ?pvpbot(자동 손: 가위바위보·조준·당김을 합성 포인터로) ?pvpdrop=K(받은 trk K번째마다 버림 → db 이어 받기)
//   ?pvpclock=S(샷 시계 초) ?pvplag=ms(LocalNet 지연) ?pvpsame(같은 계정끼리 허용 — 아티팩트에선 로비 제목 5번 탭)
// P0.5b: Net 은 부팅 뒤에 정해진다(claude.use 는 최대 10초 → 부팅을 막지 않음). null 이면 PvP 버튼이 숨고 솔로는 그대로
let NET = null;
const netReady = resolveNet().catch(() => null);
const NET_CANON = Object.freeze({ x: 0, z: -1 }), NET_MIRROR = Object.freeze({ x: 0, z: 1 });
const PVP = { bot: param('pvpbot') != null, drop: Math.max(0, +(param('pvpdrop') || 0)), clock: +(param('pvpclock') || 0) || Pvp.SHOT_CLOCK };
const lobby = { n: 10, busy: false, token: 0, unsub: null, code: null, seat: null, room: null };
let pv = null; // 지금 재생 중인 숨 { player, tf, go, started, final, mine, key, tg, last, ... }
const sims = []; // 앞서 도는 물리: 쏜 사람 녹화(프레임당 8ms) · 받는 쪽 뒤 검증(3ms)
let netLastFrame = 0, netTickT = 0;
const pvpLog = (() => { try { return JSON.parse(sessionStorage.getItem('pvp-log') || '[]'); } catch (e) { return []; } })(); // 턴별 기록(두 탭 비교용, 새로고침해도 탭에 남음)
function pvpLogSave() { try { sessionStorage.setItem('pvp-log', JSON.stringify(pvpLog)); } catch (e) { /* 무시 */ } }
function pvpLogAdd(e) { pvpLog.push(e); pvpLogSave(); return e; }
window.__pvpLog = pvpLog;
window.__pvpMeter = () => NET?.meter.summary() ?? null;
window.__pvpRtt = () => match?.net?.rtt?.slice() ?? null;
const netResStr = (r) => `f:${r.flipped.join(',')}|o:${r.outs.join(',')}`;

// ── 로비 ──
// 문구: 아티팩트(친구 = 다른 사람)면 'Art' 짝이 있는 키는 그쪽(두 탭 시험 문구 → 친구 문구)
const tk = (k) => (NET?.kind === 'artifact' && t(k + 'Art') !== k + 'Art' ? k + 'Art' : k);
function refreshPvpChips() { document.querySelectorAll('#pvpChips button').forEach((b) => b.classList.toggle('on', +b.dataset.n === lobby.n)); }
function pvpErr(key) { const el = $('#pvpErr'); el.textContent = key ? t(tk(key)) : ''; el.hidden = !key; }
// 쓰기 거절 → 안내: 아티팩트는 권한 밖 쓰기를 invalid_argument 로 거절한다(db.d.ts). 용량은 quota_exceeded
const netErrKey = (e) => (e?.code === 'quota_exceeded' ? 'pvpQuota' : e?.code === 'invalid_argument' && NET?.kind === 'artifact' ? 'pvpNoWrite' : 'pvpNetErr');
// 같은 계정끼리(개발 토글): 기본은 막는다(기획서). 아티팩트는 주소 토글을 못 붙이니 로비 제목 5번 탭으로 켜고 끈다(이 브라우저에만)
function devSame() { if (param('pvpsame') != null) return true; try { return localStorage.getItem('pvp-dev-same') === '1'; } catch (e) { return false; } }
// 이어 하기 표시: db data/users/{uid}/pvp(다른 기기·새 탭) + 이 탭의 sessionStorage(같은 계정 두 탭이면 탭마다 자리가 다르다)
function tabActive(a) {
  try {
    if (a === undefined) return JSON.parse(sessionStorage.getItem('pvp-active') || 'null');
    if (a) sessionStorage.setItem('pvp-active', JSON.stringify(a)); else sessionStorage.removeItem('pvp-active');
  } catch (e) { /* 저장 안 됨 → db 만 */ }
  return null;
}
function netSetActive(net, a) { tabActive(a); return net.db.doc(Pvp.paths.active(net.uid)).set({ active: a }); }
function openPvpLobby() {
  if (!NET) return;
  sfx.unlock(); sfx.pop();
  $('#pvpPick').hidden = false; $('#pvpWait').hidden = true; pvpErr(null);
  $('#pvpLobby').hidden = false;
  refreshPvpChips();
}
function lobbyStop(leave) {
  lobby.token++;
  lobby.unsub?.(); lobby.unsub = null;
  if (leave) lobby.room?.leave().catch(() => {});
  lobby.room = null;
}
function closePvpLobby() {
  sfx.pop();
  const code = lobby.code, seat = lobby.seat;
  lobbyStop(true);
  if (code) {
    // 만들어 놓고 아무도 안 왔으면 방을 닫는다. 이미 둘이 앉았으면 나간 쪽의 기권(상대가 가위바위보에서 영영 기다리지 않게)
    const ref = NET.db.doc(Pvp.paths.match(code));
    ref.get().then((s) => {
      const m = s.data();
      if (!m || m.result || m.status === 'abandoned' || m.status === 'done') return;
      if (m.status === 'open') return ref.update({ status: 'abandoned', updatedAt: Date.now() });
      return ref.update({ status: 'abandoned', result: { winner: Pvp.other(seat), reason: 'resign', by: seat, at: Date.now() }, updatedAt: Date.now() });
    }).catch(() => {});
    netSetActive(NET, null).catch(() => {});
  }
  lobby.code = null;
  $('#pvpLobby').hidden = true;
}
// 각자 앨범에서 '보여 줄 딱지' n장의 사본(친선: 보관함은 안 바뀐다)
function pickShowCards(n) {
  const rng = mulberry32((Date.now() ^ ((Math.random() * 2 ** 31) | 0)) >>> 0);
  const owned = Object.keys(profile.inv).filter((k) => profile.inv[k] > 0 && CARD_BY_ID[k] && k !== 'golden');
  const pool = owned.length ? owned : CARDS.filter((c) => c.id !== 'golden').map((c) => c.id);
  return Array.from({ length: n }, () => pool[Math.floor(rng() * pool.length)]);
}
async function pvpCreate() {
  if (!NET || lobby.busy) return;
  lobby.busy = true; pvpErr(null); sfx.pop();
  try {
    const uid = NET.uid;
    let code = null;
    for (let i = 0; i < 12 && !code; i++) { const c = makeCode(NET.codeLen || 4); if (!(await NET.db.doc(Pvp.paths.match(c)).get()).exists) code = c; }
    if (!code) throw new Error('no free code');
    const n = lobby.n, at = Date.now();
    await NET.db.doc(Pvp.paths.seat(uid, code, 'a')).set({ v: 1, code, seat: 'a', uid, cards: pickShowCards(n), sv: 1, at });
    await NET.db.doc(Pvp.paths.match(code)).set({ v: 1, sim: shotSimV(), status: 'open', createdAt: at, updatedAt: at, host: uid, seats: { a: { uid, at }, b: null }, n, mode: 'fun', seed: null, pot: null, set: { games: Pvp.GAMES, g: 0 }, first: null, items: { goggles: 0 }, beat: 1, score: { a: 0, b: 0 }, result: null });
    await netSetActive(NET, { code, seat: 'a', at });
    netLobbyWait(code, 'a');
  } catch (e) { console.warn('[pvp] create', e?.code || e); pvpErr(netErrKey(e)); } finally { lobby.busy = false; }
}
async function pvpJoin() {
  if (!NET || lobby.busy) return;
  const code = ($('#pvpCodeIn').value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) { pvpErr('pvpBadCode'); return; }
  lobby.busy = true; pvpErr(null); sfx.pop();
  try {
    const uid = NET.uid, ref = NET.db.doc(Pvp.paths.match(code));
    let m = (await ref.get()).data();
    if (!m || m.status === 'abandoned' || m.status === 'done') { pvpErr('pvpBadCode'); return; }
    if (m.sim !== shotSimV()) { pvpErr('pvpSimDiff'); return; } // 같은 엔진·규칙이 아니면 해시가 안 맞는다
    if (m.seats?.a?.uid === uid && !devSame()) { pvpErr('pvpSelf'); return; } // 같은 사람끼리는 막는다(기획서: 개발 토글로만)
    if (m.seats?.b && m.seats.b.uid !== uid) { pvpErr('pvpFull'); return; }
    if (!m.seats?.b) {
      const lease = await ref.acquire({ holder: uid + ':' + (NET.peer || 'tab'), ttlMs: 5000 }); // 자리 잡기: 빌린 동안만 쓴다(get-then-set 경쟁 방지)
      if (!lease.acquired) { pvpErr('pvpFull'); return; }
      m = (await ref.get()).data();
      if (m.seats?.b && m.seats.b.uid !== uid) { pvpErr('pvpFull'); return; }
      const at = Date.now();
      await NET.db.doc(Pvp.paths.seat(uid, code, 'b')).set({ v: 1, code, seat: 'b', uid, cards: pickShowCards(m.n), sv: 1, at });
      await ref.update({ seats: { b: { uid, at } }, status: 'seated', updatedAt: at });
    }
    await netSetActive(NET, { code, seat: 'b', at: Date.now() });
    netLobbyWait(code, 'b');
  } catch (e) { console.warn('[pvp] join', e?.code || e); pvpErr(netErrKey(e)); } finally { lobby.busy = false; }
}
// 매치 문서에 시드·판이 생길 때까지 로비에서 기다림(호스트는 상대가 앉으면 직접 정한다). 재접속도 이 길
// 아티팩트 db onSnapshot 은 실시간이 안 되면 약 30초 폴링으로 떨어진다 → 같은 방 이름에 먼저 들어가 presence 가 바뀌면(상대가 앉음·판 정함)
// 바로 다시 읽고, 3초마다 한 번 더 읽는다(빠른 길 + 안전망). 문서가 진실, room 은 '지금 다시 읽어' 신호일 뿐
function netLobbyWait(code, seat) {
  lobbyStop(false);
  const tok = lobby.token;
  lobby.code = code; lobby.seat = seat;
  $('#pvpLobby').hidden = false; $('#pvpPick').hidden = true; $('#pvpWait').hidden = false; pvpErr(null);
  $('#pvpCode').textContent = code;
  $('#pvpStatus').textContent = t(seat === 'a' ? 'pvpWaiting' : 'pvpJoined');
  const ref = NET.db.doc(Pvp.paths.match(code));
  let writing = false, started = false;
  const handle = async (m) => {
    if (tok !== lobby.token || started) return;
    if (!m || m.status === 'abandoned') { pvpErr('pvpGone'); return; }
    if (seat === 'a' && m.seats?.b && !m.pot && !writing) {
      writing = true; // 호스트: 시드·판을 정하고 가위바위보로
      try {
        const as = (await NET.db.doc(Pvp.paths.seat(NET.uid, code, 'a')).get()).data();
        const bs = (await NET.db.doc(Pvp.paths.seat(m.seats.b.uid, code, 'b')).get()).data();
        const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
        const pot = Pvp.makePot(seed, as?.cards || pickShowCards(m.n), bs?.cards || pickShowCards(m.n));
        await ref.update({ seed, pot, status: 'rps', updatedAt: Date.now() });
        lobby.room?.presence({ ph: 'rps' }).catch(() => {}); // 참가자에게 '다시 읽어'
        if (tok === lobby.token && !started) handle((await ref.get()).data()); // 내 쓰기도 바로(구독이 늦어도)
      } catch (e) { writing = false; console.warn('[pvp] seed', e?.code || e); }
      return;
    }
    if (m.pot && m.seed != null) {
      started = true;
      lobbyStop(false); lobby.code = null; // 방은 나가지 않는다: startNetMatch 가 같은 이름으로 들어가면 같은 방(presence 그대로)
      $('#pvpLobby').hidden = true;
      startNetMatch(code, seat, m);
    }
  };
  const unSnap = ref.onSnapshot((s) => handle(s.data()), (e) => console.warn('[pvp] lobby snap', e?.code));
  const poke = () => { if (tok === lobby.token && !started) ref.get().then((s) => handle(s.data())).catch(() => {}); };
  const poll = setInterval(poke, 3000);
  let unPeers = null;
  NET.room.join('m-' + code.toLowerCase()).then((room) => {
    if (tok !== lobby.token) { if (!started && lobby.code !== code && !(match?.net && !match.net.ended)) room.leave().catch(() => {}); return; } // 그새 로비를 닫았다(대결로 넘어간 거면 같은 방을 쓴다)
    lobby.room = room;
    room.presence({ seat, uid: NET.uid, ph: 'lobby' }).catch(() => {});
    unPeers = room.onPeers((ch) => { if ([...ch.joined, ...ch.updated].some((p) => !p.sameTab)) poke(); });
  }).catch((e) => console.warn('[pvp] lobby room', e?.code || e));
  lobby.unsub = () => { unSnap(); clearInterval(poll); unPeers?.(); };
}
async function netBoot() {
  if (NET.kind === 'artifact') { // 문구: 두 탭 시험 → 친구
    for (const id of ['pvpBtn', 'pvpOr', 'pvpShare']) { const el = document.getElementById(id) || document.querySelector(`[data-t="${id}"]`); if (el) el.dataset.t = tk(id); }
    refreshTexts();
  }
  $('#pvpBtn').hidden = false;
  try {
    // 이 탭의 표시가 먼저(같은 계정 두 탭), 없으면 db(다른 기기·새 탭)
    const ta = tabActive(), cands = [];
    if (ta?.code) cands.push({ ...ta, tab: true });
    const a = (await NET.db.doc(Pvp.paths.active(NET.uid)).get()).data()?.active;
    if (a?.code && !(ta && ta.code === a.code && ta.seat === a.seat)) cands.push(a);
    for (const c of cands) {
      const m = (await NET.db.doc(Pvp.paths.match(c.code)).get()).data();
      const live = m && m.status !== 'done' && m.status !== 'abandoned' && !m.result && m.seats?.[c.seat]?.uid === NET.uid;
      if (!live) { if (c.tab) tabActive(null); else await NET.db.doc(Pvp.paths.active(NET.uid)).set({ active: null }); continue; }
      if (lobby.code || (match?.net && !match.net.ended) || state !== 'home') return; // 그새 사람이 로비·대결(솔로 포함)을 열었다 → 끊지 않는다(다음 새로고침 때 이어 하기)
      toast(t('pvpResumed'));
      tabActive({ code: c.code, seat: c.seat, at: c.at || Date.now() });
      netLobbyWait(c.code, c.seat); // 판이 정해져 있으면 바로 대결로(문서로 다시 계산)
      return;
    }
  } catch (e) { console.warn('[pvp] resume', e?.code || e); }
}

// ── 대결 시작 ──
async function startNetMatch(code, seat, m) {
  sfx.unlock();
  const my = ++runId;
  netStop();
  sweepStop();
  for (const x of homeMeshes) scene.remove(x);
  homeMeshes = [];
  lastBreath.aim = null;
  const net = NET, uid = net.uid, other = Pvp.other(seat);
  const oppUid = m.seats?.[other]?.uid || null;
  const M = {
    net, code, seat, other, uid, oppUid, my, room: null, seed: m.seed >>> 0, pot: m.pot, first: m.first || null, beatTier: m.beat ?? 1, n: m.n,
    doc: m, inbox: new Map(), sendq: [], unsubs: [], waiters: [], mySeat: null, oppSeatDb: null, oppSeatPres: null, oppSeat: null, oppPres: null,
    oppHere: false, oppSeen: false, oppGoneAt: 0, live: [], score: { a: 0, b: 0 }, games: [], prev: '00000000', g: 0, t: 0, cur: null,
    ended: false, pres: {}, seatQ: Promise.resolve(), trkSeen: 0, preMiss: 0, fresh: true, clockEnd: 0, forceFire: null,
    sentAt: new Map(), rtt: [], pollAt: 0, matchPollAt: 0, meOffAt: 0,
  };
  M.cardOf = (pid) => (M.pot[pid] && CARD_BY_ID[M.pot[pid].c] ? M.pot[pid].c : 'mandu');
  M.mySeat = (await net.db.doc(Pvp.paths.seat(uid, code, seat)).get()).data() || { v: 1, code, seat, uid, cards: [], sv: 0 };
  const oppRef = oppUid ? net.db.doc(Pvp.paths.seat(oppUid, code, other)) : null;
  const opp0 = oppRef ? (await oppRef.get()).data() : null;
  const names = oppUid ? await net.user.profiles([oppUid]).catch(() => ({})) : {};
  if (my !== runId) return;
  const rivalName = names?.[oppUid]?.name || t('rival'); // 이름은 db 에 안 남긴다(id 만) — 보는 사람 기준으로 그때그때
  const rivalCard = CARD_BY_ID[opp0?.cards?.[0]] || CARDS[0];
  match = { net: M, seed: M.seed, rng: mulberry32(M.seed), myStake: [], aiStake: [], pot: m.pot.map((p) => ({ id: p.c, from: p.s === seat ? 'me' : 'ai' })), rivalName, rivalCard, mode: 'fun', n: m.n, turn: 'me', turnNo: 0, best: 0, flipsMe: 0 };
  M.room = await net.room.join('m-' + code.toLowerCase());
  if (my !== runId) { M.room.leave(); return; }
  for (const topic of ['blow', 'trk', 'done']) M.unsubs.push(M.room.on(topic, (msg) => netOnMsg(M, topic, msg)));
  M.unsubs.push(M.room.onPeers((ch) => netPeers(M, ch)));
  if (oppRef) M.unsubs.push(oppRef.onSnapshot((s) => { M.oppSeatDb = s.data() || null; netOppSeat(M); }));
  M.unsubs.push(net.db.doc(Pvp.paths.match(code)).onSnapshot((s) => netMatchDoc(M, s.data())));
  netPresence(M, { seat, uid, ph: 'wait', ...(M.mySeat.sv ? { s: seatPres(M.mySeat) } : {}) }); // 새로고침해도 내 자리 상태(가위바위보·ack)를 바로 다시 알린다
  if (!netTickT) netTickT = setInterval(netTick, 100);
  window.__pvp = () => netState(M);
  state = 'match'; pose = 'eye'; gogglesOn = false; camZoom = 0;
  snapCam();
  clearMatchMeshes();
  $('#rivalName').textContent = rivalName;
  $('#rivalAva').src = faceImage(rivalCard.id, 48);
  $('#meScore').textContent = '0'; $('#aiScore').textContent = '0';
  $('#potLbl').textContent = fmt(t('pvpGame'), { g: 1 }); $('#potN').textContent = String(m.pot.length);
  puffer.mode = 'idle'; puffer.p = 0;
  show('#hud');
  await vsSplash();
  if (my !== runId) return;
  await netMatchLoop(M);
}
function netState(M) {
  return { code: M.code, seat: M.seat, first: M.first, g: M.g, t: M.t, live: M.live.length, score: { ...M.score }, games: M.games.slice(), ended: M.ended, mine: !!M.cur?.mine, key: M.cur?.key ?? null, playing: !!pv, sims: sims.length, preMiss: M.preMiss, oppHere: M.oppHere, state };
}

async function netMatchLoop(M) {
  const alive = () => M.my === runId && !M.ended;
  if (!M.first) {
    const first = await netRps(M);
    if (!alive() || !first) return;
    M.first = first;
    if (M.seat === 'a') M.net.db.doc(Pvp.paths.match(M.code)).update({ first, status: 'play', updatedAt: Date.now() }).catch((e) => console.warn('[pvp] first', e));
  }
  const st = await netLoadState(M);
  if (!alive()) return;
  M.games = st.games.slice();
  for (let g = st.g; g < Pvp.GAMES; g++) {
    const resume = g === st.g;
    M.g = g;
    M.live = resume ? st.live.slice() : Array.from({ length: M.pot.length }, (_, i) => i);
    M.score = resume ? { ...st.score } : { a: 0, b: 0 };
    await netGameStart(M, g, resume ? st : null);
    if (!alive()) return;
    for (let ti = resume ? st.t : 0; M.live.length > 0 && ti < Pvp.MAX_TURNS; ti++) {
      M.t = ti;
      match.turnNo = ti;
      const ok = Pvp.shooterOf(M.first, g, ti) === M.seat ? await netMyTurn(M, g, ti) : await netRemoteTurn(M, g, ti);
      if (!alive() || !ok) return;
    }
    M.games[g] = { ...M.score };
    await netGameEnd(M, g);
    if (!alive()) return;
  }
  await netSetEnd(M);
}

// 문서 → 지금 판·턴. 못 본 상대 숨(내 ack 뒤)은 빼고 계산 → 그 턴을 db 궤적으로 다시 보여 준다
async function netLoadState(M) {
  const docs = new Map();
  for (const [uid, seat] of [[M.uid, M.seat], [M.oppUid, M.other]]) {
    if (!uid) continue;
    try {
      const q = await M.net.db.collection(Pvp.paths.shots(uid, M.code, seat)).get();
      for (const d of q.docs) { const x = d.data(); if (x && x.seat === seat) docs.set(d.id, x); }
    } catch (e) { console.warn('[pvp] shots', e); }
  }
  const base = { pot: M.pot, first: M.first };
  let st = Pvp.replayState(base, docs);
  const last = st.applied.at(-1);
  if (last && last.seat === M.other && M.mySeat?.ack !== last.key) { docs.delete(last.key); st = Pvp.replayState(base, docs); }
  for (const a of st.applied) {
    if (pvpLog.some((e) => e.code === M.code && e.key === a.key)) continue;
    pvpLogAdd({ code: M.code, key: a.key, g: a.g, t: a.t, seat: a.seat, role: 'rebuild', qhash: a.doc.qhash, expect: a.doc.qhash, res: netResStr(a.doc.res), tag: Pvp.stateTag(a.live, a.score, a.doc.qhash), at: Date.now() });
  }
  if (st.applied.length) M.prev = String(st.applied.at(-1).doc.qhash).slice(0, 8);
  return st;
}

async function netGameStart(M, g, st) {
  clearMatchMeshes();
  M.fresh = true;
  if (st) for (const a of st.applied) if (a.g === g) for (const pid of a.doc.res.flipped) netPileAdd(M, pid, a.seat === M.seat ? 'me' : 'ai'); // 이어 하기: 이미 가져간 딱지
  $('#meScore').textContent = String(piles.me.length);
  $('#aiScore').textContent = String(piles.ai.length);
  $('#potLbl').textContent = fmt(t('pvpGame'), { g: g + 1 });
  $('#potN').textContent = String(M.live.length);
  const fs = Pvp.firstOf(M.first, g);
  await banner(`${fmt(t('pvpGameStart'), { g: g + 1 })} · ${fs === M.seat ? t('pvpMeFirst') : t('pvpOppFirst')}`, fs === M.seat ? 'b-me' : 'b-ai');
}
function netPileAdd(M, pid, who) {
  const m = makeDiscMesh(M.cardOf(pid));
  const dest = who === 'me' ? new THREE.Vector3(-pileX, 0, 2.4) : new THREE.Vector3(pileX, 0, -3.6);
  m.position.copy(dest).add(new THREE.Vector3(0, pileY(piles[who].length), 0));
  m.userData.anim = true;
  scene.add(m);
  piles[who].push(m);
}
async function netGameEnd(M, g) {
  const s = M.games[g];
  pvpLogAdd({ code: M.code, key: 'game' + g, role: 'game', tag: `${s.a}-${s.b}`, at: Date.now() });
  const me = s[M.seat], op = s[M.other];
  const el = $('#big');
  el.innerHTML = `${fmt(t('pvpGameEnd'), { g: g + 1 })} <small>${me} : ${op}</small>`;
  el.className = 'big ' + (me > op ? 'r3' : me < op ? 'r0 ai' : 'r1');
  el.hidden = false; void el.offsetWidth; el.classList.add('go');
  if (me > op) sfx.big();
  await wait(1600);
  el.hidden = true;
}
async function netSetEnd(M) {
  const r = Pvp.setResult(M.games);
  M.ended = true;
  pvpLogAdd({ code: M.code, key: 'set', role: 'set', tag: `${M.games.map((s) => `${s.a}-${s.b}`).join('|')}:${r.winner || 'draw'}`, at: Date.now() });
  try {
    if (M.seat === 'a') await M.net.db.doc(Pvp.paths.match(M.code)).update({ status: 'done', result: { winner: r.winner, reason: 'set', games: M.games, at: Date.now() }, score: { a: r.won.a, b: r.won.b }, updatedAt: Date.now() });
    await netSetActive(M.net, null);
  } catch (e) { console.warn('[pvp] end', e?.code || e); }
  netShowResult(M, { winner: r.winner, reason: 'set', won: r.won });
}
function netShowResult(M, r) {
  simOn = false; tension(false);
  M.clockEnd = 0;
  profile.stats.pvp = profile.stats.pvp || { played: 0, won: 0 };
  profile.stats.pvp.played++;
  if (r.winner === M.seat) profile.stats.pvp.won++;
  Store.save(profile);
  const res = r.winner == null ? 'draw' : r.winner === M.seat ? 'win' : 'lose';
  sfx.fanfare(res !== 'lose');
  if (res === 'win') fx.confetti({ x: 0, y: 0, z: 0 }, 200);
  $('#resTitle').textContent = t(res);
  $('#resTitle').className = 'res-title ' + res;
  const won = r.won || { a: 0, b: 0 };
  $('#resScore').innerHTML = r.reason === 'resign' ? '' : `<b>${won[M.seat]}</b> <span>:</span> <b>${won[M.other]}</b>`;
  $('#resBest').textContent = r.reason === 'resign' ? t('pvpOppResigned') : M.games.map((s, i) => `${fmt(t('pvpGame'), { g: i + 1 })} ${s[M.seat]}:${s[M.other]}`).join(' · ');
  $('#resNet').textContent = t('pvpFunNote');
  $('#resCards').innerHTML = '';
  $('#againBtn').hidden = true;
  $('#pvpClock').hidden = true; $('#pvpConn').hidden = true;
  state = 'result';
  puffer.mode = 'hidden';
  show('#result');
  window.__pvpDone = { winner: r.winner, reason: r.reason, games: M.games.slice(), seat: M.seat, code: M.code };
}

// ── 한 턴: 공통 ──
// 턴 시작: 새 월드(ShotRun: 쏜 사람 = 심판 / 받는 쪽 = 뒤 검증용)를 쌓고, 그 pre 로 화면용 꼭두각시를 세운다(받는 쪽은 거울)
async function netTurnSetup(M, g, ti, mine) {
  const seeds = turnSeeds(M.seed, g, ti, mine ? M.seat : M.other);
  const run = new ShotRun({ ids: M.live, seeds, cardOf: M.cardOf });
  const pre = encodeState(run.table);
  await netInstallPuppet(M, puppetTable(pre, { cardOf: M.cardOf, mirror: !mine }));
  return { run, seeds, pre, preB64: toB64(pre), ids: M.live.slice() };
}
async function netInstallPuppet(M, pup) {
  const old = table;
  table = pup;
  if (old && old !== pup && old.puppet) { try { old.world.free(); } catch (e) { /* 이미 반납 */ } }
  if (M.fresh) { // 판의 첫 턴: 메시를 새로 만들고 떨어지며 쌓이는 연출
    M.fresh = false;
    for (const m of meshes.values()) scene.remove(m);
    meshes.clear();
    for (const d of pup.discs) { const m = makeDiscMesh(d.cardId); meshes.set(d.id, m); scene.add(m); }
    syncMeshes();
    await introDrop();
    return;
  }
  // 다시 쌓기 연출: 지금 메시 자리 → 새 더미 자세 (솔로 restack 과 같은 0.55초)
  const anims = [];
  const live = pup.liveDiscs().filter((d) => meshes.get(d.id));
  const rest = paper.restPositions(live.map((d) => ({ id: d.id, body: d.body, mesh: meshes.get(d.id) }))); // 솔로 restack 과 같은 목표(보이는 자리) → 끝에서 안 튐
  for (const d of live) {
    const m = meshes.get(d.id);
    m.userData.anim = true;
    const r = rest.get(d.id);
    anims.push({ m, from: m.position.clone(), q0: m.quaternion.clone(), to: r.p, q1: r.q });
  }
  sfx.whoosh();
  await addTween(0.55, (k) => {
    const e = easeInOut(k);
    for (const a of anims) { a.m.position.lerpVectors(a.from, a.to, e); a.m.position.y += Math.sin(Math.PI * k) * 0.8; a.m.quaternion.slerpQuaternions(a.q0, a.q1, e); }
  });
  for (const a of anims) a.m.userData.anim = false;
  syncMeshes();
  for (const a of anims) paper.land(a.m, 0.5);
  sfx.clack(0.6);
  await wait(200);
}
// 바람 연출(솔로 blow 의 화면 부분과 같은 순서). 물리는 ShotRun 이, 화면은 궤적 재생이 맡는다
async function netBlowFx(M, raw, shot, who, mine) {
  const g = shotGeometry({ h: shot.h, lat: shot.lat || 0, dir: mine ? NET_CANON : NET_MIRROR });
  if (mine) {
    takeCueSnap(raw, shot, g);
    puffer.snapUntil = performance.now() + 900; puffer.snapP = raw.power; puffer.snapN = liveCount();
    lastBreath.p = raw.power; lastBreath.aim = visAim(g); lastBreath.normal = g.normal.clone();
    profile.tutorialPuffs = (profile.tutorialPuffs || 0) + 1; Store.save(profile);
  }
  setTimeout(() => breathFeedback(shot.ratio, who), 380);
  breath.mode = 'blow'; breath.t = 0; breath.p = Math.min(1.2, raw.power / sweetHiFor(liveCount())); breath.who = who; breath.ratio = shot.ratio;
  breath.air = null; // 대결: 실험 연출 없음(지금 연출 그대로)
  puffer.who = who;
  if (who === 'ai') $('#puffWrap').classList.add('ai');
  puffer.mode = 'blow'; puffer.p = shot.power; puffer.fill = clamp(raw.power / Rules.POUCH_FULL, 0, 1); puffer.ratio = shot.ratio ?? 1;
  puffer.strain = 0; puffer.full = false;
  breath.press = null; breath.full = false; breath.over = false; breath.strain = 0;
  const hs = Math.round(60 + 60 * clamp(shot.ratio ?? 0.8, 0, 1));
  hitStopUntil = performance.now() + hs;
  await wait(hs);
  hideGizmo();
  sfx.puff(Math.min(1.2, raw.power), shot.ratio ?? 1);
  if (mine) { navigator.vibrate?.(Math.round(20 + shot.power * 30)); window.__lastShot = { pose: raw.pose || 'eye', mouthY: raw.mouthY ?? null, power: raw.power }; }
  const windFrom = raw.mouthY != null ? new THREE.Vector3(g.aim.x - g.dir.x * Rules.LIP_BACK, raw.mouthY, g.aim.z - g.dir.z * Rules.LIP_BACK) : g.origin;
  const va = visAim(g);
  fx.wind(windFrom, va, shot.power, who === 'me' ? 0xffffff : 0xffe7a0);
  if (shot.h < table.columnTop() * 0.15) fx.emit({ at: { x: g.aim.x, y: 0.05, z: g.aim.z }, n: 40, color: 0xc9a77a, speed: 2.4, up: 1.2, life: 0.8, size: 0.32, gravity: 2 });
  fx.emit({ at: { x: g.aim.x, y: Math.max(0.05, va.y), z: g.aim.z }, n: 18, color: 0xfff6e0, speed: 2.2 * shot.power, up: 1.2, life: 0.5, size: 0.3, gravity: 1 });
  shake = 0.18 + raw.power * 0.22;
  flash(0.55 * Math.min(1, raw.power));
  shockwave(table.pileCenter(), raw.power);
  if (shot.blast > 0.15) {
    sfx.whoosh();
    shake += 0.25 * Math.min(1, shot.blast);
    for (let i = 0; i < 3; i++) fx.emit({ at: { x: g.aim.x, y: 0.15 + i * 0.4, z: g.aim.z }, n: 22, color: 0xd9c7a8, speed: 7 * Math.min(1.2, shot.blast), up: 0.6, life: 0.9, size: 0.38, gravity: 0.5, dir: { x: g.dir.x, y: 0, z: g.dir.z } });
  }
  simWatch.revealed = new Set(table.liveDiscs().filter((d) => table.faceUp(d) > 0.5).map((d) => d.id));
  simWatch.count = 0; simWatch.glowed = new Set(); simWatch.outShown = new Set(); simWatch.outs = 0;
  simWatch.shooter = who; simWatch.simTime = 0; simWatch.quiet = 0; simWatch.vy.clear(); simWatch.resolve = null;
  slowUntil = performance.now() + 120 + 380;
  setTimeout(() => { puffer.mode = 'idle'; puffer.p = 0; puffer.aimX = 0; $('#puffWrap').classList.remove('ai'); puffer.who = 'me'; }, 450);
}
// 재생: 프레임마다 궤적 자세를 꼭두각시에 꽂는다. 속도는 자세 차이로 → watchSim(탁 소리·+1·OUT)이 솔로와 같이 돈다
function netPlayTo(P, tf, force = false) {
  const dts = (tf - P.tf) / 30;
  if (dts <= 0 && !force) return;
  P.tf = tf;
  const poses = P.player.poseAt(tf);
  for (const d of table.liveDiscs()) {
    const ps = poses.get(d.id);
    if (!ps) continue;
    const lp = P.last.get(d.id);
    setDiscPose(d, ps);
    if (lp && dts > 0) d.body.setLinvel({ x: (ps.p.x - lp.x) / dts, y: (ps.p.y - lp.y) / dts, z: (ps.p.z - lp.z) / dts }, false);
    P.last.set(d.id, ps.p);
    d.off = ps.p.y < -3;
  }
  simWatch.simTime += Math.max(0, dts);
  syncMeshes();
  watchSim();
  if (!P.plusAt && simWatch.count > 0) { P.plusAt = Date.now(); P.plusPerf = performance.now(); } // 놓기 → 첫 '+1' (쏜 쪽·받는 쪽 둘 다 → 차이 = 네트워크 길이 더한 지연. 두 탭은 같은 시계)
  if (P.final && P.player.received >= P.final.frames && P.tf >= P.final.frames) netFinishPlayback(P);
}
function netFinishPlayback(P) {
  if (P.finished) return;
  P.finished = true;
  if (pv === P) pv = null;
  P.resolve?.(true);
  P.wake?.();
}
function netAbort(P) {
  if (P.finished) return;
  P.finished = true;
  if (pv === P) pv = null;
  P.resolve?.(false);
}
function netFrame(dt) {
  const M = match.net;
  const nowT = performance.now(), frameMs = netLastFrame ? Math.min(250, nowT - netLastFrame) : 16.7;
  netLastFrame = nowT;
  // 예산은 프레임 간격에 비례(60Hz 면 8ms·3ms = 문서값). 느린 기기(30fps 등)에서도 미리 시뮬이 실시간보다 앞서게
  for (const s of sims.slice()) netStepSim(s, s.budget * Math.max(1, frameMs / 16.7));
  netPump(M);
  const P = pv;
  if (P && P.started && table && !P.finished) {
    if (!P.go && (P.player.received >= 8 || P.final)) P.go = true; // 0.25초(8프레임) 쌓이면 재생 시작
    if (P.go && dt > 0) netPlayTo(P, Math.min(P.player.received, P.final ? P.final.frames : Infinity, P.tf + dt * timeScale * 30));
    if (P.final && P.player.received >= P.final.frames && P.tf >= P.final.frames) netFinishPlayback(P);
  }
  netClockUi(M);
  netConnUi(M);
}
// 탭이 숨으면 rAF 가 멈춘다 → 물리·보내기·재생·트윈을 마저 끝내 흐름이 막히지 않게(상대는 기다리지 않는다)
function netTick() {
  const M = match?.net;
  if (!M) return;
  if (document.hidden || performance.now() - netLastFrame > 1000) {
    for (const s of sims.slice()) netStepSim(s, Infinity);
    netPump(M);
    const P = pv;
    if (P && P.started && P.final && P.player.received >= P.final.frames) netPlayTo(P, P.final.frames, true);
    stepTweens(1);
  }
  netClockUi(M);
  netConnUi(M);
  netPoll(M);
}
// 안전망 읽기(3초마다, 기다릴 때만): 아티팩트 db onSnapshot 은 실시간이 안 되면 약 30초 폴링으로 떨어진다(db.d.ts).
// room 이 주 경로지만 재접속·새로고침 직후엔 room 메시지가 없다 → 기다리는 문서만 직접 다시 읽는다(상대 자리 · 상대 샷 · 매치 문서)
function netPoll(M) {
  const nowT = performance.now();
  if (M.ended || nowT - M.pollAt < 3000) return;
  M.pollAt = nowT;
  const db = M.net.db;
  if (M.waiters.length && M.oppUid) db.doc(Pvp.paths.seat(M.oppUid, M.code, M.other)).get().then((sn) => {
    const d = sn.data();
    if (d && (d.sv || 0) > (M.oppSeatDb?.sv || 0)) { M.oppSeatDb = d; netOppSeat(M); }
  }).catch(() => {});
  const ib = M.cur && !M.cur.mine ? M.inbox.get(M.cur.key) : null;
  if (ib?.ref && !ib.doc) ib.ref.get().then((sn) => ib.onDoc?.(sn)).catch(() => {});
  if (nowT - M.matchPollAt > 6000) { M.matchPollAt = nowT; db.doc(Pvp.paths.match(M.code)).get().then((sn) => netMatchDoc(M, sn.data())).catch(() => {}); }
}
function netStepSim(s, budget) {
  const t0 = performance.now();
  try {
    while (!s.run.done && performance.now() - t0 < budget) s.run.advance(4); // 4스텝 = 30Hz 한 프레임
  } catch (e) {
    console.error('[pvp] sim', e);
    sims.splice(sims.indexOf(s), 1);
    return;
  }
  s.onFrames?.();
  if (s.run.done && sims.includes(s)) { sims.splice(sims.indexOf(s), 1); s.onDone(s.run.record); }
}
// 보내기 줄: trk 는 50ms 에 하나(받는 쪽 재생은 초당 3.75조각이면 충분, emit+presence 예산 초당 40을 넉넉히 남김), 순서 유지
function netEmit(M, topic, data) { M.sendq.push([topic, data]); netPump(M); }
function netPump(M) {
  if (!M?.room) return;
  const nowT = performance.now();
  while (M.sendq.length) {
    const [topic, data] = M.sendq[0];
    if (topic === 'trk' && nowT - (M.lastTrkAt || 0) < 50) break;
    M.sendq.shift();
    if (topic === 'trk') M.lastTrkAt = nowT;
    if (M.sentAt.size >= 400) M.sentAt.delete(M.sentAt.keys().next().value); // 끊긴 동안 보낸 건 메아리가 안 온다 → 오래된 것부터 버림
    M.sentAt.set(`${topic}|${data?.t}|${data?.seq ?? ''}`, nowT); // 내 메아리(isMe && sameTab)까지 = room 왕복(RTT)
    M.room.emit(topic, data).catch((e) => console.warn('[pvp] emit', topic, e.code || e.message));
  }
}
function netPresence(M, patch) {
  if (!M.room) return null;
  let ch = false;
  for (const [k, v] of Object.entries(patch)) if (JSON.stringify(M.pres[k]) !== JSON.stringify(v)) { M.pres[k] = v; ch = true; }
  if (ch) return (M.presP = M.room.presence(patch).catch((e) => console.warn('[pvp] presence', e.code || e.message)));
  return null;
}
// 내 조준 → presence(높이·좌우·볼 3단만. 실제 숨 값은 보내지 않는다 — 상대가 베끼지 못하게)
function netAimPresence(a) {
  const M = match?.net;
  if (!M || !M.cur?.mine || !M.room) return;
  if (!a) { netPresence(M, { ph: 'aim', h: null, lat: null, cheek: 0 }); return; }
  const F = Rules.POUCH_FULL, p = (a.bc ? a.eff : a.power) || 0;
  netPresence(M, { ph: 'pull', h: Math.round(a.h * 1000) / 1000, lat: Math.round((a.lat || 0) * 1000) / 1000, cheek: p < 0.4 * F ? 0 : p < 0.8 * F ? 1 : 2, pose: a.pose || 'eye' });
}
// 상대 조준 그리기: 거울 좌표(바람 +z), 볼은 3단. 물결·띠는 절대 안 그린다
function netShowOppAim(M) {
  const p = M.oppPres;
  if (!p || !M.cur || M.cur.mine || p.key !== M.cur.key || pv || !table || state !== 'match') return;
  puffer.who = 'ai'; breath.who = 'ai';
  $('#puffWrap').classList.add('ai');
  if (p.ph === 'pull' && p.h != null) {
    const tierP = [0.35, 0.7, 1.02][p.cheek | 0] * Rules.POUCH_FULL;
    puffer.mode = 'charge'; puffer.p = tierP; puffer.strain = 0; puffer.full = false;
    showGizmo({ dir: NET_MIRROR, lat: p.lat || 0, h: p.h, power: tierP }, 0xffffff);
  } else if (puffer.mode === 'charge') { puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); }
}
function netPeers(M, ch) {
  const cands = ch.peers.filter((p) => !p.sameTab && p.presence && p.presence.seat === M.other && (!M.oppUid || p.by === M.oppUid || p.presence.uid === M.oppUid)).sort((a, b) => b.updatedAt - a.updatedAt);
  const opp = cands[0] || null;
  M.oppHere = !!opp;
  if (opp) {
    M.oppSeen = true; M.oppGoneAt = 0;
    M.oppPres = opp.presence;
    if (opp.presence.s) { M.oppSeatPres = opp.presence.s; netOppSeat(M); }
    netShowOppAim(M);
    return;
  }
  // 기권한 상대는 s.resign presence 바로 뒤에 방을 나간다 → 둘이 한 묶음으로 오면 peers 엔 없고 updated·left 에만 마지막 presence 가 있다
  const gone = [...(ch.updated || []), ...(ch.left || [])].find((p) => !p.sameTab && p.presence?.seat === M.other && p.presence.s?.resign && (!M.oppUid || p.by === M.oppUid || p.presence.uid === M.oppUid));
  if (gone) { M.oppSeatPres = gone.presence.s; netOppSeat(M); if (M.ended) return; }
  if (!M.oppGoneAt) M.oppGoneAt = performance.now();
}
function netConnUi(M) {
  const el = $('#pvpConn'), nowT = performance.now();
  // 내 연결: connected() 가 false 로 2초 넘게 머물 때만 끊김(플랫폼은 주기적으로 잠깐 다시 잇는다 — room.d.ts)
  const conn = M.room ? M.room.connected() : true;
  if (conn) M.meOffAt = 0; else if (!M.meOffAt) M.meOffAt = nowT;
  const live = !M.ended && state === 'match';
  const meAway = live && M.meOffAt && nowT - M.meOffAt > 2000;
  const away = live && M.oppSeen && !M.oppHere && M.oppGoneAt && nowT - M.oppGoneAt > 2000;
  const key = meAway ? 'pvpMeAway' : away ? 'pvpOppAway' : null;
  if (el.hidden === !!key || (key && el.dataset.k !== key)) { el.hidden = !key; el.dataset.k = key || ''; if (key) el.textContent = t(key); }
}
// 샷 시계: 내 차례면 내 시계(다 되면 forceFire), 상대 차례면 상대 presence 의 clk
function netClockStart(M) { M.clockEnd = performance.now() + PVP.clock * 1000; M.clockFired = false; M.clkSent = null; }
function netClockStop(M) { M.clockEnd = 0; }
function netClockUi(M) {
  const el = $('#pvpClock');
  let s = null, ai = false;
  if (M.clockEnd) s = Math.max(0, Math.ceil((M.clockEnd - performance.now()) / 1000));
  else if (M.cur && !M.cur.mine && !pv && M.oppPres?.key === M.cur.key && M.oppPres?.clk != null && (M.oppPres.ph === 'aim' || M.oppPres.ph === 'pull')) { s = M.oppPres.clk; ai = true; }
  const on = s != null && state === 'match' && !M.ended;
  if (el.hidden === on) el.hidden = !on;
  if (on) { const txt = String(s); if (el.textContent !== txt) el.textContent = txt; el.classList.toggle('low', s <= 5); el.classList.toggle('ai', ai); }
  if (M.clockEnd) {
    if (s !== M.clkSent) { M.clkSent = s; netPresence(M, { clk: s }); }
    if (s <= 0 && !M.clockFired) { M.clockFired = true; toast(t('pvpAuto')); M.forceFire?.(); }
  }
}
// 자리 상태(내 자리 문서 = 진실, presence 의 s = 빠른 길)
function netSeat(M, mutate) {
  const s = JSON.parse(JSON.stringify(M.mySeat || {}));
  mutate(s);
  s.sv = (s.sv || 0) + 1; s.at = Date.now();
  M.mySeat = s;
  netPresence(M, { s: seatPres(s) });
  const ref = M.net.db.doc(Pvp.paths.seat(M.uid, M.code, M.seat));
  M.seatQ = M.seatQ.then(() => ref.set(s)).catch((e) => console.warn('[pvp] seat', e.code || e.message)); // 한 문서에 쓰기는 하나씩
  return M.seatQ;
}
const seatPres = (s) => ({ sv: s.sv || 0, rps: s.rps || null, ack: s.ack || null, resign: !!s.resign });
function netOppSeat(M) {
  M.oppSeat = Pvp.newerSeat(M.oppSeatDb, M.oppSeatPres);
  if (M.oppSeat?.resign && !M.ended && M.my === runId) { netOppResigned(M); return; } // 기권: 자리 상태(presence 빠른 길)로도 — 매치 문서 구독이 폴링이어도 바로
  for (const w of M.waiters.slice()) if (M.oppSeat && w.pred(M.oppSeat)) { M.waiters.splice(M.waiters.indexOf(w), 1); w.res(M.oppSeat); }
}
function netWaitOpp(M, pred) {
  return new Promise((res) => { if (M.oppSeat && pred(M.oppSeat)) res(M.oppSeat); else M.waiters.push({ pred, res }); });
}
function netMatchDoc(M, m) {
  if (!m) return;
  M.doc = m;
  if (!M.ended && m.result?.reason === 'resign' && m.result.by !== M.seat) netOppResigned(M);
}
function netOppResigned(M) {
  M.ended = true;
  runId++;
  cancelInput?.();
  if (pv) netAbort(pv);
  $('#rps').hidden = true;
  hideGizmo();
  netSetActive(M.net, null).catch(() => {});
  pvpLogAdd({ code: M.code, key: 'set', role: 'set', tag: 'resign:' + M.seat, at: Date.now() });
  netShowResult(M, { winner: M.seat, reason: 'resign' });
}
async function netResign() {
  const M = match?.net;
  if (!M || M.ended) return;
  M.ended = true;
  // 빠른 길(presence s.resign)을 먼저 보낸다. 매치 문서 쓰기를 기다린 뒤에 보내면 그동안(실제 db 수백 ms·재시도) 상대는 아무것도 모르고,
  // 쓰기가 실패하면 영영 안 간다. 매치 문서·자리 문서·active 는 그다음에 각자(하나가 실패해도 나머지는 간다)
  const seatP = netSeat(M, (s) => { s.resign = true; }); // presence 즉시 + 자리 문서
  const presP = M.presP;
  const docP = M.net.db.doc(Pvp.paths.match(M.code)).update({ status: 'abandoned', result: { winner: M.other, reason: 'resign', by: M.seat, at: Date.now() }, updatedAt: Date.now() });
  const actP = netSetActive(M.net, null);
  const rs = await Promise.race([Promise.allSettled([seatP, docP, actP, presP]), wait(4000)]);
  for (const r of rs || []) if (r.status === 'rejected') console.warn('[pvp] resign', r.reason?.code || r.reason);
  // presence 는 합쳐서 약 30Hz 로 나간다(room.d.ts). 곧바로 방을 나가면(goHome → leave) 아직 안 나간 patch 가 버려져
  // 상대는 'bye' 만 보고 '연결 끊김 — 기다리는 중'(매치 문서가 폴링이면 6초 안전망 읽기까지). 한 번 나갈 틈(33ms)의 몇 배를 둔다
  await wait(150);
}
// 홈으로: 방 나가기·구독 끊기·앞서 돌던 물리와 꼭두각시 월드 반납. 솔로면 아무것도 안 함
function netStop() {
  for (const s of sims.splice(0)) { try { s.run.free(); } catch (e) { /* 이미 반납 */ } }
  if (pv) netAbort(pv);
  const M = match?.net;
  if (!M) return;
  M.ended = true;
  for (const u of M.unsubs.splice(0)) { try { u(); } catch (e) { /* 무시 */ } }
  for (const w of M.waiters.splice(0)) w.res(null);
  for (const ib of M.inbox.values()) netWake(ib);
  M.room?.leave().catch(() => {});
  M.forceFire = null; M.clockEnd = 0;
  if (table?.puppet) { try { table.world.free(); } catch (e) { /* 이미 반납 */ } table = null; }
  $('#pvpClock').hidden = true; $('#pvpConn').hidden = true; $('#againBtn').hidden = false;
  if (netTickT) { clearInterval(netTickT); netTickT = 0; }
}

// ── 가위바위보 (커밋 sha256(hand:nonce16:code:round) → 둘 다 커밋 → 리빌 → 상대 것 검증. 3번 비기면 시드 1비트) ──
function rpsSecrets(code) { try { return JSON.parse(sessionStorage.getItem('pvp-rps-' + code) || '{}'); } catch (e) { return {}; } }
async function netRps(M) {
  const el = $('#rps');
  const alive = () => M.my === runId && !M.ended;
  const sec = rpsSecrets(M.code);
  for (let r = 0; r < 3; r++) {
    if (!alive()) return null;
    let hand, nonce;
    const mine = M.mySeat.rps?.[r];
    el.hidden = false;
    $('#rpsAi').textContent = '❔'; $('#rpsRes').textContent = '';
    if (mine?.c && sec[r]) ({ h: hand, n: nonce } = sec[r]); // 새로고침: 이미 낸 손(커밋은 바꾸지 않는다)
    else {
      $('#rpsTitle').textContent = t('rps');
      el.querySelectorAll('button').forEach((b) => { b.disabled = false; b.classList.remove('pick'); });
      hand = await new Promise((res) => {
        el.querySelectorAll('button').forEach((b) => { b.onclick = () => { sfx.unlock(); sfx.pop(); res(b.dataset.h); }; });
        if (PVP.bot) setTimeout(() => res(Pvp.HANDS[Math.floor(Math.random() * 3)]), 400 + Math.random() * 600);
      });
      if (!alive()) return null;
      nonce = Pvp.randomHex(16);
      sec[r] = { h: hand, n: nonce };
      try { sessionStorage.setItem('pvp-rps-' + M.code, JSON.stringify(sec)); } catch (e) { /* 무시 */ }
      const c = await Pvp.commitHash(hand, nonce, M.code, r);
      await netSeat(M, (s) => { const rps = (s.rps || []).slice(); rps[r] = { c }; s.rps = rps; });
    }
    el.querySelectorAll('button').forEach((b) => { b.disabled = true; b.classList.toggle('pick', b.dataset.h === hand); });
    $('#rpsTitle').textContent = t('pvpRpsWait');
    const o1 = await netWaitOpp(M, (s) => s.rps?.[r]?.c);
    if (!o1 || !alive()) return null;
    if (!M.mySeat.rps?.[r]?.rv) await netSeat(M, (s) => { const rps = s.rps.slice(); rps[r] = { ...rps[r], rv: { h: hand, n: nonce } }; s.rps = rps; });
    const o2 = await netWaitOpp(M, (s) => s.rps?.[r]?.rv);
    if (!o2 || !alive()) return null;
    const { h: oh, n: on } = o2.rps[r].rv;
    const ok = (await Pvp.commitHash(oh, on, M.code, r)) === o2.rps[r].c;
    if (!ok) { M.rpsBad = true; console.warn('[pvp] 가위바위보 커밋 불일치(친선: 기록만)'); }
    $('#rpsAi').textContent = HAND_ICON[oh] || '❔';
    sfx.clack(1);
    if (hand !== oh) {
      const win = Pvp.beats(hand, oh);
      $('#rpsRes').textContent = win ? t('rpsWin') : t('rpsLose');
      await wait(900);
      el.hidden = true;
      return win ? M.seat : M.other;
    }
    $('#rpsRes').textContent = t('rpsDraw');
    await wait(800);
  }
  el.hidden = true;
  return Pvp.rpsTiebreak(M.seed);
}

// ── 내 차례: 내가 심판. 놓으면 ShotRun 이 앞서 돌며 30Hz 로 녹화 → blow·trk·done + db 샷 문서. 내 화면도 그 버퍼를 재생 ──
async function netMyTurn(M, g, ti) {
  const alive = () => M.my === runId && !M.ended;
  const key = Pvp.shotKey(g, ti);
  const { run, seeds } = await netTurnSetup(M, g, ti, true);
  if (!alive()) { run.free(); return false; }
  match.turn = 'me';
  M.cur = { key, g, t: ti, mine: true, seeds };
  netPresence(M, { ph: 'aim', key, h: null, lat: null, cheek: 0, clk: PVP.clock });
  await banner(t('yourTurn'), 'b-me');
  if (!alive()) { run.free(); return false; }
  tension(M.live.length <= 3);
  netClockStart(M);
  const shotP = playerShot();
  if (PVP.bot) netBotShot(M);
  const raw = await shotP;
  netClockStop(M);
  tension(false);
  if (!alive() || !raw) { run.free(); return false; }
  const input = { h: raw.h, lat: raw.lat || 0, power: raw.power, eff: raw.power, mode: micEnabled && mic.ready ? 'mic' : 'touch', beat: raw.beatTier || 0, item: 0, auto: raw.auto ? 1 : 0, pose: raw.pose || 'eye', ...(raw.mouthY != null ? { mouthY: raw.mouthY } : {}) };
  run.fire(input);
  const shot = { h: run.shot.h, lat: run.shot.lat || 0, power: run.shot.power, blast: run.shot.blast || 0, ratio: run.shot.ratio };
  const nonce = Pvp.randomHex(4), tg = `${key}.${nonce}`, at = Date.now();
  netPresence(M, { ph: 'fire', key });
  netEmit(M, 'blow', { t: tg, in: input, pre: toB64(run.pre), shot, at });
  const player = new TrackPlayer(run.pre);
  const P = (pv = { player, tf: 0, go: false, started: false, final: null, mine: true, key, tg, last: new Map(), src: 'local' });
  const chunker = new TrackChunker(tg, { maxFrames: 8 }); // 8프레임(0.27초)마다 끊어 받는 쪽이 일찍 재생을 시작
  let fed = 0;
  sims.push({
    run, budget: 8,
    onFrames() { for (; fed < run.rec.frames.length; fed++) { const f = run.rec.frames[fed]; player.push(f, fed); for (const c of chunker.add(f)) netEmit(M, 'trk', c); } },
    onDone(rec) {
      this.onFrames();
      const last = chunker.flush();
      if (last) netEmit(M, 'trk', last);
      const fin = { t: tg, res: rec.res, post: rec.post, qhash: rec.qhash, hash: rec.hash, frames: rec.track.frames, steps: rec.track.steps };
      netEmit(M, 'done', fin);
      netWriteShot(M, g, ti, rec, { n: nonce, trace: raw.trace, score: { ...M.score, [M.seat]: M.score[M.seat] + rec.res.flipped.length }, at });
      run.free();
      P.final = fin;
    },
  });
  const played = new Promise((res) => { P.resolve = res; });
  await netBlowFx(M, raw, shot, 'me', true);
  if (!alive()) return false;
  P.started = true;
  if (!(await played) || !alive()) return false;
  await netApplyResult(M, g, ti, M.seat, P, { role: 'shoot', ver: 'self', at, auto: input.auto });
  return true;
}
// 샷 기록(db): 쏜 사람만 쓴다. 문서 id = 판·턴 → 한 턴에 기록 하나. 받는 쪽의 이어 받기·재접속·뒤 검증이 이걸 읽는다
function netWriteShot(M, g, ti, rec, o) {
  const doc = { v: 1, g, turn: ti, seat: M.seat, by: M.uid, n: o.n, simV: rec.simV, seeds: rec.seeds, ids: rec.ids, in: rec.in, shot: rec.shot, pre: rec.pre, post: rec.post, track: rec.track, res: rec.res, score: o.score, hash: rec.hash, qhash: rec.qhash, prev: M.prev, at: o.at, ...(o.trace?.length ? { trace: traceToB64(o.trace) } : {}), ua: (navigator.userAgent || '').slice(0, 96) };
  M.net.db.doc(Pvp.paths.shot(M.uid, M.code, M.seat, Pvp.shotKey(g, ti))).set(doc).catch((e) => console.warn('[pvp] shot doc', e.code || e.message));
}
// 받는 쪽 검증 기록(E10 실데이터 · 지연): p/{uid}/m/{code}-{seat}/v/{g}{tt}. 화면·판정에는 안 쓴다(고발 근거 아님)
//   same = 같은 입력·내 새 월드 재시뮬 해시 == 쏜 사람 해시. sameEngine = simV(엔진·튜닝·규칙·코덱·소스 해시)가 같은가. ua 쌍 = 기기 쌍
//   blowToPlus = room 'blow' 를 받은 때 → 내 화면 첫 '+1'(받는 쪽 시계만) · rtt = 내 emit 메아리 왕복 중앙값 → 놓기→상대 첫 '+1' ≈ blowToPlus + rtt/2
function netWriteVerify(M, key, fin, v, o, P) {
  const med = (a) => { if (!a.length) return null; const x = [...a].sort((p, q) => p - q); return x[x.length >> 1]; };
  const doc = {
    v: 1, key, seat: M.seat, shooter: M.other, hashShooter: fin.hash, hashVerifier: v?.hash ?? null, same: !!(v && v.hash === fin.hash && v.post === fin.post),
    simS: o.doc?.simV ?? null, simV: shotSimV(), sameEngine: o.doc?.simV != null ? o.doc.simV === shotSimV() : null,
    uaS: o.doc?.ua ?? null, ua: (navigator.userAgent || '').slice(0, 96), src: P.src || null, frames: fin.frames,
    blowToPlus: P.plusPerf && o.blowPerf ? Math.round(P.plusPerf - o.blowPerf) : null, rtt: med(M.rtt), rttN: M.rtt.length, at: Date.now(),
  };
  M.net.db.doc(Pvp.paths.verify(M.uid, M.code, M.seat, key)).set(doc).catch((e) => console.warn('[pvp] verify doc', e?.code || e));
}
// 시험용 자동 손(?pvpbot): 학습자 봇 분포로 합성 포인터(누르기 → 당기기 → 놓기). 진짜 입력 경로(pointerAim·콩닥·presence)를 그대로 지난다
async function netBotShot(M) {
  M.botRng ||= mulberry32(hash32(M.uid + '|' + M.code));
  const plan = Pvp.botPlan(M.botRng);
  await wait(plan.thinkMs);
  if (!myTurn.on || myTurn.pressed || !table || match?.net !== M || M.ended) return;
  const n = liveCount(), top = table.columnTop(), c = table.pileCenter();
  const h = clamp(top * plan.hf, 0.04, Math.max(0.05, top - 0.03)), lat = plan.lat;
  const wp = new THREE.Vector3(c.x + lat, paper.visY(h, c), c.z + Math.sqrt(1 - lat * lat)).project(camera); // 정규 좌표(바람 −z): 부는 쪽(+z) 곡면 위 · 누르는 곳 = 보이는 딱지 높이(pointerAim 이 physY 로 h 로 되돌림)
  const x = (wp.x * 0.5 + 0.5) * window.innerWidth, y = (-wp.y * 0.5 + 0.5) * window.innerHeight;
  const pe = (type, px, py, target) => target.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: py, pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true }));
  pe('pointerdown', x, y, renderer.domElement);
  const power = Math.min(Rules.POUCH_FULL - 0.02, sweetHiFor(n) * plan.ratio);
  const dy = power * Math.min(window.innerWidth, window.innerHeight) * feel.pull;
  for (let i = 1; i <= 8; i++) { await wait(30); pe('pointermove', x, y + (dy * i) / 8, window); }
  await wait(plan.holdMs);
  pe('pointerup', x, y + dy, window);
}

// ── 상대 차례: 받는 쪽. 시뮬하지 않고 재생, 판정은 쏜 사람의 res(id). 뒤에서 같은 입력으로 다시 시뮬해 검증 해시만 남긴다 ──
function netBox(M, key) {
  let b = M.inbox.get(key);
  if (!b) M.inbox.set(key, (b = { key, blow: null, chunks: [], done: null, doc: null, docAt: 0, docFirst: false, wakers: [], pump: null }));
  return b;
}
function netWake(ib) { const w = ib.wakers; ib.wakers = []; for (const f of w) f(); ib.pump?.(); }
function netWait(ib, ms) { return new Promise((res) => { const tm = setTimeout(res, ms); ib.wakers.push(() => { clearTimeout(tm); res(); }); }); }
function netOnMsg(M, topic, msg) {
  if (msg.sameTab) { // 내 메아리: RTT 만 잰다(내 화면은 보낼 때 이미 그렸다)
    const k = `${topic}|${msg.data?.t}|${msg.data?.seq ?? ''}`, t0 = M.sentAt.get(k);
    if (t0 != null) { M.sentAt.delete(k); M.rtt.push(Math.round(performance.now() - t0)); if (M.rtt.length > 200) M.rtt.shift(); }
    return;
  }
  if (M.ended) return;
  // 상대가 정해졌으면 상대가 보낸 것만 받는다. by 는 플랫폼이 찍어 위조할 수 없다(null = 보증 없음 → 버림).
  // 방 코드를 아는 제3자가 blow·trk·end 를 흘려 진짜 상대의 재생을 덮거나 되감는 것을 막음(코덱스 리뷰). 진짜 샷은 db 로도 온다
  if (M.oppUid && msg.by !== M.oppUid) return;
  const d = msg.data;
  if (!d || typeof d.t !== 'string') return;
  const key = d.t.split('.')[0];
  const ib = netBox(M, key);
  if (topic === 'blow') { ib.blow = d; ib.blowAt = Date.now(); ib.blowPerf = performance.now(); ib.chunks = []; ib.done = null; ib.unverified = !msg.by || msg.by !== M.oppUid; } // by 가 없거나 다르면 버리지 않고 '미검증' 표시(db 로 확정)
  else if (!ib.blow || ib.blow.t !== d.t) return; // 다른 시도의 조각·끝
  else if (topic === 'trk') { ib.chunkAt = Date.now(); if (PVP.drop && ++M.trkSeen % PVP.drop === 0) return; ib.chunks.push(d); }
  else ib.done = d;
  netWake(ib);
}
const netFinalOf = (doc, tg) => ({ t: tg, res: doc.res, post: doc.post, qhash: doc.qhash, hash: doc.hash, frames: doc.track.frames, steps: doc.track.steps });
async function netRemoteTurn(M, g, ti) {
  const alive = () => M.my === runId && !M.ended;
  const key = Pvp.shotKey(g, ti);
  const ctx = await netTurnSetup(M, g, ti, false);
  if (!alive()) { ctx.run.free(); return false; }
  match.turn = 'ai';
  M.cur = { key, g, t: ti, mine: false, seeds: ctx.seeds };
  if (cue.receipt) cue.receipt.t0 = Math.min(cue.receipt.t0, performance.now() - 5100); // 상대 차례: 내 '방금 숨' 카드는 바로 사라지기 시작(솔로 aiShot 과 같음)
  netPresence(M, { ph: 'watch', key, h: null, lat: null, cheek: 0, clk: null });
  await banner(t('rivalTurn'), 'b-ai');
  if (!alive()) { ctx.run.free(); return false; }
  tension(M.live.length <= 3);
  netShowOppAim(M);
  const ib = netBox(M, key);
  const ref = M.net.db.doc(Pvp.paths.shot(M.oppUid, M.code, M.other, key));
  const d0 = (await ref.get().catch(() => null))?.data();
  if (d0 && d0.seat === M.other) { ib.doc = d0; ib.docFirst = true; } // 이미 끝난 숨(늦었거나 재접속) → db 궤적으로
  ib.ref = ref;
  ib.onDoc = (s) => { const d = s.data(); if (d && d.seat === M.other && (!ib.doc || ib.doc.n !== d.n)) { ib.doc = d; ib.docAt = Date.now(); netWake(ib); } }; // 구독·안전망 읽기(netPoll) 공용
  const unDoc = ref.onSnapshot((s) => ib.onDoc?.(s));
  let out = null;
  try { out = await netReceive(M, key, ib, ctx); } finally { unDoc(); ib.pump = null; ib.ref = null; ib.onDoc = null; }
  tension(false);
  if (!ctx.run.fired) ctx.run.free();
  if (!alive() || !out) return false;
  M.inbox.delete(key);
  await netApplyResult(M, g, ti, M.other, out.P, { role: 'recv', verP: out.verP, at: out.at, auto: out.auto, preMiss: out.preMiss, doc: ib.doc, n: ctx.run.n, seeds: ctx.seeds, unverified: !!ib.unverified, blowPerf: ib.blowPerf || null });
  return true;
}
// 받을 시도 고르기: db 문서(완성된 기록 = 진실)가 있고 지금 room 시도와 다르면 db, 아니면 room blow. 12초 안에 끝이 안 오면 '상대 숨 취소'
async function netReceive(M, key, ib, ctx) {
  const alive = () => M.my === runId && !M.ended;
  let cancelled = null;
  while (alive()) {
    const tgDoc = ib.doc ? `${key}.${ib.doc.n}` : null;
    let att = null;
    if (ib.doc && (ib.docFirst || !ib.blow || ib.blow.t !== tgDoc)) att = { fromDb: true, tg: tgDoc };
    else if (ib.blow && ib.blow.t !== cancelled) att = { fromDb: false, tg: ib.blow.t };
    if (!att) { await netWait(ib, 250); continue; }
    const b = att.fromDb ? { t: tgDoc, in: ib.doc.in, pre: ib.doc.pre, shot: ib.doc.shot, at: ib.doc.at } : ib.blow;
    const r = await netPlayAttempt(M, key, ib, ctx, att, b);
    ib.docFirst = false;
    if (r === 'cancel') { cancelled = att.tg; continue; }
    if (r === 'restart') continue;
    return r;
  }
  return null;
}
async function netPlayAttempt(M, key, ib, ctx, att, b) {
  const alive = () => M.my === runId && !M.ended;
  let preMiss = 0;
  if (b.pre !== ctx.preB64) { preMiss = 1; M.preMiss++; posePuppet(table, b.pre, true); syncMeshes(); } // 엔진이 다르면 pre 가 조금 다를 수 있다 → 쏜 사람 것으로
  // 뒤 검증: 같은 입력, 내 새 월드(화면엔 손대지 않음). 다시 쏜 시도면 그 입력으로 새 월드를 하나 더
  const vr = ctx.run.fired ? new ShotRun({ ids: ctx.ids, seeds: ctx.seeds, cardOf: M.cardOf }) : ctx.run;
  vr.fire(b.in);
  const verP = new Promise((res) => sims.push({ run: vr, budget: 3, onDone: (rec) => { vr.free(); res(rec); } }));
  const player = new TrackPlayer(b.pre, { mirror: true });
  const P = (pv = { player, tf: 0, go: false, started: false, final: null, mine: false, key, tg: att.tg, last: new Map(), fed: 0, gap: false, resumed: false, src: att.fromDb ? 'db' : 'room', t0: Date.now(), tl: {} });
  P.wake = () => netWake(ib);
  const tgDoc = () => (ib.doc ? `${key}.${ib.doc.n}` : null);
  const pump = () => {
    if (P.finished) return;
    if (!att.fromDb) {
      while (P.fed < ib.chunks.length) {
        const c = ib.chunks[P.fed++];
        if (P.gap || (P.final && player.received >= P.final.frames)) continue;
        if (!player.push(c.b, c.f)) { P.gap = true; P.tl.gap ??= Date.now() - P.t0; } // seq 가 비었다 → room 스트림을 버리고 db 로
      }
      if (ib.done && !P.final) { P.final = ib.done; P.tl.done = Date.now() - P.t0; }
    }
    if (ib.doc) P.tl.doc ??= Date.now() - P.t0;
    if (ib.doc && tgDoc() === att.tg) {
      if (!P.final) P.final = netFinalOf(ib.doc, att.tg);
      // room 이 0.8초 넘게 조용하고 재생이 받은 데까지 거의 왔을 때만(버퍼가 넉넉하면 room 을 계속 쓴다)
      const stalled = player.received < P.final.frames && P.tf >= player.received - 2 && Date.now() - Math.max(ib.chunkAt || 0, ib.blowAt || 0) > 800;
      const need = att.fromDb || P.gap || (ib.done && player.received < P.final.frames) || stalled;
      if (need && !P.resumed) { P.resumed = true; P.tl.resume = Date.now() - P.t0; player.resume(ib.doc.track.b); if (!att.fromDb) P.src = 'room+db'; }
    }
  };
  ib.pump = pump;
  pump();
  await netBlowFx(M, b.in, b.shot, 'ai', false);
  if (!alive()) { netAbort(P); return null; }
  P.started = true;
  const t0 = Date.now();
  let stallAt = 0;
  while (!P.finished) {
    if (!alive()) { netAbort(P); return null; }
    pump();
    if (!att.fromDb) {
      if (ib.doc && tgDoc() !== att.tg) { netAbort(P); return 'restart'; } // 다른 시도가 완성됨(문서가 진실)
      if (ib.blow && ib.blow.t !== att.tg && !P.final) { netAbort(P); return 'restart'; } // 쏜 사람이 다시 쏨
      if (!P.final && Date.now() - t0 > 12000) { // 놓은 직후 끊김: 12초 안에 done 도 문서도 없음
        netAbort(P);
        toast(t('pvpOppCancel'));
        posePuppet(table, ctx.pre, true); syncMeshes(); simWatch.vy.clear();
        return 'cancel';
      }
      const missing = P.final && player.received < P.final.frames && (P.gap || ib.done);
      if (missing) { stallAt ||= Date.now(); if (Date.now() - stallAt > 2000 && !P.resumed) netFastForward(P); } else stallAt = 0;
    }
    await netWait(ib, 150);
  }
  return { P, verP, at: b.at, preMiss, auto: b.in?.auto || 0 };
}
// done 만 오고 궤적이 빠졌는데 db 도 없을 때: 0.4초(12프레임) 동안 post 로 빨리 감기(화면이 멈춰 있지 않게)
function netFastForward(P) {
  const post = fromB64(P.final.post), n = post.length / 13, k = P.player.received;
  const f = new Uint8Array(1 + post.length);
  f[0] = n; f.set(post, 1);
  P.player.push(new Uint8Array(11), k); // 빈 프레임 11개
  P.player.push(f, k + 11);
  P.final = { ...P.final, frames: k + 12 };
  P.resumed = true;
  P.src += '+ff';
  if (P.tl) P.tl.ff = Date.now() - P.t0;
}

// ── 결과 적용(두 쪽 같음): 판정은 res 의 id 로만. 화면 끝 자세 해시·남은 딱지·점수로 턴 지문을 남긴다 ──
async function netApplyResult(M, g, ti, seat, P, o) {
  const fin = P.final, who = seat === M.seat ? 'me' : 'ai', key = Pvp.shotKey(g, ti);
  const byId = new Map(table.liveDiscs().map((d) => [d.id, d]));
  const flipped = fin.res.flipped.map((id) => byId.get(id)).filter(Boolean);
  const outs = fin.res.outs.map((id) => byId.get(id)).filter(Boolean);
  simWatch.resolve = null;
  simWatch.outs = outs.length;
  for (const d of outs) { if (simWatch.outShown.has(d.id) || d.off) continue; const p = d.body.translation(); fx.text(new THREE.Vector3(p.x, p.y + 0.5, p.z), 'OUT', 'out'); }
  if (outs.length) chalkPulse();
  if (who === 'me') makeReceipt(flipped, outs);
  const shown = hashBytes(P.player.endBytes()); // 내 화면에 남은 끝 자세(13B) 해시 = 쏜 사람의 post 해시여야 한다
  const fl = new Set(fin.res.flipped);
  M.live = M.live.filter((id) => !fl.has(id));
  M.score = { ...M.score, [seat]: M.score[seat] + fin.res.flipped.length };
  M.prev = String(fin.qhash).slice(0, 8);
  let beatOk = null;
  if (o.doc?.trace && o.doc.in?.beat) beatOk = BeatClock.replay(o.seeds.beat, o.doc.in.beat, o.n, traceFromB64(o.doc.trace)) === o.doc.in.power; // 콩닥 다시 계산
  const entry = pvpLogAdd({ code: M.code, key, g, t: ti, seat, role: o.role, qhash: shown, expect: fin.qhash, res: netResStr(fin.res), tag: Pvp.stateTag(M.live, M.score, shown), ver: o.ver ?? null, beatOk, src: P.src, plus: P.plusAt && o.at ? P.plusAt - o.at : null, preMiss: o.preMiss || 0, unverified: o.unverified || false, tl: P.tl || null, frames: fin.frames, auto: o.auto || 0, at: Date.now() });
  if (o.verP) o.verP.then((v) => { entry.ver = v && v.hash === fin.hash && v.post === fin.post ? 'same' : 'diff'; pvpLogSave(); netWriteVerify(M, key, fin, v, o, P); });
  if (seat === M.other) netSeat(M, (s) => { s.ack = key; });
  await react(flipped, who);
  await collect(flipped, who);
}

// ── 고개 쓸기 연습판 (docs/design/core-sweep.md §2·§4·§5·§8 · §9 4번 줄 '깃발 뒤 새 문법' — feel.core, 솔로 연습판 전용) ──────────
// 🧭 가설(미검증): 재윤님이 기대한 '아래에서 위로 올리는 물리 컨트롤'에 필요한 식은 측정 도구에 이미 있고(mockup/src/sweep.js 로 옮김), 게임에 없던 것은 이식뿐이다.
//   → 판가름 = 주입 훅(window.__sweepPlan) 샷이 Node 측정과 비트까지 같고(tools/sweepplay.mjs ↔ tools/sweepgame.mjs ref), 재윤님 손 게이트(BLOCKERS G13):
//     같은 40장 더미('같은 더미 다시')에서 '툭 열고 버티다 떼기' 대 '툭 → 기다려 → 쭉 올리며 떼기' 짝 비교. 30장은 쓸기가 버티기와 비슷해(게임 손 1.00배, 검토 2) 첫 판이 아니다.
// 🧭 가설 수정(검토 2026-10-16, 확인됨: 헤드리스 터치 실측): 물리는 맞지만 화면·글이 핵심 박자('툭 열고 → 더미가 기울 때까지 기다렸다 → 쭉')를 안 가르쳤다.
//   힌트대로 한 번에 쓸면 0~1장(🐇), 시범의 '살짝'(48 px/s)을 조금 느리게 따라 하면 '푸'가 늦게 열려 박자가 사라졌다 → 힌트·시범(빠른 툭)·첫 3숨 코치·'푸—' 열림 신호·
//   안 열림 넛지·옆모습 창(기울기 호)·입을 따라 오르는 시점으로 고친다(물리는 그대로).
// 🧭 가설 수정(2026-10-16, 재윤님 실기기 기록·화면 녹화, 확인됨): 문법 A 는 자연스러운 한 획(당김 → 빠른 휙 → 떼기)과 부딪힌다 — 40장 4숨 모두
//   푸 시작→떼기 4~108 ms · 고개 잠김 0.133 s · 0장(🐇). 힌트를 봐도 손은 한 획으로 간다. → 기본 = 문법 B '놓고 쓸기'(sweep.js GB 절, 측정 tools/sweepgb.mjs).
//   A 는 ⚙ '누른 채 쓸기(옛)'(feel.swg 1 · ?swg=a)로 남겨 비교한다. 판가름 = 재윤님 손 게이트(BLOCKERS G13): 40장 같은 더미에서 B 첫 숨들이 0장이 아니고,
//   코치 '들리면 휙!'을 따라 하면 안 휙(긴 퍼)보다 뚜렷이 많은가.
// 문법 B(기본): 화면 아래 2/3 아무 데나 꾹 → 아래로 당기기 = 들이쉼(세기 q) → 놓으면 '퍼—'가 저절로 D(q) = 0.6~1.0 화면 초(벽시계 1.2~2.0 s) →
//   그동안 다시 눌러 위로 휙(어디든, 어느 속도든 12 px) = 고개가 바닥에서 꼭대기 위로(80°/s, 24°). 휙은 한 번만 · 떼기 전 같은 획의 휙은 안 셈 · 숨은 늘 저절로 끝
//   취소: 당기며 옆으로 30% 빼서 떼기(Sweep.GestureB — 같은 획 휙 동안 옆 흐름은 안 셈, 취소면 토스트) · 덜 당김(< 0.06) · 콜록. 느린 밀기 취소·퍽은 없다
//   같은 획의 휙은 '한 획 휙'(I.strokeFlick)으로만 기록 → 숨 동안 '그 휙은 안 세요' · 카드 🔁. 숨 끝 0.5 s 뒤부터 판정까지의 누름은 '잠깐…'(늦은 휙 아님)
// 문법 A(옛, §4): 화면 아래 2/3 아무 데나 꾹 → 아래로 당기기 = 들이쉼(가장 깊이 당긴 곳 = 세기, 되물림 없음) →
//   (a) 밀지 않고 떼기 = 퍽(바닥 입·고개 0·0.131 s)  (b) 위로 툭 밀면 '푸' 시작 → 엄지 높이 = 고개(바람 자국 높이), 떼기 = 숨 끝(0.04 s 에 끊김)
//   취소(숨·차례 안 씀): 옆으로 30% 빼서 떼기 · 덜 당김(< 0.06) · 콜록 · 느린 밀기('푸' 없이 40 px 위에서 떼기 → '툭 밀어 올려요' 시범)
// 세기 q = 당김 ÷ 꽉(꽉 = 1.0) → 물리 세기 그대로. 돌풍 규칙·초록 띠·조준 흔들림·physSweetFor 를 거치지 않는다(측정 숫자가 그 조건) — 원 밖은 밀기 ∝ q^2.93 로 물리가 정한다
// 시간: 숨 동안 0.5배 고정(히트스톱·슬로모 없음 · 60 Hz 면 프레임당 1스텝). A 숨 길이 최소 0.131 · 상한 1.0 화면 초 · B 는 D(q)(SweepCtl, 물리 초로 강제)
// 판정: sim.js stepJudge(스텝 기준) — 프레임 기준 watchSim 판정 대신. 그래서 같은 주입 일정이면 Node(tools/sweepgame.mjs ref)와 같은 스텝·같은 해시
// 보상 없음: 별·진행·도감·딱지·튜토리얼 수·공략 단서 수·콜록 수 모두 그대로(프로필을 안 건드린다). 레벨·일일·AI 대전·PvP·봇·마이크는 늘 고전
// 실험 '바람 도달 시간'(jetLag·airFx·hsCut) 저장값은 이 판에서 무시(expLag 0, blowProg 는 jetLag 를 받지 않는다)
const D2R = Math.PI / 180;
const sweep = {
  N: 40, idx: 0, total: 0, // 연습판 장수·시드 번호 · 이번 실행에서 분 숨 수(첫 3숨 손가락 시범·코치 — 프로필에 안 적는다)
  coachShot: false, openAt: 0, nudge: false, moreOpen: null, mark: null, // 이 숨이 코치 숨인가 · '푸' 열린 시각 · 안 열림 넛지 · 카드 '자세히' 펼침 · 바람 자국 메시
  input: null, // 진행 중 엄지 입력(playerSweepShot)
  ctl: null, // 지금(마지막) 숨의 SweepCtl — 화면은 ctl.state 만 읽는다(prog 는 물리만 부름)
  shot: null, // 진행 중 샷 { kind, q, ctl, j, steps, fr, resolve, ... }
  clock: false, clockEnded: false, // 쓸기 숨 동안 0.5배 고정 · 끝난 첫 프레임에 바로 1배
  snd: null, lastFlipVib: 0, lastFlipSnd: 0, guideUntil: 0, slowCancels: 0,
  lastTrail: null, // 지난 숨의 엄지 궤적(화면 CSS px) — 회색 점선 1숨만
  frameMs: [], lastFrameT: 0, dispA: 0, lastQ: 0,
  card: null, ribbon: null,
  flickAt: 0, coachAgain: false, coachKey: null, lastFlTrail: null, // B: 휙 시각(화면 '휙!') · 안 쓸었으면 다음 숨도 코치 · 지금 그린 코치 말(시험용) · 지난 휙 궤적
  breathEndAt: 0, pop: null, // B: 숨이 끝난 벽시계 시각(늦은 휙 창) · 짧은 글 신호 { key, at }('위로 휙!' · '잠깐…')
};
window.__puffSweep = { log: [], last: null, shots: 0 };
// 자동 시험용(tools/sweepplay.mjs): 지금 연습판 상태
window.__puffSweep.state = () => ({
  on: sweepOn(), N: sweep.N, seed: match?.seed ?? null, waiting: !!(sweep.input && !sweep.input.g && !sweep.input.ctl), input: !!sweep.input, pressed: !!sweep.input?.g,
  clock: sweep.clock, shot: !!sweep.shot, card: !$('#sweepCard').hidden, total: sweep.total, guide: performance.now() < sweep.guideUntil, slowCancels: sweep.slowCancels,
  air: !!table?.air, lag: expLag(), timeScale, state,
  nudge: sweep.nudge, coach: sweepCoachOn(), coachShot: sweep.coachShot, side: !$('#swSide').hidden, mark: !!sweep.mark?.visible,
  grammar: sweepGB() ? 'B' : 'A', mode: sweep.ctl?.mode ?? null, t0: sweep.ctl?.t0 ?? null, flickReq: sweep.ctl?.flickReq ?? null, cueT: sweep.ctl?.rec?.cueT ?? null, coachKey: sweep.coachKey,
  listening: !!sweep.input?.listening, stroke: !!sweep.input?.strokeFlick, touches: sweep.input?.fls?.size ?? 0,
  pop: sweep.pop && performance.now() - sweep.pop.at < SW_POP_MS ? sweep.pop.key : null,
  reticle: reticle ? { op: reticle.material.opacity, vis: reticle.visible } : null, // 고전 조준 고리(연습판이 건드리면 안 됨)
});
window.__sweepPlan = null; // 개발 주입 훅: { q, A, w, t0, D } (A·D 에 'top' 가능) · { kind: 'puck', q } · 문법 B { kind: 'gb', q, ts }(ts 화면 초, null = 안 휙). __sweepFire() 가 다음 쓸기 샷 하나를 이 일정으로
window.__sweepFire = () => { const I = sweep.input; return !!(I && I.firePlan && !I.g && !I.ctl && I.firePlan(window.__sweepPlan)); };
function sweepOn() { return match?.sweep === true && !match?.net; } // 문지기: 쓸기 연습판(솔로)만. 대결·레벨·일일·자유 대전은 늘 false
function sweepGB() { return !(feel.swg >= 0.5); } // 쓸기 문법 B '놓고 쓸기'(기본) — feel.swg 1 이면 A '누른 채 쓸기(옛)'
function sweepClockOn() { return sweep.clock && sweepOn(); }
function sweepAlphaDeg() { return sweep.dispA; }
function sweepVib(ms) { navigator.vibrate?.(ms); }
const SW_OPEN_VIB = 35; // '푸 시작' 톡 = 강(> 32 ms → iOS tapHeavy). 예전 15(가장 약한 tapLight)는 열림을 손이 몰랐다(검토 3)
function sweepFlipVib(now) { if (now - sweep.lastFlipVib < 80) return; sweep.lastFlipVib = now; navigator.vibrate?.(12); } // 뒤집힘 12 는 80 ms 에 하나
// 바람 축이 꼭대기를 넘음 · 아래 절반 평균 90°(물리 사건, 정답 신호 아님). B(놓고 쓸기)는 'top' 진동을 안 낸다 — 휙 받음 20 바로 뒤
//   (벽시계 약 0.15~0.18 s) 같은 세기(tapMedium)로 와서 휙을 두 번 받은 것처럼 느껴졌다(검토 2026-10-16). B 의 휙은 방아쇠라 '넘음' 정보가 겹친다
function sweepEvent(name, mode) { if (name === 'top') { if (mode !== 'flick') sweepVib(25); } else if (name === 'tb90') sweepVib(47); }
const SW_FLICK_VIB = 20; // B 휙 받음 = 중(16~32 ms → iOS tapMedium). 놓기 '퍼' 35(강)와 손으로 구별
const SW_LATE_MS = 500; // B: 숨이 끝난 뒤 이 안의 휙만 '늦은 휙'(칩 늦었어요). 그 뒤(판정 기다림, 카드까지 약 2 s)의 누름은 '잠깐…'만 — 다음 숨 한 획이 늦은 휙으로 삼켜지지 않게
const SW_STROKE_PXS = 500; // B: 놓기 전 같은 획에서 휙(12 px/300 ms) + 위로 밀기 ≥ 500 px/s = '한 획 휙'(쓸기로 안 셈) → 숨 동안 '그 휙은 안 세요' · 카드 칩
const SW_POP_MS = 650;
function swPopSet(key, now = performance.now()) { sweep.pop = { key, at: now }; }

async function startPractice(N = 40, seedIdx = 0) {
  N = N === 30 ? 30 : 40;
  sfx.unlock();
  const my = ++runId;
  for (const m of homeMeshes) scene.remove(m);
  homeMeshes = [];
  ringStop(airShot); airShot = null; // 지난 고전 숨의 실험 상태를 끌고 오지 않는다
  lastBreath.aim = null; micOfferArmed = false; cue.receipt = null;
  $('#dailyCard').hidden = true; $('#lvResult').hidden = true; $('#lvIntro').hidden = true; $('#sweepSheet').hidden = true;
  sweep.N = N; sweep.idx = seedIdx; sweep.lastTrail = null; sweep.slowCancels = 0;
  hideGizmo(); // 고전 조준 고리·층 고리는 이 판에서 안 쓴다(연습판은 자기 바람 자국 메시)
  if (micEnabled && mic.ready) setTimeout(() => toast(t('swMicNote')), 600); // 마이크 켬이어도 이 판은 터치만 받는다
  let first = true;
  for (;;) {
    const seed = Sweep.practiceSeed(N, sweep.idx);
    buildPracticePile(N, seed);
    if (first) {
      show('#hud');
      await introDrop();
      if (my !== runId) return;
      await banner(`${t('swBoard')} · ${N}`, 'b-me');
      if (my !== runId) return;
      first = false;
    } else { sfx.whoosh(); await wait(250); if (my !== runId) return; }
    const raw = await playerSweepShot();
    if (my !== runId || !raw) return;
    const res = await blowSweep(raw);
    if (my !== runId || !res) return;
    const choice = await sweepResult(raw, res, seed, my);
    if (my !== runId) return;
    if (choice === 'home' || !choice) { goHome(); return; }
    if (choice === 'new') sweep.idx++;
  }
}

// 매 숨 더미를 새로 만든다(같은 시드 = 같은 더미 → 시도끼리 비교). 측정과 같은 물리: Table(seed·7907 + N, lift 519.59) — feel.wind 무시
function buildPracticePile(N, seed) {
  // 지난 연습판 더미의 Rapier 월드를 반납한다(숨마다 새 월드 — 반납 안 하면 WASM 메모리가 숨당 약 0.47 MB 씩 늘었다, 검토 1). 연습판 표만(고전·대결 표는 각자 정리)
  if (table && match?.sweep && !match?.net && !table.puppet) { try { table.world.free(); } catch (e) { /* 이미 반납 */ } table = null; }
  const rng = mulberry32(seed);
  const ids = Array.from({ length: N }, () => rollCard(rng, null));
  match = { seed, rng, myStake: [], aiStake: [], pot: ids.map((id) => ({ id, from: 'practice' })), rivalName: '', rivalCard: CARDS[0], mode: 'fun', practice: true, sweep: true, solo: true, n: N, turn: 'me', turnNo: 0, best: 0, flipsMe: 0, level: null };
  table = new Table(Sweep.practiceTableSeed(N, seed), { lift: 519.59 });
  table.addPile(ids);
  table.settle(600);
  clearMatchMeshes();
  for (const d of table.discs) { const m = makeDiscMesh(d.cardId); meshes.set(d.id, m); scene.add(m); }
  syncMeshes();
  state = 'match'; pose = 'eye'; gogglesOn = false;
  camZoom = 0; simOn = false; sweep.dispA = 0;
  snapCam();
  $('#rivalName').textContent = t('swBadge'); // '연습 · 보상 없음'을 상대 이름 칸에(떠 있는 띠는 작은 폰에서 판돈 상자를 가렸다)
  $('#rivalAva').src = backImage();
  $('#meScore').textContent = '0';
  $('#aiScore').textContent = `${t('swPileNo')}\u00a0${seed - Sweep.PRACTICE_SEEDS[N][0] + 1}`; // 시드 번호 대신 '더미 n'(같은 n = 같은 더미)
  $('#potLbl').textContent = t('swPile');
  $('#potN').textContent = String(N);
  $('#hud').classList.remove('no-pot');
  $('#sweepCard').hidden = true;
  puffer.mode = 'idle'; puffer.p = 0; puffer.who = 'me';
}

// 엄지 입력 한 번 → { kind: 'pueok'|'puck'|'plan'|'gb', q, ctl, input } (취소는 안에서 처리하고 다시 기다림) · 홈으로 나가면 null
// A 'pueok' 는 '푸'가 열리는 순간 돌려준다(그때부터 물리 시작). 떼기를 받을 때까지 move·up 리스너는 남는다
// B 'gb' 는 놓는 순간 돌려준다(그때부터 퍼—, 숨 길이는 저절로). 휙(놓은 뒤 다시 눌러 위로)·늦은 휙을 받으려고 리스너는 판정까지 남는다(I.stop)
function playerSweepShot() {
  if (!sweepOn()) throw new Error('playerSweepShot: 쓸기 연습판 밖 — 레벨·대결은 고전 조작(playerShot)');
  return new Promise((resolve) => {
    const el = renderer.domElement;
    const F = Rules.POUCH_FULL;
    const gb = sweepGB(); // 이 숨의 문법(숨 도중 ⚙ 를 바꿔도 이 숨은 그대로)
    camAimGoal = 1; camStrafeGoal = 0;
    myTurn.on = true; myTurn.t0 = performance.now(); myTurn.pressed = false;
    puffer.mode = 'idle'; puffer.p = 0; puffer.who = 'me'; puffer.strain = 0; puffer.full = false;
    $('#hint').hidden = false; $('#hint').className = 'hint sw'; $('#hintText').textContent = t(gb ? 'swHintB' : 'swHint'); // sw = 바탕 띠(칠판 글과 겹쳐 안 읽혔다, 검토)
    let settled = false;
    const I = {
      gb, g: null, inh: null, strain: 0, full: false, lastT: 0, leakAt: 0, ctl: null, trail: [], opens: 0, blowAt: null, relAt: null, released: false, pointerId: null,
      // B: 숨 동안 누른 손가락마다 휙 인식기 { f: Sweep.Flick, tr: 궤적 }(pointerId → — 머무는 손가락이 있어도 다른 손가락 휙을 받는다) · 휙 받은 누름의 궤적 ·
      //    휙 받은 시각 · 숨 끝 뒤 휙 · 휙 수 · 당김 획 안의 휙 인식기(pf, 쓸기로 안 셈) · 한 획 휙(당김 획 안 휙 + 빠른 밀기)
      fls: new Map(), flTr: null, flickAt: null, lateAt: null, flicks: 0, listening: false, pf: null, pfFired: false, strokeFlick: false,
    };
    sweep.input = I;
    const vis = () => { if (document.hidden) lose(); };
    const listen = (on) => {
      I.listening = on;
      const f = on ? 'addEventListener' : 'removeEventListener';
      el[f]('pointerdown', down);
      window[f]('pointermove', move);
      window[f]('pointerup', up);
      window[f]('pointercancel', cancelEv);
      window[f]('blur', lose);
      window[f]('pagehide', lose);
      document[f]('visibilitychange', vis);
    };
    const inhStop = () => { I.inh?.stop(); I.inh = null; };
    const resetPouch = () => { I.strain = 0; I.full = false; puffer.strain = 0; puffer.full = false; };
    const end = () => { listen(false); inhStop(); I.fls.clear(); sweep.nudge = false; if (sweep.input === I) sweep.input = null; $('#hint').hidden = true; };
    I.stop = end; // B: 판정 뒤(sweepResult) 리스너 정리
    const settle = (v) => {
      if (settled) return;
      settled = true;
      cancelInput = null;
      myTurn.on = false; myTurn.pressed = false;
      myTurn.until = v ? performance.now() + 650 : 0;
      if (v) { sweep.lastTrail = I.trail.slice(); sweep.lastFlTrail = null; sweep.lastQ = v.q; v.input = I; }
      resolve(v);
    };
    I.kill = () => { end(); settle(null); };
    cancelInput = I.kill;
    // 세기·꽉 래치(Rules 그대로): 당김 최대(되물림 없음)가 꽉에 닿으면 '읍' + 손끝 톡 + 들숨 소리 멈춤
    const pouch = () => {
      const p = I.g.pMax, was = I.full;
      I.full = Rules.fullLatch(p, was);
      if (I.full && !was) { sfx.cork(); navigator.vibrate?.(25); I.inh?.hold(); }
      if (!I.full && was) I.inh?.resume();
      puffer.full = I.full; puffer.p = p; puffer.mode = 'charge';
      I.inh?.set(p / F);
    };
    // 취소: 숨·차례를 쓰지 않는다. 느린 밀기면(A 만) '툭 밀어 올려요' + 손가락 시범
    const cancelBreath = (why) => {
      inhStop(); resetPouch();
      I.g = null; I.trail = []; I.pf = null; I.pfFired = false;
      puffer.p = 0;
      if (why === 'cough') {
        sfx.cough(); navigator.vibrate?.([40, 60, 40]);
        puffer.mode = 'cough';
        setTimeout(() => { if (puffer.mode === 'cough') puffer.mode = 'idle'; }, 700);
      } else puffer.mode = 'idle';
      sweep.nudge = false; I.riseAt = null;
      if (why === 'slow') { sweep.slowCancels++; sweep.guideUntil = performance.now() + 6500; toast(t('swSlowTip')); }
      if (why === 'side') toast(t('swSideCancel')); // B: 당기며 옆으로 30% 뺐다 — 조용히 취소하지 않고 이유를 말한다(검토)
      myTurn.pressed = false; myTurn.t0 = performance.now();
      $('#hint').hidden = false;
    };
    const startCtl = (mode, extra) => {
      const ctl = new Sweep.SweepCtl(table, { mode, onEvent: (n) => sweepEvent(n, mode), ...extra });
      I.ctl = ctl;
      return ctl;
    };
    // 엄지 사건(gesture.move·tick 의 반환) — A '푸' 시작이면 그 순간 물리(blowSweep). B 인식기는 '푸'를 열지 않는다(upStart ∞)
    I.onEv = (e, now) => {
      if (!e || !I.g) return;
      if (e.ev === 'inhale') pouch();
      else if (e.ev === 'blowStart') {
        if (I.ctl || I.gb) return;
        I.opens++;
        I.blowAt = now;
        sweep.nudge = false;
        const q = clamp(I.g.pMax / F, 0, 1);
        inhStop(); resetPouch();
        startCtl('thumb');
        settle({ kind: 'pueok', q, ctl: I.ctl });
      } else if (e.ev === 'sweep') { if (I.ctl) I.ctl.u = e.u; }
    };
    // 프레임마다(sweepTick, 물리 스텝 전): 버팀·새는 김·콜록 (+ A 안 열림 넛지)
    I.frame = (now) => {
      if (!I.g || I.g.st !== 'inhale') { I.lastT = 0; return; }
      // A 안 열림 넛지: 엄지가 가장 낮은 점보다 8 px 이상 올라 0.3 s 가 지나도 '푸'가 안 열렸다(작은·느린 툭) → '아직 안 열렸어요 — 툭!'(sweepCoachDraw)
      if (!I.gb) {
        const rise = I.g.lowRaw - I.g.tr[I.g.tr.length - 1][2];
        if (rise >= 8) { if (I.riseAt == null) I.riseAt = now; } else I.riseAt = null;
        sweep.nudge = I.riseAt != null && now - I.riseAt > 300;
      }
      const dt = I.lastT ? Math.min(50, now - I.lastT) : 0;
      I.lastT = now;
      I.strain = Rules.strainStep(I.strain || 0, I.g.pMax, dt, I.full, feel.strainMs);
      puffer.strain = I.strain;
      if (I.strain >= Rules.LEAK_AT && now >= I.leakAt) { sfx.leak(); I.leakAt = now + lerp(260, 140, (I.strain - Rules.LEAK_AT) / (1 - Rules.LEAK_AT)); }
      if (I.strain >= 1) cancelBreath('cough');
    };
    // 주입 훅(window.__sweepFire): 엄지 대신 측정 일정으로 한 숨. B { kind: 'gb', q, ts } = 놓기 → ts(화면 초)에 휙(sweep.js flickShot 과 같은 순서)
    I.firePlan = (plan) => {
      if (!plan || I.g || I.ctl || settled) return false;
      const q = clamp(+plan.q || 0, 0, 1.25);
      if (plan.kind === 'gb') {
        const ts = plan.ts == null ? null : +plan.ts;
        startCtl('flick', { q });
        if (ts != null) I.ctl.flick(ts);
        I.released = true;
        end();
        settle({ kind: 'gb', q, ctl: I.ctl, plan: { kind: 'gb', q, ts }, inject: true });
        return true;
      }
      const pl = plan.kind === 'puck' ? null : Sweep.resolvePlan({ A: plan.A, w: plan.w, t0: plan.t0, D: plan.D }, table.columnTop());
      if (pl) startCtl('plan', { plan: pl }); else startCtl('puck');
      I.released = true;
      end();
      settle({ kind: pl ? 'plan' : 'puck', q, ctl: I.ctl, plan: pl });
      return true;
    };
    // A: 떼기 = 숨 끝
    const release = (u, now) => {
      if (!I.ctl || I.released) return;
      I.released = true; I.relAt = now;
      I.ctl.release(u);
      end();
    };
    // B: 놓기 = 퍼— 시작(숨 길이 D(q) 는 저절로). 같은 획에서 놓기 전 위로 휙은 세지 않는다(sweepgb ⑤: 놓자마자 휙 = 0.0~0.4장)
    const releaseB = (out, now) => {
      I.relAt = now;
      const q = clamp(out.p / F, 0, 1);
      inhStop(); resetPouch();
      startCtl('flick', { q });
      I.released = true; I.g = null;
      $('#hint').hidden = true;
      settle({ kind: 'gb', q, ctl: I.ctl });
    };
    // B 휙: 첫 번째만 물리로(두 번째부터 무시). 숨이 이미 끝났으면 끝난 뒤 SW_LATE_MS 안만 늦은 휙으로 기록(물리엔 안 감 → 칩 '늦었어요'),
    //   그 뒤(판정 기다림)는 '잠깐…' 신호만
    const fire = (now, e) => {
      I.flicks++;
      if (I.flickAt != null || I.lateAt != null) return;
      if (sweep.clock && I.ctl === sweep.ctl && I.ctl.flick()) {
        I.flickAt = now; sweep.flickAt = now; I.flTr = e.tr;
        sweepVib(SW_FLICK_VIB);
        return;
      }
      if (I.ctl?.t0 == null && sweep.breathEndAt && now - sweep.breathEndAt <= SW_LATE_MS) I.lateAt = now;
      else swPopSet('swJudgeWait', now);
    };
    const flDown = (ev) => {
      const now = performance.now();
      if (!sweep.clock && !(sweep.breathEndAt && now - sweep.breathEndAt <= SW_LATE_MS)) { swPopSet('swJudgeWait', now); return; } // 판정 기다림
      if (I.fls.size >= 5) return;
      const e = { f: new Sweep.Flick(), tr: [[ev.clientX, ev.clientY, now]] };
      e.f.down(ev.clientX, ev.clientY, now);
      I.fls.set(ev.pointerId ?? -1, e);
      try { el.setPointerCapture?.(ev.pointerId); } catch (err) { /* 합성 포인터 */ }
    };
    const flMove = (ev, isUp) => {
      const id = ev?.pointerId ?? -1, e = I.fls.get(id);
      if (!e) return;
      const now = performance.now();
      if (e.tr.length < 300) e.tr.push([ev.clientX, ev.clientY, now]);
      const hit = isUp ? e.f.up(ev.clientX, ev.clientY, now) : e.f.move(ev.clientX, ev.clientY, now);
      if (hit) fire(now, e);
      if (!isUp) return;
      I.fls.delete(id);
      if (I.flTr === e.tr) sweep.lastFlTrail = e.tr; // 지난 숨 궤적 = 휙 받은 누름만
      else if (!e.f.fired && sweep.clock && I.flickAt == null) swPopSet('swUpFlick', now); // 눌렀다 뗐는데 휙이 아님(탭·작은 밀기) → '위로 휙!'
    };
    const down = (ev) => {
      if (state !== 'match' || !sweepOn()) return;
      if (I.gb && I.ctl) { if (I.ctl.mode === 'flick') flDown(ev); return; } // B 숨 동안: 어디든 다시 눌러 휙(손가락마다)
      if (I.g || I.ctl || settled) return;
      if (ev.clientY < window.innerHeight / 3) return; // 화면 아래 2/3 아무 데나(조준 없음)
      sfx.unlock();
      const now = performance.now();
      I.g = I.gb ? new Sweep.GestureB(window.innerWidth, window.innerHeight, { pull: feel.pull }) : new Sweep.Gesture(window.innerWidth, window.innerHeight, { ...Sweep.GAME_GCFG, pull: feel.pull });
      I.g.down(ev.clientX, ev.clientY, now);
      if (I.gb) { I.pf = new Sweep.Flick(); I.pf.down(ev.clientX, ev.clientY, now); I.pfFired = false; I.strokeFlick = false; }
      I.trail = [[ev.clientX, ev.clientY, now]];
      I.pointerId = ev.pointerId;
      try { el.setPointerCapture?.(ev.pointerId); } catch (e) { /* 합성 포인터 */ }
      myTurn.pressed = true;
      puffer.mode = 'charge'; puffer.p = 0;
      resetPouch();
      $('#hint').hidden = true;
      I.inh = sfx.inhale();
    };
    const move = (ev) => {
      if (I.gb && I.ctl) { flMove(ev, false); return; }
      if (!I.g || (I.pointerId != null && ev.pointerId != null && ev.pointerId !== I.pointerId)) return;
      const now = performance.now();
      if (!I.released) { I.trail.push([ev.clientX, ev.clientY, now]); if (I.trail.length > 900) I.trail.shift(); }
      I.onEv(I.g.move(ev.clientX, ev.clientY, now), now);
      if (I.pf?.move(ev.clientX, ev.clientY, now)) I.pfFired = true; // B: 놓기 전 같은 획 안의 휙(쓸기로 안 셈 — 숨 동안 '그 휙은 안 세요')
    };
    const up = (ev) => {
      if (I.gb && I.ctl) { flMove(ev, true); return; }
      if (!I.g || (I.pointerId != null && ev?.pointerId != null && ev.pointerId !== I.pointerId)) return;
      const now = performance.now();
      if (I.g.st === 'inhale') {
        const out = I.g.up(ev.clientX, ev.clientY, now);
        if (out.kind === 'cancel') { cancelBreath(out.slow ? 'slow' : out.side && I.gb ? 'side' : 'cancel'); return; }
        if (I.gb) {
          I.trail.push([ev.clientX, ev.clientY, now]);
          if (I.pf?.up(ev.clientX, ev.clientY, now)) I.pfFired = true;
          I.strokeFlick = I.pfFired && upSpeed(I.trail) >= SW_STROKE_PXS;
          releaseB(out, now);
          return;
        }
        // A 퍽: '푸'가 안 열린 채 떼기 = 바닥 입·고개 0·0.131 s (측정 kind 'puff' · kin 'c')
        I.relAt = now;
        const q = clamp(out.p / F, 0, 1);
        startCtl('puck');
        I.released = true;
        end();
        settle({ kind: 'puck', q, ctl: I.ctl });
        return;
      }
      const out = I.g.up(ev.clientX, ev.clientY, now);
      if (!I.released) I.trail.push([ev.clientX, ev.clientY, now]);
      release(out?.u, now);
    };
    // 포인터 취소·창 흐림·숨김·페이지 떠남: A 는 숨이 이미 나갔으면 떼기(취소 없음), 아니면 취소. B 는 숨이 저절로라 휙 누름만 버림
    const lose = () => {
      if (I.gb && I.ctl) { I.fls.clear(); return; }
      if (I.ctl) { release(null, performance.now()); return; }
      if (I.g) cancelBreath('cancel');
    };
    // pointercancel 은 이 숨의 손가락일 때만(다른 손가락·다른 포인터의 취소가 '푸'를 끝내지 않게 — 검토 1). 창 흐림·숨김·떠남은 위 lose 그대로
    const cancelEv = (ev) => {
      if (I.gb && I.ctl) { if (ev?.pointerId == null) I.fls.clear(); else I.fls.delete(ev.pointerId); return; }
      if (I.pointerId == null || ev?.pointerId == null || ev.pointerId === I.pointerId) lose();
    };
    listen(true);
  });
}

// 프레임마다(물리 스텝 전): 엄지 인식기 판정(사건이 없어도) + 버팀
function sweepTick(now) {
  const I = sweep.input;
  if (!I) return;
  if (!sweepOn()) { I.kill?.(); sweep.input = null; return; }
  if (I.g && (I.g.st === 'inhale' || I.g.st === 'blow')) I.onEv(I.g.tick(now), now);
  I.frame?.(now);
}

// 쓸기 숨: blow() 를 고치지 않는 새 함수. 히트스톱 없음 — 손잡이 소리 → '푸 시작' 톡 → 물리(blowProg)
function blowSweep(raw) {
  if (match?.net || !match?.practice || !sweepOn()) throw new Error('blowSweep: 솔로 쓸기 연습판 전용(대결·레벨 금지)');
  const ctl = raw.ctl;
  sweep.ctl = ctl;
  sweep.snd?.stop(); sweep.snd = null;
  // 소리: 퍽 = 고전 '퍽' 파열음(바람 소리 없음) · 푸어억 = 짧은 파열음(실물 '푸'는 약 10 ms 안에 시작, 06) + 이어지는 바람(자국 높이를 따라 오름)
  if (raw.kind === 'puck') sfx.puff(raw.q, 1);
  else { sfx.puff(0.6 * raw.q, 1); sweep.snd = sfx.blow(); }
  sweepVib(SW_OPEN_VIB);
  sweep.openAt = performance.now(); // 화면 열림 신호(자국·리본 번쩍 · 입술 위 '푸—'/'퍼—')
  sweep.flickAt = 0; sweep.coachKey = null; sweep.breathEndAt = 0; sweep.pop = null;
  sweep.coachShot = sweepCoachOn(); // 이 숨이 코치 숨인가(아래 total++ 전에 — 셋째 숨 도중 코치가 꺼지지 않게)
  sweep.coachAgain = false;
  ctl.attach(table.blowProg({ prog: ctl.prog, power: raw.q, dur: ctl.durCap })); // 실험 jetLag 없음(blowProg 는 받지 않음) → table.air = null
  resetSimWatch('me');
  puffer.mode = 'blow'; puffer.p = raw.q; puffer.fill = clamp(raw.q, 0, 1); puffer.ratio = 1; puffer.strain = 0; puffer.full = false;
  hitStopUntil = 0; slowUntil = 0; acc = 0;
  simOn = true;
  sweep.clock = true; sweep.clockEnded = false;
  sweep.total++;
  window.__puffSweep.shots++;
  return new Promise((resolve) => { sweep.shot = { kind: raw.kind, q: raw.q, ctl, j: { n: 0, quiet: 0 }, steps: 0, fr: [], resolve, judged: false }; });
}
function sweepClockEnd() {
  if (!sweep.clock) return;
  sweep.clock = false; sweep.clockEnded = true; sweep.breathEndAt = performance.now();
  sweep.snd?.stop(); sweep.snd = null;
  camAimGoal = 0; // 숨이 끝나면 위에서 내려다보는 시점으로(뒤집힌 그림이 보이게)
  setTimeout(() => { if (puffer.mode === 'blow' && !sweep.clock) pufferIdle(); }, 250);
}
// frame 루프의 매 table.step() 직후: 기록(SweepCtl.after) → 숨 끝이면 시계 끝 → 스텝 판정(sim.js stepJudge). 판정 스텝이면 true(그 프레임 스텝 멈춤)
function sweepAfterStep() {
  const S = sweep.shot;
  if (!S || S.judged) return false;
  S.ctl.after(table);
  S.steps++;
  if (sweep.clock && !table.puff) sweepClockEnd();
  if (!table.stepJudge(S.j)) return false;
  S.judged = true;
  simOn = false;
  sweepClockEnd();
  const R = table.judgeResult();
  S.res = { flips: R.flipped.length, outs: R.outs.length, flipped: R.flipped, outList: R.outs, hash: Sweep.poseHash(table), steps: S.steps };
  S.resolve(S.res);
  return true;
}
function sweepFrameSteps(n, clk) { const S = sweep.shot; if (S && !S.judged && S.fr.length < 3000) S.fr.push([n, clk ? 1 : 0]); }

// 판정 뒤: OUT 글자·장수 → 기록 → '방금 숨' 카드 → 단추(같은 더미 다시 · 새 더미 · 홈)
async function sweepResult(raw, res, seed, my) {
  const S = sweep.shot;
  sweep.shot = null;
  const ctl = raw.ctl, I = raw.input;
  I?.stop?.(); // B: 휙·늦은 휙 리스너는 판정까지 — 여기서 정리
  for (const d of res.outList) { if (d.off) continue; const p = d.body.translation(); fx.text(new THREE.Vector3(p.x, p.y + 0.5, p.z), 'OUT', 'out'); }
  if (res.outs) chalkPulse();
  const sum = ctl.summary(table, res.flips, res.outs);
  const st = sweepStats(I);
  const fr = S?.fr || [];
  const al = ctl.rec.series.map((r) => r[1]);
  const gbShot = ctl.mode === 'flick';
  const last = {
    g: gbShot ? 'B' : 'A', kind: raw.kind, q: +raw.q.toFixed(4), qRaw: raw.q, plan: raw.plan || null, inject: !!raw.inject, D: ctl.D, tTop: ctl.rec.tTop, flips: res.flips, outs: res.outs, steps: res.steps, hash: res.hash,
    n: sum.n, seed, cause: sum.cause, opens: I?.opens || 0, alphaMax: al.length ? Math.max(...al) : 0, alphaMono: al.every((a, i) => !i || a >= al[i - 1] - 1e-9),
    endT: ctl.state.t, dur: ctl.P?.dur ?? null, fr, stats: st, frame: sweepFrameStats(), coach: !!sweep.coachShot,
    // B: 휙이 잠긴 숨 시각 t0(화면 초) · 휙 순간 위 절반 기울기 · 위 절반 10° 시각(화면 초) · 측정 규칙 칩(sweep.js gbChip) · 휙 수 · 늦은 휙
    //    · 한 획 휙(놓기 전 같은 획의 휙 — 쓸기로 안 셈). 늦은 휙 = 숨 끝 뒤 창 안 휙 또는 숨 마지막 스텝에 와서 잠기지 못한 휙
    t0: gbShot ? ctl.t0 : null, ttF: gbShot ? ctl.rec.ttF : null, cueT: gbShot ? ctl.rec.cueT : null, gbChip: gbShot ? sum.chip : null, flicks: I?.flicks || 0,
    late: I?.lateAt != null || (gbShot && I?.flickAt != null && ctl.t0 == null), stroke: !!I?.strokeFlick,
  };
  last.chip = sweepChip(raw, last, sum);
  last.chip2 = sweepChip2(raw, last, sum);
  window.__puffSweep.last = last;
  const entry = gbShot
    ? { g: 'B', q: last.q, kind: raw.kind, D: last.D, ts: last.t0 == null ? null : +last.t0.toFixed(4), flickMs: st.flickMs, lateMs: st.lateMs, flicks: last.flicks, stroke: last.stroke, ttF: last.ttF, cueMs: st.cueMs, pullUpPxS: st.maxPxS, flickPxS: st.flickPxS, tTop: last.tTop, flips: res.flips, outs: res.outs, cause: sum.cause, chip: last.chip, chip2: last.chip2, coach: last.coach, n: sum.n, seed, frameAvg: last.frame.avg, frameP95: last.frame.p95 }
    : { g: 'A', q: last.q, kind: raw.kind, openLatMs: st.openLatMs, maxPxS: st.maxPxS, blowMs: st.blowMs, slowCancels: sweep.slowCancels, tTop: last.tTop, D: last.D, flips: res.flips, outs: res.outs, cause: sum.cause, chip: last.chip, coach: last.coach, n: sum.n, seed, frameAvg: last.frame.avg, frameP95: last.frame.p95 };
  if (gbShot && ['none', 'stroke', 'early'].includes(last.chip)) sweep.coachAgain = true; // 안 쓸었거나(한 획 휙 포함) 일렀으면 다음 숨에 코치 다시(그 뒤엔 사라짐)
  window.__puffSweep.log.unshift(entry);
  if (window.__puffSweep.log.length > 20) window.__puffSweep.log.length = 20;
  sweep.slowCancels = 0;
  $('#meScore').textContent = String(res.flips);
  const el = $('#big');
  el.innerHTML = res.flips > 0 ? `${res.flips} <small>${t('flipped')}</small>` : t('miss');
  el.className = 'big ' + (res.flips >= 0.5 * sum.n ? 'r2' : res.flips > 0 ? 'r1' : 'r0');
  el.hidden = false; void el.offsetWidth; el.classList.add('go');
  await wait(700);
  el.hidden = true;
  if (my !== runId || !sweepOn()) return null; // 그사이 홈·다른 판으로 나갔으면 카드를 띄우지 않는다(숨은 카드가 안드로이드 '뒤로'를 삼키던 것, 검토 1·2)
  return showSweepCard(raw, last, sum);
}
// 손 기록(§8 숫자·'기록 복사'): 푸 열림 지연 = 밀기 시작(최저점에서 2 px 위) → '푸' 시작 · 최고 밀기 속도(30 ms 이상 간격) · 푸 시작 → 떼기
//   B: 최고 밀기 = 놓기 전 같은 획의 위로 밀기(쓸기로 안 셈) · 휙 속도(놓은 뒤 누름) · 놓기 → 휙(벽시계 ms) · 놓기 → 늦은 휙 · 놓기 → 위 절반 10°(벽시계 = 화면 × 2)
function upSpeed(tr) {
  let iLow = 0;
  for (let i = 1; i < tr.length; i++) if (tr[i][1] >= tr[iLow][1]) iLow = i;
  let vmax = 0;
  for (let i = iLow + 1; i < tr.length; i++) {
    let j = i - 1;
    while (j > iLow && tr[i][2] - tr[j][2] < 30) j--;
    const dt = tr[i][2] - tr[j][2];
    if (dt >= 16) vmax = Math.max(vmax, ((tr[j][1] - tr[i][1]) / dt) * 1000);
  }
  return Math.round(vmax);
}
function sweepStats(I) {
  const tr = I?.trail || [];
  if (I?.ctl?.mode === 'flick') { // 갈래 = 이 숨의 조종 모드(주입 훅 { kind: 'gb' } 은 문법 A 에서도 B 기록, A 주입은 B 에서도 A 기록)
    const fl = I.flTr || [];
    const cue = I.ctl?.rec?.cueT;
    return {
      openLatMs: null, blowMs: null, maxPxS: tr.length > 1 ? upSpeed(tr) : null, flickPxS: fl.length > 1 ? upSpeed(fl) : null,
      flickMs: I.flickAt != null && I.relAt != null ? Math.round(I.flickAt - I.relAt) : null,
      lateMs: I.lateAt != null && I.relAt != null ? Math.round(I.lateAt - I.relAt) : null,
      cueMs: cue != null && cue >= 0 ? Math.round(2000 * cue) : null,
    };
  }
  if (tr.length < 2) return { openLatMs: null, maxPxS: null, blowMs: null };
  let iLow = 0;
  for (let i = 1; i < tr.length; i++) if (tr[i][1] >= tr[iLow][1]) iLow = i;
  const yLow = tr[iLow][1];
  let pushT = null;
  for (let i = iLow + 1; i < tr.length; i++) if (yLow - tr[i][1] >= 2) { pushT = tr[i][2]; break; }
  let vmax = 0;
  for (let i = iLow + 1; i < tr.length; i++) {
    let j = i - 1;
    while (j > iLow && tr[i][2] - tr[j][2] < 30) j--;
    const dt = tr[i][2] - tr[j][2];
    if (dt >= 16) vmax = Math.max(vmax, ((tr[j][1] - tr[i][1]) / dt) * 1000);
  }
  return {
    openLatMs: I.blowAt != null && pushT != null ? Math.round(I.blowAt - pushT) : null,
    maxPxS: Math.round(vmax),
    blowMs: I.blowAt != null && I.relAt != null ? Math.round(I.relAt - I.blowAt) : null,
  };
}

// 카드 원인 칩(시험 — cuecheck 식 검증 전, 스펙 §5.4·§9 5번): sweep.js causeOf 그대로, 글만 고친다(검토 2·3).
//   퍽이면 원인 대신 '퍽은 작은 더미용'(퍽에 '섞임'은 정보가 없다). 💨 는 세기가 정말 셀 때(q ≥ 0.95)만 '셌어요' —
//   재윤님 (a) '세서 원 밖'과 겹쳐 덜 당기라는 잘못된 처방이 되지 않게. 숨이 길었으면(D > 0.5 화면 초 = 벽시계 1초) '길었어요', 그 밖은 '원 밖 많음'
//   B(놓고 쓸기): 측정 규칙(sweep.js gbChip — 결과 먼저, 그다음 휙 순간 위 절반 기울기) 그대로 이름 🐇 · 좋아요 👍 · 늦음 🐢 · 안 쓸었어요 ⬆️.
//   숨이 끝난 뒤(창 안) 휙했으면 '늦었어요'. 휙 없이 놓기 전 같은 획에서만 휙했으면 🔁 '그 휙은 안 세요 — 놓고 다시 눌러 휙!'(재윤님 버릇 = 한 획, 검토 blocker).
//   덧칩 💨 셌어요 = 세게(q ≥ 0.95) 불고 원 밖 ≥ 25% · 뒤집힘 < 절반(측정: q1 안 휙은 원 밖 17~19장) — 주 칩이 이름·늦음·🔁 이면 안 붙인다(덜 당기라는 잘못된 처방)
const SW_CAUSE = { early: '🐇', sank: '🐢', weak: '🪶', strong: '💨', out: '💨', long: '⏳', good: '👍', mixed: '🔀', puck: '👆', late: '🐢', none: '⬆️', stroke: '🔁' };
function sweepChip(raw, last, sum) {
  if (raw.ctl?.mode === 'flick') return sum.chip !== 'none' ? sum.chip : last.late ? 'late' : last.stroke ? 'stroke' : 'none';
  if (raw.kind === 'puck') return 'puck';
  if (sum.cause !== 'strong') return sum.cause;
  if (raw.q >= 0.95) return 'strong';
  return last.D != null && last.D > 0.5 ? 'long' : 'out';
}
function sweepChip2(raw, last, sum) {
  if (raw.ctl?.mode !== 'flick' || ['early', 'late', 'stroke'].includes(last.chip)) return null; // 한 획 휙(🔁)은 '다시 눌러 휙'만 — 💨 는 배울 것을 흐린다
  return raw.q >= 0.95 && last.outs >= 0.25 * sum.n && last.flips < 0.5 * sum.n ? 'strong' : null;
}
// 타임라인 범례(색 견본 + 이름) — 캔버스 위 글자 대신 카드 HTML 한 줄(검토 3: 어느 선이 무엇인지 읽히게)
const SW_LEGEND = [['#ff8a1f', 'swTlHit'], ['dash', 'swTlTop'], ['#e0457b', 'swTlTilt'], ['rgba(80,170,255,0.6)', 'swTlEnv'], ['dot:#ffd23f', 'swTlCross'], ['dot:#3a8fe0', 'swTlRel']];
const SW_LEGEND_B = [['#ff8a1f', 'swTlHit'], ['dash', 'swTlTop'], ['#e0457b', 'swTlTilt'], ['rgba(80,170,255,0.6)', 'swTlEnv'], ['dot:#ffd23f', 'swTlCross'], ['dot:#3a8fe0', 'swTlFlick']];
// '방금 숨' 카드: 첫 화면 = 원인 칩 · 뒤집힘/원 밖 · 단추. 타임라인·범례·숫자는 '자세히'(작은 폰은 처음에 접힘 → 결과 더미가 보이게).
// 측정 정답 박자(예전 swRef 줄)는 보이지 않는다 — 스펙 §5 '정답 띠는 미리 보여 주지 않는다', 손 게이트가 지시 따르기를 재지 않게(검토 1·3)
function showSweepCard(raw, last, sum) {
  const box = $('#sweepCard');
  const gbShot = raw.ctl?.mode === 'flick';
  const kindTxt = raw.inject || raw.kind === 'plan' ? t('swKindPlan') : raw.kind === 'puck' ? t('swKindPuck') : gbShot ? t('swKindGb') : t('swKindPueok');
  const ck = last.chip, ck2 = last.chip2;
  $('#swNum').textContent = `${t('rcpTitle')} · ${kindTxt}`;
  const chip = (k, test) => `<span class="sw-chip c-${k}">${SW_CAUSE[k] || ''} ${t('swCause_' + k)}${test ? ` <i>${t('swTest')}</i>` : ''}</span>`;
  $('#swCause').innerHTML = chip(ck, true) + (ck2 ? ' ' + chip(ck2, false) : '');
  $('#swMain').innerHTML = `<b>${last.flips}</b><small>/${sum.n}</small> ${t('swNumFlip')} · ${t('swNumOut')} <b>${last.outs}</b>`;
  const ms = (v) => (v == null ? '–' : `${v} ms`);
  const st = last.stats;
  $('#swNums').innerHTML = (gbShot
    ? [
      `${t('swNumPow')} <b>${Math.round(last.q * 100)}%</b>`, `${t('swNumBreath')} <b>${(2 * last.D).toFixed(1)} s</b>`,
      `${t('swNumFlick')} <b>${st.flickMs != null ? ms(st.flickMs) : st.lateMs != null ? `${t('swNumLate')} ${ms(st.lateMs)}` : '–'}</b>`,
      `${t('swNumTiltF')} <b>${last.ttF != null && last.ttF >= 0 ? Math.round(last.ttF) + '°' : '–'}</b>`, `${t('swNumCue')} <b>${ms(st.cueMs)}</b>`,
      `${t('swNumFlickSpd')} <b>${st.flickPxS == null ? '–' : st.flickPxS + ' px/s'}</b>`, `${t('swFrame')} <b>${last.frame.avg} ms (p95 ${last.frame.p95})</b>`,
    ]
    : [
      `${t('swNumPow')} <b>${Math.round(last.q * 100)}%</b>`, `${t('swNumBlow')} <b>${ms(st.blowMs)}</b>`, `${t('swNumOpen')} <b>${ms(st.openLatMs)}</b>`,
      `${t('swNumSpeed')} <b>${st.maxPxS == null ? '–' : st.maxPxS + ' px/s'}</b>`, `${t('swFrame')} <b>${last.frame.avg} ms (p95 ${last.frame.p95})</b>`,
    ]).map((x) => `<span>${x}</span>`).join('');
  $('#swLeg').innerHTML = (gbShot ? SW_LEGEND_B : SW_LEGEND).map(([c, key]) => `<span><i${c.startsWith('dot:') ? ` class="dot" style="background:${c.slice(4)}"` : c === 'dash' ? ' class="dash"' : ` style="background:${c}"`}></i>${t(key)}</span>`).join('');
  const more = $('#swMore');
  more.open = sweep.moreOpen ?? window.innerHeight >= 760; // 펼치거나 접으면 이번 실행 동안 기억
  more.ontoggle = () => { sweep.moreOpen = more.open; if (more.open) drawSweepTimeline($('#swTl'), raw.ctl, last); };
  box.hidden = false; // 먼저 보이게(캔버스 크기를 읽으려면)
  if (more.open) drawSweepTimeline($('#swTl'), raw.ctl, last);
  return new Promise((resolve) => {
    const done = (v) => { box.hidden = true; sweep.card = null; resolve(v); };
    sweep.card = { resolve: done };
    $('#swSame').onclick = () => { sfx.pop(); done('same'); };
    $('#swNew').onclick = () => { sfx.pop(); done('new'); };
    $('#swHome').onclick = () => { sfx.pop(); done('home'); };
    $('#swCopy').onclick = async () => {
      const txt = JSON.stringify({ v: 1, at: new Date().toISOString(), ua: navigator.userAgent, app: !!window.__puffApp, log: window.__puffSweep.log });
      try { await navigator.clipboard.writeText(txt); toast(t('swCopied')); } catch (e) { console.log('[쓸기 기록]', txt); toast(t('copyManual')); }
    };
  });
}
// 타임라인(가로 = 손 시간 = 벽시계 초: 숨 동안 0.5배라 물리 초 × 2, 숨이 끝난 뒤 × 1 · 물리 0~1.2 s — 카드 숫자(벽시계 ms)와 같은 단위):
//   위 띠 = 높이(바람 자국 주황 · 더미 꼭대기 점선 · 꼭대기 넘음 노란 점 · 떼기(A)/휙(B) 파란 점), 가운데 띠 = 위 절반 기울기(0~90°, 분홍), 아래 띠 = 숨 봉투(파랑).
//   정답 곡선·예상 장수는 그리지 않는다(§5.4)
function drawSweepTimeline(cv, ctl, last) {
  if (!cv || !cv.clientWidth) return; // 접힌 '자세히' 안이면 펼칠 때 그린다
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const Wc = cv.clientWidth, Hc = cv.clientHeight || 110;
  cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, Wc, Hc);
  const Tend = last.dur ?? ctl.durCap; // 숨 끝(물리 초) — 그때까지 0.5배
  const wall = (tt) => 2 * Math.min(tt, Tend) + Math.max(0, tt - Tend);
  const T = 1.2, WT = wall(T), pad = 4;
  const x = (tt) => pad + (Math.min(WT, wall(tt)) / WT) * (Wc - 2 * pad);
  const ser = ctl.rec.series, top0 = ctl.top0;
  const hMax = Math.max(top0 * 1.25, ...ser.map((r) => r[3]), 1);
  const hTop = 4, hBot = Hc - 40, tTop = Hc - 36, tBot = Hc - 20, eTop = Hc - 17, eBot = Hc - 2;
  const y = (h) => hBot - (h / hMax) * (hBot - hTop);
  c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillRect(0, 0, Wc, Hc);
  c.fillStyle = 'rgba(224,69,123,0.07)'; c.fillRect(0, tTop - 1, Wc, tBot - tTop + 2);
  // 숨 봉투(아래 띠)
  c.fillStyle = 'rgba(80,170,255,0.5)';
  c.beginPath(); c.moveTo(x(0), eBot);
  for (const r of ser) c.lineTo(x(r[0]), eBot - r[2] * (eBot - eTop));
  if (ser.length) c.lineTo(x(ser[ser.length - 1][0]), eBot);
  c.closePath(); c.fill();
  // 더미 꼭대기(점선)
  c.strokeStyle = 'rgba(42,26,18,0.7)'; c.setLineDash([5, 4]); c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(x(0), y(top0)); c.lineTo(x(T), y(top0)); c.stroke(); c.setLineDash([]);
  // 위 절반 기울기(가운데 띠, 0~90°)
  c.strokeStyle = '#e0457b'; c.lineWidth = 2;
  c.beginPath();
  ctl.rec.tt.forEach((r, i) => { const yy = tBot - (Math.min(90, r[2]) / 90) * (tBot - tTop); if (i) c.lineTo(x(r[0]), yy); else c.moveTo(x(r[0]), yy); });
  c.stroke();
  // 바람 자국 높이(주황)
  c.strokeStyle = '#ff8a1f'; c.lineWidth = 3;
  c.beginPath();
  ser.forEach((r, i) => { if (i) c.lineTo(x(r[0]), y(r[3])); else c.moveTo(x(r[0]), y(r[3])); });
  c.stroke();
  const dot = (tt, h, col) => { c.fillStyle = col; c.strokeStyle = '#2a1a12'; c.lineWidth = 1.5; c.beginPath(); c.arc(x(tt), y(h), 5, 0, Math.PI * 2); c.fill(); c.stroke(); };
  if (last.tTop >= 0) dot(last.tTop, top0, '#ffd23f');
  const tBlue = ctl.mode === 'flick' ? last.t0 : last.D; // A = 떼기(D) · B = 휙(t0, 없으면 점 없음)
  if (tBlue != null && ser.length) { const r = ser.reduce((a, b) => (Math.abs(b[0] - tBlue) < Math.abs(a[0] - tBlue) ? b : a)); dot(r[0], r[3], '#3a8fe0'); }
  c.fillStyle = 'rgba(42,26,18,0.75)'; c.font = '600 10px sans-serif';
  c.fillText('0', 2, hBot - 2);
  const lab = `${WT.toFixed(1)} s · ${t('swTlAxis')}`;
  c.fillText(lab, Wc - c.measureText(lab).width - 4, hBot - 2);
}

// 시점(검토 2·3 '아래에서 위로 올리는 모습이 약하다'): 입을 따라 오르는 1인칭에 가까운 시점 — 입 위 0.7 u · 뒤 2.0 u, 옆 이동 없음(세로 화면에서
//   바닥 입이 화면 밖 왼쪽으로 나가던 것 고침). 바닥 입이 화면 아래 가운데(1인칭 입술 자리)에 오고, 고개를 들면 시점이 입과 함께 든다.
//   피치는 스펙 §5.1(10°·tanh)의 0.35배만 — 1:1 이면 바람 자국이 화면에서 거의 안 올랐다(14 px). 이 시점이면 30장 꼭대기까지 자국이 약 77 px 오른다
//   (three.js 투영, 390×844). 줄인 움직임이면 고개 0 시점 고정(입술·볼 내림은 남김, drawFPV)
function sweepView(top) {
  const portrait = window.innerWidth / window.innerHeight < 0.85;
  const pc = table.pileCenter();
  const M0 = { x: pc.x, y: Sweep.GEO.ym, z: pc.z + 1 + Sweep.GEO.L };
  const a = reducedMotion ? 0 : sweep.dispA;
  const o = Sweep.poseAt(a * D2R, 'c', Sweep.GEO, M0).o;
  const pos = new THREE.Vector3(pc.x, o.y + (portrait ? 0.7 : 0.55), o.z + (portrait ? 2.0 : 1.5));
  const d = new THREE.Vector3(pc.x, 0.12 + 0.5 * top, pc.z).sub(pos);
  const h = Math.hypot(d.x, d.z) || 1, L = d.length();
  const pitch = 0.35 * 10 * Math.tanh(a / 10) * D2R;
  const e = Math.atan2(d.y, h) + pitch;
  return { pos, target: pos.clone().add(new THREE.Vector3((d.x / h) * Math.cos(e) * L, Math.sin(e) * L, (d.z / h) * Math.cos(e) * L)) };
}

// 바람 자국 메시: 연습판 전용(고전 조준 고리 reticle 은 건드리지 않는다 — 검토 1: 공용 고리 불투명도가 레벨·대결로 새던 것)
function sweepMarkMesh() {
  if (!sweep.mark) {
    // 가는 테 — 제트가 더미보다 넓어(30·40장 앞면에서 약 1 u) 두꺼운 고리는 더미를 가렸다
    sweep.mark = new THREE.Mesh(new THREE.RingGeometry(0.205, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide }));
    sweep.mark.renderOrder = 10;
    sweep.mark.visible = false;
    scene.add(sweep.mark);
  }
  return sweep.mark;
}
const SW_COACH = 3; // 이번 실행 첫 3숨(+ 느린 밀기 취소 뒤 6.5초)은 '언제'를 말로 짚는다 — 스펙 §5.1 '맞는 때'는 튜토리얼 판에서만 → 연습판이 그 판. 손 게이트는 그 뒤 숨으로
// '지금 쭉!' = 위 절반 평균 기울기 15°. 고정 숨(툭 18 px 버티기) 실측: 30장 q0.7 시드 601~606·40장 q0.85 시드 401~406 모두 15° = 화면 약 0.21 s,
//   사람 반응 약 0.1 s(화면, 벽시계 0.2 s)를 더하면 쓸기 시작 ≈ 0.31 s — 정답 시작 0.25~0.35 s 안(사람 반응은 미검증)
const SW_COACH_TT = 15;
// B '들리면 휙!' = 위 절반 10°(sweep.js GB.cueTT, 측정 tools/sweepgb.mjs ⑤: 화면 0.16~0.19 s, 반응 벽시계 0.2~0.44 s 를 더하면 꼭대기의 94~98% — 15° 보다 느린 반응·40장 q0.7 에서 조금 낫다)
function swCoachTT() { return sweepGB() ? Sweep.GB.cueTT : SW_COACH_TT; }
// 코치: 첫 3숨 · A 느린 밀기 취소 뒤 6.5초 · B 지난 숨이 '안 쓸었어요'·'일렀어요'면 다음 한 숨(그 뒤엔 사라짐)
function sweepCoachOn(now = performance.now()) { return sweep.total < SW_COACH || now < sweep.guideUntil || sweep.coachAgain; }
// 지금 위 절반 평균 기울기(°) — 물리 상태 그대로(정답 신호 아님). 프레임마다 한 번(40장 = 회전 40번)
function sweepTiltNow() { return table ? Sweep.halves(table)[1] : 0; }

// 그리기(frame, sweepOn 일 때): 바람 자국 · 바람 리본 · 1인칭 끔이면 바닥 입 · 지난 엄지 궤적 · 손가락 시범(유령 자국) · 옆모습 창 · 말풍선
function sweepDraw(now) {
  const on = sweepOn() && state === 'match' && !!table;
  if (sweep.ribbon) sweep.ribbon.visible = false;
  if (sweep.mark) sweep.mark.visible = false;
  drawSweepSide(on);
  if (!on) { sweep.dispA = 0; return; }
  if (sweep.lastFrameT) { sweep.frameMs.push(now - sweep.lastFrameT); if (sweep.frameMs.length > 180) sweep.frameMs.shift(); }
  sweep.lastFrameT = now;
  const ctl = sweep.ctl;
  const blowing = sweep.clock && ctl;
  sweep.dispA += ((blowing ? ctl.state.alpha / D2R : 0) - sweep.dispA) * (blowing ? 1 : 0.15);
  const aiming = !!(sweep.input && myTurn.on);
  const guide = aiming && !myTurn.pressed && sweepCoachOn(now) && now - myTurn.t0 > 500 ? (sweepGB() ? sweepGuidePoseB(now) : sweepGuidePose(now)) : null;
  // 바람 자국: 숨 동안 = 지금 자세, 당기는 동안 = 고개 0 자리(흐리게), 시범 동안 = 시범 손가락 높이(유령 자국, '엄지 높이 = 자국 높이')
  let S = null, top0 = 0, zf = 0, cx = 0, q = sweep.lastQ, ghost = false;
  const pc = table.pileCenter();
  if (blowing) { S = ctl.state; top0 = ctl.top0; zf = ctl.zf; cx = ctl.c.x; q = sweep.shot?.q ?? q; }
  else if ((aiming && sweep.input.g) || guide) {
    cx = pc.x; zf = pc.z + 1; top0 = table.columnTop();
    const yHit = guide ? Sweep.hitC(guide.aDeg ?? Sweep.alphaForU(guide.u)) : Sweep.GEO.ym;
    S = { o: { x: pc.x, y: Sweep.GEO.ym, z: zf + Sweep.GEO.L }, alpha: 0, env: 0.25, yHit };
    q = guide ? 0.6 : clamp((sweep.input.g.pMax || 0) / Rules.POUCH_FULL, 0, 1);
    ghost = !!guide;
  }
  const flash = sweep.openAt && blowing ? clamp(1 - (now - sweep.openAt) / 280, 0, 1) : 0; // '푸'가 열린 순간: 자국·리본 번쩍(진동이 안 와도 열림이 보이게, 검토 2·3)
  if (S) {
    const a = (S.o.z - zf) / Math.max(0.2, Math.cos(S.alpha)); // 입 → 앞면 축 거리
    const rj = table.T.jetR0 + a * table.T.jetSpread;
    const over = S.yHit > top0;
    const m = sweepMarkMesh();
    m.visible = true;
    m.position.set(cx, S.yHit, zf + 0.03);
    m.lookAt(cx, S.yHit, zf + 2);
    const k = 1 + 0.15 * flash;
    m.scale.set((k * rj) / 0.26, (k * rj) / 1.6 / 0.26, 1); // 원뿔 세기 식(lat = hypot(lx, 1.6·ly, lz))과 같은 납작한 타원
    m.material.color.setHex(ghost ? 0xfff2b0 : 0xffffff);
    m.material.opacity = ghost ? 0.5 : Math.min(1, (0.3 + 0.5 * clamp(q * S.env, 0, 1)) * (over ? 0.4 : 1) + 0.4 * flash);
    if (blowing) {
      // 바람 리본: 입 → 자국 원뿔(프레임마다). 밝기 = 세기 × 숨 봉투(스펙 §5.1)
      if (!sweep.ribbon) {
        const g = new THREE.CylinderGeometry(0.75, 0.2, 1, 20, 1, true); // 위 = 자국 쪽(제트 폭의 0.75), 아래 = 입
        g.translate(0, 0.5, 0);
        sweep.ribbon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe2f6ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
        sweep.ribbon.renderOrder = 8;
        scene.add(sweep.ribbon);
      }
      const from = new THREE.Vector3(S.o.x, S.o.y, S.o.z), to = new THREE.Vector3(cx, S.yHit, zf);
      const dir = to.clone().sub(from), L = dir.length();
      sweep.ribbon.position.copy(from);
      sweep.ribbon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      sweep.ribbon.scale.set(rj, L, rj);
      sweep.ribbon.material.opacity = Math.min(0.5, 0.06 + 0.14 * clamp(q * S.env, 0, 1) + 0.25 * flash); // 입 뒤 시점이라 원뿔이 화면 가운데를 덮는다 → 옅게, 열림 순간만 밝게
      sweep.ribbon.visible = true;
      sweep.snd?.set(S.env, top0 > 0 ? S.yHit / top0 : 0, q);
    }
    // 헛바람(자국이 꼭대기 위): 위로 흐르는 줄(2D)
    if (over && blowing) {
      const cv = $('#breath'), c2 = cv.getContext('2d'), dpr = cv._dpr || 1;
      const p = new THREE.Vector3(cx, S.yHit, zf).project(camera);
      const px = (p.x * 0.5 + 0.5) * window.innerWidth, py = (-p.y * 0.5 + 0.5) * window.innerHeight;
      c2.save(); c2.scale(dpr, dpr); c2.strokeStyle = 'rgba(255,255,255,0.55)'; c2.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const kk = ((now * 0.002) + i / 5) % 1, xx = px + (i - 2) * 9; c2.beginPath(); c2.moveTo(xx, py - 30 * kk); c2.lineTo(xx, py - 30 * kk - 14); c2.stroke(); }
      c2.restore();
    }
  }
  const cv = $('#breath'), c2 = cv.getContext('2d'), dpr = cv._dpr || 1;
  // 1인칭을 끈 경우: 바닥 입을 투영한 자리에 입술(입이 오르는 것이 보이게)
  if (!fpvOn() && S && !ghost) {
    const p = new THREE.Vector3(S.o.x, S.o.y, S.o.z).project(camera);
    if (p.z < 1) {
      const px = (p.x * 0.5 + 0.5) * window.innerWidth, py = (-p.y * 0.5 + 0.5) * window.innerHeight;
      c2.save(); c2.scale(dpr, dpr); c2.fillStyle = '#d4566a'; c2.strokeStyle = '#2a1a12'; c2.lineWidth = 2;
      c2.beginPath(); c2.ellipse(px, py, 16, 7, 0, 0, Math.PI * 2); c2.fill(); c2.stroke(); c2.restore();
    }
  }
  // 지난 숨 엄지 궤적(회색 점선) — 조준 동안
  if (aiming && sweep.lastTrail && sweep.lastTrail.length > 1) {
    c2.save(); c2.scale(dpr, dpr); c2.strokeStyle = 'rgba(90,90,90,0.55)'; c2.lineWidth = 3; c2.setLineDash([6, 6]);
    c2.beginPath(); sweep.lastTrail.forEach((p, i) => (i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]))); c2.stroke();
    if (sweep.lastFlTrail && sweep.lastFlTrail.length > 1) { // B: 놓은 뒤 휙 누름(따로 — 놓은 자리와 잇지 않는다)
      c2.strokeStyle = 'rgba(200,150,0,0.55)';
      c2.beginPath(); sweep.lastFlTrail.forEach((p, i) => (i ? c2.lineTo(p[0], p[1]) : c2.moveTo(p[0], p[1]))); c2.stroke();
    }
    c2.restore();
  }
  if (guide) drawSweepGuide(guide, c2, dpr);
  sweepCoachDraw(c2, dpr, now);
}

// 손가락 시범 한 주기(4.2 s 벽시계): 꾹 → 당기고 → 툭! 푸—(28 px 를 105 ms = 약 270 px/s — 인식기 바닥 40 px/s 의 6배, 조금 느리게·작게 따라 해도 열림)
//   → 기다려…(약 0.6 s) → 쭉 올리며 떼기(꼭대기 + 15 px 를 약 0.3 s) → 쉼. u = 가장 낮은 점에서 올라간 높이(px) = 유령 자국 높이(sweepDraw)
//   예전 '살짝 올려 푸'(20 px 를 420 ms = 48 px/s)는 바닥 바로 위라 따라 하면 '푸'가 쓸기 도중에야 열려 이른 쓸기(🐇)가 됐다(검토 2)
function sweepGuidePose(now) {
  const W = window.innerWidth, H = window.innerHeight, minDim = Math.min(W, H);
  const x = W / 2, y0 = H * 0.6, pull = minDim * 0.42 * 0.6, FL = 28;
  const uTop = Math.max(60, (table.columnTop() - Sweep.GEO.ym) * Sweep.SWEEP.pxPerU + 15);
  const cyc = ((now - myTurn.t0) % 4200) / 4200;
  const sm = (k) => k * k * (3 - 2 * k);
  const yL = y0 + pull; // 가장 낮은 점
  let y = y0, key = 'swG1', press = 1;
  if (cyc < 0.1) press = cyc / 0.1;
  else if (cyc < 0.36) { y = y0 + sm((cyc - 0.1) / 0.26) * pull; key = 'swG2'; }
  else if (cyc < 0.385) { y = yL - sm((cyc - 0.36) / 0.025) * FL; key = 'swG3'; }
  else if (cyc < 0.53) { y = yL - FL; key = cyc < 0.43 ? 'swG3' : 'swG4'; }
  else if (cyc < 0.6) { y = yL - FL - sm((cyc - 0.53) / 0.07) * (uTop - FL); key = 'swG5'; }
  else if (cyc < 0.8) { y = yL - uTop; key = 'swG5'; press = cyc < 0.66 ? 1 : 1 - (cyc - 0.66) / 0.14; }
  else { y = y0; press = 0; key = null; }
  return { x, y, y0, yL, FL, uTop, key, press, u: press > 0 && cyc >= 0.36 ? Math.max(0, yL - y) : 0 };
}
// B 손가락 시범 한 주기(4.0 s 벽시계): 꾹 → 당기고 → 놓으면 퍼—(손가락 뗌) → 들리면…(손가락 떠 있음) → 다시 눌러 휙!(70 px 를 약 0.16 s)
//   → 쉼. 놓기(cyc 0.28) → 휙 시작(0.43) = 0.6 s 벽시계 = 측정 꼭대기(화면 0.3 s, 검토: 예전 박자 0.75~1.0 s 는 30장에서 '늦었어요'가 났다).
//   유령 자국은 휙부터 0.6 s 동안 바닥에서 24° 까지(B 고개 = 80°/s 화면 = 40°/s 벽시계)
const SW_DEMO_B_MS = 4000;
function sweepGuidePoseB(now) {
  const W = window.innerWidth, H = window.innerHeight, minDim = Math.min(W, H);
  const x = W / 2, y0 = H * 0.6, pull = minDim * 0.42 * 0.75, FLK = 70;
  const cyc = ((now - myTurn.t0) % SW_DEMO_B_MS) / SW_DEMO_B_MS;
  const sm = (k) => k * k * (3 - 2 * k);
  const yL = y0 + pull;
  let y = y0, key = 'swG1', press = 1, aDeg = 0;
  if (cyc < 0.06) press = cyc / 0.06;
  else if (cyc < 0.26) { y = y0 + sm((cyc - 0.06) / 0.2) * pull; key = 'swG2'; }
  else if (cyc < 0.3) { y = yL - 14 * sm((cyc - 0.26) / 0.04); key = 'swGB3'; press = 1 - 0.7 * sm((cyc - 0.26) / 0.04); }
  else if (cyc < 0.4) { y = yL - 14; key = cyc < 0.34 ? 'swGB3' : 'swGB4'; press = 0.3; }
  else if (cyc < 0.43) { y = yL - 14 + 4 * sm((cyc - 0.4) / 0.03); key = 'swGB4'; press = 0.3 + 0.7 * sm((cyc - 0.4) / 0.03); }
  else if (cyc < 0.47) { y = yL - 10 - FLK * sm((cyc - 0.43) / 0.04); key = 'swGB5'; }
  else if (cyc < 0.62) { y = yL - 10 - FLK; key = 'swGB5'; press = 1 - (cyc - 0.47) / 0.15; }
  else { y = y0; press = 0; key = null; }
  if (cyc >= 0.43 && cyc < 0.75) aDeg = Sweep.GB.A * Math.min(1, (cyc - 0.43) / 0.15);
  return { b: true, x, y, y0, yL, FLK, key, press, aDeg, u: 0 };
}
function drawSweepGuide(g, ctx, dpr) {
  const W = window.innerWidth;
  const { x, y, y0, yL, FL, uTop } = g;
  ctx.save(); ctx.scale(dpr, dpr);
  const arrow = (ax, ay, dir) => { ctx.beginPath(); ctx.moveTo(ax - 7, ay - 9 * dir); ctx.lineTo(ax, ay); ctx.lineTo(ax + 7, ay - 9 * dir); ctx.stroke(); };
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.moveTo(x + 30, y0); ctx.lineTo(x + 30, yL); ctx.stroke();
  if (g.b) {
    // B: 내려가는 길(↓, 점선) · 놓기 표시(작은 동그라미) · 따로 그린 짧은 휙 화살(↑, 노랑 실선 = 새로 누른 손가락)
    ctx.setLineDash([]); arrow(x + 30, yL, 1);
    ctx.beginPath(); ctx.arc(x + 30, yL + 12, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,210,63,0.95)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 50, yL - 10); ctx.lineTo(x + 50, yL - 10 - g.FLK); ctx.stroke(); arrow(x + 50, yL - 10 - g.FLK, -1);
  } else {
    // A: 길: 내려가는 길(왼쪽, ↓)과 올라가는 길(오른쪽, ↑)을 띄워 그린다 · '툭' 높이에 눈금
    ctx.beginPath(); ctx.moveTo(x + 46, yL); ctx.lineTo(x + 46, yL - uTop); ctx.stroke(); ctx.setLineDash([]);
    arrow(x + 30, yL, 1); arrow(x + 46, yL - uTop, -1);
    ctx.beginPath(); ctx.moveTo(x + 40, yL - FL); ctx.lineTo(x + 52, yL - FL); ctx.stroke();
  }
  if (g.press > 0) {
    ctx.globalAlpha = 0.4 + 0.6 * g.press;
    ctx.translate(x, y);
    ctx.fillStyle = '#ffe1c4'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-11, 0, 22, 62, 11) : ctx.rect(-11, 0, 22, 62); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffc6cf'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-6, 4, 12, 10, 5) : ctx.rect(-6, 4, 12, 10); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    if (g.key) {
      const txt = t(g.key);
      ctx.font = '700 15px "Jua", sans-serif';
      const tw = ctx.measureText(txt).width + 18, bx = clamp(-tw - 22, 8 - x, W - x - tw - 8);
      ctx.fillStyle = g.key === 'swG3' || g.key === 'swGB5' ? '#ffd23f' : 'rgba(255,255,255,0.95)'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, -34, tw, 28, 10) : ctx.rect(bx, -34, tw, 28); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1a12'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 9, -20);
    }
  }
  ctx.restore();
}

// 말풍선: (1) '푸'가 열린 순간 입술 위 '푸—'(늘, 0.65 s — 진동·소리와 상관없는 열림 신호) (2) 안 열림 넛지(늘): 엄지가 가장 낮은 점보다 8 px 이상 올라
//   0.3 s 가 지나도 '푸'가 안 열렸으면 '아직 안 열렸어요 — 툭!'(작은 툭이 조용히 실패하지 않게, 검토 2·3) (3) 코치(첫 3숨): 당기는 동안 '툭! 올려 푸',
//   열린 뒤 '기다려…'(채워지는 고리 = 위 절반 기울기 / 15°) → 15° 넘으면 '지금 쭉!'
function swBubble(ctx, x, y, txt, tone, fillK) {
  ctx.font = '700 18px "Jua", sans-serif';
  const ring = fillK != null ? 26 : 0;
  const tw = ctx.measureText(txt).width + 22 + ring, h = 34;
  const bx = clamp(x - tw / 2, 8, window.innerWidth - tw - 8);
  ctx.fillStyle = tone === 'y' ? '#ffd23f' : 'rgba(255,255,255,0.96)'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, y - h / 2, tw, h, 12) : ctx.rect(bx, y - h / 2, tw, h); ctx.fill(); ctx.stroke();
  if (ring) {
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(42,26,18,0.18)'; ctx.beginPath(); ctx.arc(bx + 20, y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#e0457b'; ctx.beginPath(); ctx.arc(bx + 20, y, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(fillK, 0, 1)); ctx.stroke();
  }
  ctx.fillStyle = '#2a1a12'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 11 + ring, y + 1);
}
// B(놓고 쓸기): 당기는 동안 '놓으면 퍼—' → 숨 동안 '퍼— 들리면 휙!'(채워지는 고리 = 위 절반 기울기 / 10°) → 위 절반이 10° 를 넘은 스텝(ctl.rec.cueT,
//   물리 값)부터 '들렸다 — 지금 휙!' → 휙 받으면 사라짐. 입술 위 '퍼—'(놓기) · '휙!'(휙 받음)
function swPop(ctx, txt, since, W, H, col, yFrac = 0.84) {
  const k = since < 120 ? since / 120 : 1 - (since - 120) / 530;
  ctx.globalAlpha = clamp(k, 0, 1);
  ctx.font = `700 ${Math.round(34 + 10 * (1 - k))}px "Jua", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.strokeStyle = '#2a1a12'; ctx.fillStyle = col;
  const ty = H * yFrac - 30 * (since / 650);
  ctx.strokeText(txt, W / 2, ty); ctx.fillText(txt, W / 2, ty);
  ctx.globalAlpha = 1; ctx.textAlign = 'start';
}
function sweepCoachDraw(ctx, dpr, now) {
  const W = window.innerWidth, H = window.innerHeight;
  const I = sweep.input;
  const side = $('#swSide');
  const yC = side && !side.hidden ? side.getBoundingClientRect().bottom + 30 : H * 0.3;
  let key = null;
  ctx.save(); ctx.scale(dpr, dpr);
  if (I && I.g && I.g.st === 'inhale' && myTurn.pressed) {
    if (sweep.nudge) { key = 'swNudge'; swBubble(ctx, W / 2, yC, t(key), 'y'); }
    else if (sweepCoachOn(now)) { key = I.gb ? 'swCoachRel' : 'swCoachFlick'; swBubble(ctx, W / 2, yC, t(key), 'w'); }
  } else if (sweep.clock && sweep.ctl) {
    const ctl = sweep.ctl;
    if (ctl.mode === 'flick') {
      // 한 획 휙(놓기 전 같은 획에서 휙)이었으면 코치 숨이 아니어도 말한다: 단서 전 '그 휙은 안 세요 — 기다려…' → 단서 뒤 '들렸다 — 다시 눌러 휙!'
      //   단서 전 말에는 '휙'을 넣지 않는다(검토: 첫 말 '퍼— 들리면 휙!'을 보자마자 휙 → 이름 3~7장)
      const again = !!(I && I.strokeFlick);
      if ((sweep.coachShot || again) && ctl.flickReq == null) {
        if (ctl.rec.cueT >= 0) { key = 'swCoachGoB'; swBubble(ctx, W / 2, yC, t(key), 'y'); }
        else { key = again ? 'swCoachStrokeB' : 'swCoachWaitB'; swBubble(ctx, W / 2, yC, t(key), 'w', sweepTiltNow() / Sweep.GB.cueTT); }
      }
    } else if (sweep.coachShot && I && !I.released) {
      const tt = sweepTiltNow();
      if (tt >= SW_COACH_TT) { key = 'swCoachGo'; swBubble(ctx, W / 2, yC, t(key), 'y'); }
      else { key = 'swCoachWait'; swBubble(ctx, W / 2, yC, t(key), 'w', tt / SW_COACH_TT); }
    }
    const since = now - sweep.openAt;
    if (since < 650) swPop(ctx, t(ctl.mode === 'flick' ? 'swPeo' : 'swPuu'), since, W, H, '#e2f6ff'); // 입술 위 '푸—'(A) · '퍼—'(B)
  }
  if (sweep.flickAt && now - sweep.flickAt < 650) swPop(ctx, t('swWhik'), now - sweep.flickAt, W, H, '#ffd23f'); // B 휙 받음
  else if (sweep.pop && now - sweep.pop.at < SW_POP_MS) swPop(ctx, t(sweep.pop.key), now - sweep.pop.at, W, H, '#ffffff', 0.7); // B '위로 휙!'(탭·작은 밀기) · '잠깐…'(판정 중)
  sweep.coachKey = key;
  ctx.restore();
}

// 옆모습 창(스펙 §5.1, 오른쪽 위 최대 210 × 120): 얼굴 옆선·입·제트·더미 단면·기울기 호. 재윤님 영상처럼 '바닥에서 입이 고개와 함께 오르며
//   바람이 더미를 아래에서 위로 쓴다'를 옆에서 그대로 보여 준다. 물리 값만 그린다(정답 표시 없음, 코치 숨에만 기울기 호에 15° 눈금)
function drawSweepSide(on) {
  const cv = $('#swSide');
  if (!cv) return;
  if (!on) { if (!cv.hidden) cv.hidden = true; return; }
  if (cv.hidden) cv.hidden = false;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 180, h = cv.clientHeight || 103;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const G = Sweep.GEO, pc = table.pileCenter(), zf = pc.z + 1;
  const M0 = { x: pc.x, y: G.ym, z: zf + G.L };
  const ctl = sweep.clock && sweep.ctl ? sweep.ctl : null;
  const aRad = ctl ? ctl.state.alpha : sweep.dispA * D2R;
  const ca = Math.cos(aRad), sa = Math.sin(aRad);
  const N = { y: M0.y + G.PY, z: M0.z + G.PZ };
  const rotH = (dy, dz) => { const vy = M0.y + dy - N.y, vz = M0.z + dz - N.z; return { y: N.y + vy * ca - vz * sa, z: N.z + vz * ca + vy * sa }; }; // 머리 위 점(입 기준 dy·dz)을 목 축 둘레로
  const o = rotH(0, 0);
  const zMin = pc.z - 1.6, zMax = M0.z + 1.1;
  const s = w / (zMax - zMin);
  const X = (z) => (z - zMin) * s, Y = (y) => h - 7 - y * s;
  // 바닥 · 분필 원 가장자리(입 쪽 r 3.2)
  c.fillStyle = 'rgba(180,140,100,0.25)'; c.fillRect(0, Y(0), w, h - Y(0));
  c.strokeStyle = 'rgba(42,26,18,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(w, Y(0)); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(pc.z + 3.2), Y(0) - 1); c.lineTo(X(pc.z + 3.2), Y(0) + 5); c.stroke();
  // 더미 단면: 딱지마다 x = 중심 평면 단면(길이 2R, 보이는 두께 VIS_H · 중심은 물리 그대로). 뒤집힘 = 금색
  const top0 = ctl ? ctl.top0 : table.columnTop();
  c.lineCap = 'butt';
  for (const d of table.liveDiscs()) {
    const p = d.body.translation(), q = d.body.rotation();
    const ny = 1 - 2 * (q.x * q.x + q.z * q.z), nz = 2 * (q.y * q.z + q.w * q.x);
    const L = Math.hypot(ny, nz) || 1, vz = -ny / L, vy = nz / L;
    c.strokeStyle = table.faceUp(d) > 0.5 ? '#f2a91e' : '#8a5a3c';
    c.globalAlpha = table.inCircle(d) ? 1 : 0.45;
    c.lineWidth = Math.max(2, VIS_H * s * 0.9); // 보이는 두께(paper.js) — 물리 중심 그대로
    c.beginPath(); c.moveTo(X(p.z - vz * DISC_R), Y(p.y - vy * DISC_R)); c.lineTo(X(p.z + vz * DISC_R), Y(p.y + vy * DISC_R)); c.stroke();
  }
  c.globalAlpha = 1;
  c.strokeStyle = 'rgba(42,26,18,0.55)'; c.setLineDash([4, 3]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(X(pc.z - 1.4), Y(top0)); c.lineTo(X(zf + 0.4), Y(top0)); c.stroke(); c.setLineDash([]);
  // 제트(숨 동안): 입 → 앞면 원뿔, 밝기 = 세기 × 봉투
  if (ctl && ctl.state.env > 0.01) {
    const S = ctl.state, a = (S.o.z - zf) / Math.max(0.2, Math.cos(S.alpha)), rj = table.T.jetR0 + a * table.T.jetSpread;
    const qq = sweep.shot?.q ?? sweep.lastQ;
    c.fillStyle = `rgba(120,200,255,${(0.18 + 0.5 * clamp(qq * S.env, 0, 1)).toFixed(3)})`;
    c.beginPath(); c.moveTo(X(S.o.z), Y(S.o.y)); c.lineTo(X(zf), Y(S.yHit + rj)); c.lineTo(X(zf), Y(S.yHit - rj)); c.closePath(); c.fill();
    c.fillStyle = '#ff8a1f'; c.strokeStyle = '#2a1a12'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(X(zf), Y(S.yHit), 3.5, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  // 얼굴 옆선(목 축 둘레로 젖힘 — 창 오른쪽 밖으로 잘림): 머리 · 코 · 눈 · 입술(= 물리 입 자리)
  const hc = rotH(1.3, 1.6);
  c.fillStyle = '#ffd8a8'; c.strokeStyle = '#2a1a12'; c.lineWidth = 2;
  c.beginPath(); c.arc(X(hc.z), Y(hc.y), 2.0 * s, 0, Math.PI * 2); c.fill(); c.stroke();
  const n1 = rotH(0.6, -0.3), n2 = rotH(0.9, -0.72), n3 = rotH(1.2, -0.32);
  c.beginPath(); c.moveTo(X(n1.z), Y(n1.y)); c.lineTo(X(n2.z), Y(n2.y)); c.lineTo(X(n3.z), Y(n3.y)); c.fill(); c.stroke();
  const ey = rotH(1.65, 0.15);
  c.fillStyle = '#2a1a12'; c.beginPath(); c.arc(X(ey.z), Y(ey.y), 2.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d4566a'; c.beginPath(); c.ellipse(X(o.z), Y(o.y), 4.5, 3, -aRad, 0, Math.PI * 2); c.fill(); c.stroke();
  // 기울기 호(왼쪽 위): 위 절반 평균 기울기 0~90°(물리 값). 코치 숨이면 눈금(A 15° '쭉' · B 10° '휙')
  const tt = sweepTiltNow(), gx = 10, gy = 46, gr = 28;
  c.lineWidth = 7; c.strokeStyle = 'rgba(42,26,18,0.15)'; c.beginPath(); c.arc(gx, gy, gr, -Math.PI / 2, 0); c.stroke();
  c.strokeStyle = '#e0457b'; c.beginPath(); c.arc(gx, gy, gr, -clamp(tt, 0, 90) * D2R, 0); c.stroke();
  const coach = ctl ? sweep.coachShot : sweepCoachOn();
  if (coach) { const k = swCoachTT() * D2R; c.strokeStyle = '#2a1a12'; c.lineWidth = 2; c.beginPath(); c.moveTo(gx + (gr - 6) * Math.cos(k), gy - (gr - 6) * Math.sin(k)); c.lineTo(gx + (gr + 6) * Math.cos(k), gy - (gr + 6) * Math.sin(k)); c.stroke(); }
  c.fillStyle = '#2a1a12'; c.font = '700 11px sans-serif'; c.textBaseline = 'alphabetic';
  c.fillText(`${t('swTilt')} ${tt > 90 ? '90°+' : Math.round(tt) + '°'}`, gx + 4, 12); // 뒤집히면 90° 를 넘는다(평균 acos, 엎어짐 180°)
}

// 프레임 비용(앱 웹뷰 40장 실기기는 안 잼): 카드 '자세히'·기록 복사에만(판 화면에 매 프레임 글자를 쓰면 그 자체가 프레임을 올린다 — 검토 1)
function sweepFrameStats() {
  const f = sweep.frameMs.slice().sort((a, b) => a - b);
  return { avg: f.length ? Math.round(f.reduce((a, b) => a + b, 0) / f.length) : 0, p95: f.length ? Math.round(f[Math.floor(f.length * 0.95)]) : 0 };
}

// 홈으로 나감·판 바꿈·다른 판 시작: 입력·숨·시계·소리·카드·표시 정리
function sweepStop() {
  sweep.input?.kill?.(); sweep.input = null;
  sweep.snd?.stop(); sweep.snd = null;
  sweep.clock = false; sweep.clockEnded = false;
  if (sweep.shot && !sweep.shot.judged) sweep.shot.resolve?.(null);
  sweep.shot = null; sweep.ctl = null; sweep.dispA = 0; sweep.nudge = false; sweep.openAt = 0; sweep.flickAt = 0; sweep.coachKey = null;
  sweep.card?.resolve?.(null);
  if (sweep.ribbon) sweep.ribbon.visible = false;
  if (sweep.mark) sweep.mark.visible = false;
  $('#sweepCard').hidden = true; $('#swBadge').hidden = true; $('#sweepSheet').hidden = true; $('#swSide').hidden = true;
}

// ⚙ 맨 위 칸: 조작 깃발 + 쓸기 연습판(스위치를 켰을 때만). 완료를 눌러야 저장(다른 손맛 값과 같음) — 연습판 단추는 저장하고 바로 시작
function coreSection() {
  const wrap = document.createElement('div');
  wrap.className = 'exp core';
  const render = () => {
    const on = feel.core >= 0.5, gbOn = sweepGB();
    wrap.innerHTML = `<h3>${t('coreTitle')}</h3>`
      + `<div class="exp-btns"><button type="button" class="exp-sw${on ? ' on' : ''}" id="core-sw" aria-pressed="${on}">${t('coreSw')} <b>${on ? t('expOn') : t('expOff')}</b></button>`
      + `<button type="button" class="exp-sw" id="core-p40"${on ? '' : ' disabled'}>${t('coreP40')}</button><button type="button" class="exp-sw" id="core-p30"${on ? '' : ' disabled'}>${t('coreP30')}</button></div>`
      // 쓸기 문법(연습판): B '놓고 쓸기'(기본) · A '누른 채 쓸기(옛)' — 비교용
      + `<div class="exp-btns"><button type="button" class="exp-sw${gbOn ? ' on' : ''}" id="core-gb" aria-pressed="${gbOn}"${on ? '' : ' disabled'}>${t('coreGB')}</button>`
      + `<button type="button" class="exp-sw${gbOn ? '' : ' on'}" id="core-ga" aria-pressed="${!gbOn}"${on ? '' : ' disabled'}>${t('coreGA')}</button></div>`
      + `<p class="exp-how">${t('coreNote')} ${t('coreGNote')}</p>`;
    wrap.querySelector('#core-sw').addEventListener('click', () => { sfx.pop(); feel.core = feel.core >= 0.5 ? 0 : 1; $('#sweepBtn').hidden = feel.core < 0.5; render(); });
    for (const [id, v] of [['core-gb', 0], ['core-ga', 1]]) wrap.querySelector('#' + id).addEventListener('click', () => { if (feel.core < 0.5) return; sfx.pop(); feel.swg = v; render(); });
    for (const n of [40, 30]) wrap.querySelector('#core-p' + n).addEventListener('click', () => { if (feel.core < 0.5) return; sfx.pop(); closeTune(false); goHome(); startPractice(n, 0); });
  };
  render();
  return wrap;
}

// ── 부트 ───────────────────────────────────────────────
function wireUI() {
  $('#playBtn').addEventListener('click', () => { sfx.unlock(); openMap(); });
  // 자유 대전: 친선/따먹기·판 크기는 이 시트 안에서만 고른다(홈 첫 화면의 '시작 레벨' 옆에 두면 레벨에도 딱지를 거는 것처럼 읽힌다 — GDD §9.9 P0-5)
  // 첫 판(연습 판)은 친선·5장 고정이라 고를 것이 없다 → 바로 시작
  $('#freeBtn').addEventListener('click', () => {
    sfx.unlock(); sfx.pop();
    if (profile.stats.matches === 0) { startMatch(); return; }
    refreshTexts();
    $('#freeSheet').hidden = false;
  });
  $('#freeGo').addEventListener('click', () => { sfx.pop(); $('#freeSheet').hidden = true; startMatch(); });
  $('#freeClose').addEventListener('click', () => { sfx.pop(); $('#freeSheet').hidden = true; });
  $('#mapBack').addEventListener('click', () => { sfx.pop(); goHome(); });
  $('#liClose').addEventListener('click', () => { $('#lvIntro').hidden = true; });
  $('#albumBtn').addEventListener('click', openAlbum);
  $('#sheetBtn').addEventListener('click', openSheet);
  $('#tuneBtn').addEventListener('click', openTune);
  $('#dailyBtn').addEventListener('click', startDaily);
  // 쓸기 연습(조작 깃발 켬일 때만 보임): 30/40장 고르는 작은 시트(자유 대전 시트 본보기)
  $('#sweepBtn').addEventListener('click', () => { sfx.unlock(); sfx.pop(); refreshTexts(); $('#sweepSheet').hidden = false; });
  $('#swP30').addEventListener('click', () => { sfx.pop(); $('#sweepSheet').hidden = true; startPractice(30, 0); });
  $('#swP40').addEventListener('click', () => { sfx.pop(); $('#sweepSheet').hidden = true; startPractice(40, 0); });
  $('#swClose').addEventListener('click', () => { sfx.pop(); $('#sweepSheet').hidden = true; });
  $('#dailyAgain').addEventListener('click', () => { $('#dailyCard').hidden = true; clearMatchMeshes(); startDaily(); });
  $('#dailyHome').addEventListener('click', () => { $('#dailyCard').hidden = true; goHome(); });
  $('#dailyCopy').addEventListener('click', async () => {
    const ta = $('#dailyShare');
    try { await navigator.clipboard.writeText(ta.value); toast(t('copied')); }
    catch (e) { ta.focus(); ta.select(); toast(t('copyManual')); }
  });
  $('#tuneClose').addEventListener('click', () => { sfx.pop(); closeTune(false); toast(tuneSummary()); });
  $('#tuneReset').addEventListener('click', () => { sfx.pop(); closeTune(true); });
  $('#sheetDone').addEventListener('click', () => { sfx.pop(); goHome(); });
  $('#albumBack').addEventListener('click', () => { sfx.pop(); goHome(); });
  document.querySelectorAll('#albumTabs button').forEach((b) => b.addEventListener('click', () => { sfx.pop(); if (b.dataset.tab === 'preview') openPreview(); else openAlbum(); }));
  $('#againBtn').addEventListener('click', () => { sfx.pop(); maybeOfferMic(() => { clearMatchMeshes(); startMatch(); }); });
  $('#homeBtn').addEventListener('click', () => { sfx.pop(); goHome(); });
  // 9차: 입술 높이 레일(탭 = 칸 고르기, 레일 몸통 탭 = 바꾸기) · 키보드 ↑↓ · 물안경 칩
  $('#lipRail').addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const b = e.target.closest('[data-pose]');
    setPose(b ? b.dataset.pose : pose === 'eye' ? 'low' : 'eye');
  });
  window.addEventListener('keydown', (e) => {
    if ($('#lipRail').hidden) return;
    if (e.key === 'ArrowDown') setPose('low'); else if (e.key === 'ArrowUp') setPose('eye');
  });
  $('#goggles').addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (gogglesOn) { gogglesOn = false; return; } // 놓기 전 다시 탭 = 안 씀
    if ((profile.items.goggles || 0) <= 0) { toast(t('goggleEmpty')); return; }
    gogglesOn = true; toast(t('goggleUsed')); sfx.tone(784, 0.06, 'triangle', 0.05);
  });
  $('#quitBtn').addEventListener('click', () => {
    if (match?.net && !match.net.ended) { // PvP: 두 번 눌러야 기권(실수 방지)
      const nowT = performance.now();
      if (!(nowT - (match.net.quitArm || -1e9) < 2500)) { match.net.quitArm = nowT; toast(t('pvpResign1')); return; }
      netResign().finally(() => goHome());
      return;
    }
    const wasLevel = match && match.level; simOn = false; table = null; goHome(); if (wasLevel) openMap();
  });
  // PvP 로비 (두 탭: ?pvplocal)
  $('#pvpBtn').addEventListener('click', openPvpLobby);
  $('#pvpClose').addEventListener('click', closePvpLobby);
  // 개발 토글: 로비 제목 5번 탭(2.5초 안) = 같은 계정끼리 대결 허용 켜기/끄기(이 브라우저만). 계정 하나로 두 탭 시험할 때
  let devTaps = [];
  $('#pvpLobby h2').addEventListener('click', () => {
    const nowT = performance.now();
    devTaps = devTaps.filter((x) => nowT - x < 2500).concat(nowT);
    if (devTaps.length < 5) return;
    devTaps = [];
    const on = !devSame();
    try { localStorage.setItem('pvp-dev-same', on ? '1' : '0'); } catch (e) { /* 저장 안 됨 */ }
    toast(fmt(t('pvpDevSame'), { on: on ? 'ON' : 'OFF' }));
  });
  $('#pvpCreate').addEventListener('click', () => pvpCreate());
  $('#pvpJoin').addEventListener('click', () => pvpJoin());
  $('#pvpCodeIn').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') pvpJoin(); });
  document.querySelectorAll('#pvpChips button').forEach((b) => b.addEventListener('click', () => { sfx.pop(); lobby.n = +b.dataset.n; refreshPvpChips(); }));
  $('#langBtn').addEventListener('click', () => {
    setLang(getLang() === 'ko' ? 'en' : 'ko');
    profile.settings.lang = getLang();
    Store.save(profile);
    refreshTexts();
  });
  $('#sndBtn').addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    sfx.unlock(); // 앱: 바뀐 소리 켬/끔으로 세션을 다시 건다(끔 = 'auto' — 소리를 안 내면서 다른 앱 음악을 끊지 않게)
    profile.settings.sound = !sfx.muted;
    Store.save(profile);
    refreshTexts();
  });
  $('#micBtn').addEventListener('click', toggleMic);
  document.querySelectorAll('#chips button').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); sfx.pop(); stakeN = +b.dataset.n; refreshTexts(); }));
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); sfx.pop(); mode = b.dataset.m; profile.settings.mode = mode; Store.save(profile); refreshTexts(); }));
  window.addEventListener('resize', layout);
  // 소리 만들기·깨우기는 사용자 활성화 사건(pointerup·touchend·click·keydown) 안에서만: 없으면 만들고, 멈춰 있으면(suspended·interrupted —
  // 전화·시리·알람·다른 앱 소리 뒤) resume + 1샘플 무음. 두 번에도 안 깨면 다음 활성화에서 닫고 새로(audio.js kick). 터치 pointerdown 은 활성화가 아니라 뺐다
  const wakeSound = (ev) => sfx.kick(ev);
  for (const k of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(k, wakeSound, { capture: true, passive: true });
}

// 마이크 불기 켜기/끄기(홈 마이크 단추 · ⚙ 소리·진동 시험)
async function toggleMic() {
  if (micEnabled) { micEnabled = false; mic.stop(); sfx.unlock(); refreshTexts(); return; }
  AppAudio.setMic(true); // 앱: 세션을 먼저 'auto' 로 → 이어서 소리를 깨울 때 'playback' 을 한 번 거쳤다가 바뀌지 않게
  sfx.unlock();
  const ok = await mic.start();
  micEnabled = ok;
  if (!ok) toast(t('micFail'));
  refreshTexts();
}

async function boot() {
  try { await bootInner(); } catch (e) {
    $('#bootMsg').textContent = 'Boot error: ' + (e && e.message ? e.message : e) + ' / 부팅 오류';
    throw e;
  }
}

async function bootInner() {
  try {
    await Promise.race([document.fonts?.ready, wait(2500)]);
    await Promise.all(['900 40px "Lilita One"', '40px "Black Han Sans"', '40px "Jua"'].map((f) => document.fonts?.load(f).catch(() => null)));
  } catch (e) { /* 폰트 없이도 진행 */ }
  try {
    await initPhysics();
  } catch (e) {
    $('#bootMsg').textContent = 'Physics engine failed to load here (WebAssembly blocked). Open dist/puff.html locally. / 이 환경에선 물리엔진(WASM)이 막혀 있어요. 로컬 파일로 열어주세요.';
    return;
  }
  buildScene();
  wireUI();
  goHome();
  window.__puffBooted = true;
  netReady.then((n) => { if (!n) return; NET = n; window.__pvpNet = n.kind; netBoot(); }); // PvP 버튼 + 진행 중이던 대결로 돌아가기(새로고침·재접속). null 이면 아무것도 안 함
  const lvHash = /#lv(\d+)/.exec(location.hash || '');
  if (lvHash) setTimeout(() => openLevelIntro(Math.max(1, +lvHash[1])), 400); // 테스트용: 주소 끝 #lv18
  // 쓸기 연습판 바로가기: #p30 · #p40 (· #p30s3 = 그 장수의 넷째 시드). 주소로 들어오면 조작 깃발 저장값과 상관없이 그 판은 쓸기
  const pHash = /#p(30|40)(?:s(\d+))?(?![\d])/.exec(location.hash || '');
  if (pHash) setTimeout(() => startPractice(+pHash[1], pHash[2] ? +pHash[2] : 0), 400);
  requestAnimationFrame((t0) => { lastT = t0; frame(t0); });
  // 자동 테스트용 훅: 더미의 화면 좌표(꼭대기·바닥)와 상태
  window.__puff = () => {
    if (!table) return { state };
    const c = table.pileCenter();
    const top = table.columnTop();
    const toScreen = (y) => { const v = new THREE.Vector3(c.x, y, c.z).project(camera); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }; };
    const tc = new THREE.Vector3(camera.position.x - c.x, 0, camera.position.z - c.z).normalize(); // 더미 → 카메라
    const fr = (y) => { const v = new THREE.Vector3(c.x + tc.x * DISC_R, y, c.z + tc.z * DISC_R).project(camera); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }; };
    const rv = reticle?.visible ? reticle.position.clone().project(camera) : null;
    const ret = rv ? { x: (rv.x * 0.5 + 0.5) * window.innerWidth, y: (-rv.y * 0.5 + 0.5) * window.innerHeight } : null; // 표적 화면 좌표(터치 일치 검사용)
    return { state, puffP: puffer.p, live: table.liveDiscs().length, me: piles.me.length, ai: piles.ai.length, top: toScreen(top), bottom: toScreen(0), frontTop: fr(top), frontBottom: fr(0), vtop: fr(paper.visY(top, c)), reticle: ret, turn: match?.turn, level: match?.level?.n, puffsLeft: match?.puffsLeft, flipped: match?.flipped };
  };
}

// 앱(Flutter) 수명주기 다리: 뒤로 가면 마이크·소리를 멈추고, 돌아오면 사용자가 켜 둔 마이크만 다시 켠다(코덱스 리뷰 — 백그라운드 녹음 금지)
let micResume = false;
window.__puffLifecycle = {
  pause() {
    if (micEnabled && mic.ready) { mic.stop(); micResume = true; }
    try { sfx.pause(); } catch (e) { /* 소리 없음 */ }
  },
  async resume() {
    if (micResume) AppAudio.setMic(true); // 앱: 마이크를 다시 켤 거면 세션부터 'auto'(playback → ambient → playAndRecord 로 세 번 바뀌며 소리가 툭 끊기지 않게)
    try { sfx.unlock('lifecycle'); } catch (e) { /* 소리 없음 */ } // 멈춤·끊김(interrupted)을 깨우고 앱 소리 세션을 다시 건다. 안 깨면 다음 터치 두 번 뒤 새로 만든다(audio.js)
    if (micResume) { micResume = false; const ok = await mic.start(); micEnabled = ok; if (!ok) toast(t('micFail')); }
  },
};

// 앱 '뒤로' 다리(안드로이드 뒤로 버튼): 맨 위에 열린 창의 닫기·돌아가기 버튼을 누른 것처럼 한다.
// 처리했으면 true. 홈 화면에서만 false → 앱이 닫힌다(판 도중에 눌러 앱이 꺼지는 사고 방지)
const BACK_ORDER = [['#tune', '#tuneClose'], ['#micOffer', '#micNo'], ['#freeSheet', '#freeClose'], ['#sweepSheet', '#swClose'], ['#sweepCard', '#swHome'], ['#pvpLobby', '#pvpClose'], ['#dailyCard', '#dailyHome'],
  ['#lvIntro', '#liClose'], ['#lvResult', '#lrMap'], ['#album', '#albumBack'], ['#map', '#mapBack'], ['#result', '#homeBtn'], ['#hud', '#quitBtn']];
window.__puffBack = () => {
  for (const [box, btn] of BACK_ORDER) {
    const b = $(box), k = $(btn);
    if (b && !b.hidden && k && !k.hidden && !k.disabled) { k.click(); return true; }
  }
  return state !== 'home'; // 펼치기·부팅 중에는 삼킨다
};
boot();
