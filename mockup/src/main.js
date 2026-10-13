// main.js — PUFF! 딱지 목업 v0.1
//
// 🧭 가설 (목업이 검증하려는 것)
//  H1. 재미의 핵심 = "후~ 불어서 퍽! → 우수수 뒤집히며 그림이 드러나는 순간". 이 순간을 슬로모·상승음·글자로 과장한다.
//  H2. 조작 = 딱지 더미를 누르고(조준) → 아래로 당겼다(숨 들이쉬기=파워) → 놓기(퍽!). 설명 없이 앵그리버드 새총처럼.
//  H3. 내 딱지를 걸면 긴장, 상대 딱지(특히 내가 없는 레어)를 따면 수집 욕구가 돈다.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { initPhysics, Table, DISC_R, DISC_H, mulberry32 } from './sim.js';
import { CARDS, CARD_BY_ID, RARITY, drawFace, drawBack, drawEdge, drawTape, rollCard } from './art.js';
import { Sfx } from './audio.js';
import { Mic } from './mic.js';
import { t, setLang, getLang, cardName } from './i18n.js';
import * as Store from './store.js';
import { Fx } from './fx.js';
import * as Rules from './rules.js';
import { levelSpec, starsFor, chapterOf, CHAPTERS, RIVALS, CHAPTER_LEN } from './levels.js';
import { SERIES_A, drawCreature } from './creatures.js';
import { drawBlowFace, drawPouchRing } from './face.js';
import * as Cues from './cues.js';

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
const TUNE_DEFAULTS = { pull: 0.42, wind: 1, slow: 0.3, aiSkill: 1, overShake: 1, guide: 0, strainMs: Rules.STRAIN_MS, cues: 1, fpv: 1, beat: 1 };
const TUNE_RANGE = { pull: [0.25, 0.7, 0.01], wind: [0.6, 1.6, 0.05], slow: [0.12, 1, 0.02], aiSkill: [0.3, 2, 0.05], overShake: [0, 2, 0.1], guide: [0, 1, 1], strainMs: [800, 2400, 50], cues: [0, 1, 1], fpv: [0, 1, 1], beat: [0, 2, 1] };
// 9차: 콩닥 숨 1(차분)을 기본으로(재윤님 '1 차분이 지금보다 괜찮다') — 저장된 튜닝값도 한 번 옮긴다
if ((profile.settings.feelV || 0) < 9) { profile.settings.feel = { ...(profile.settings.feel || {}), beat: 1 }; profile.settings.feelV = 9; Store.save(profile); }
const feel = { ...TUNE_DEFAULTS, ...(profile.settings.feel || {}) };
// 9차 물안경(재윤님: '초록 가이드는 아이템을 쓰면 보이게'): 이번 숨에 초록 구간이 보이는 아이템. 평생 첫 3숨은 무료(튜토리얼)
profile.items = Object.assign({ goggles: 3 }, profile.items || {});
let gogglesOn = false;
const GOGGLE_FREE_PUFFS = 3, GOGGLE_MAX = 9;
// 체험(할머니가 빌려준 물안경): 레벨이면 L1~2, 자유 대전이면 평생 첫 3숨 (아이템·PvP 기획서 1.5)
function goggleTrial() { return match?.level ? match.level.n <= 2 : (profile.tutorialPuffs || 0) < GOGGLE_FREE_PUFFS; }
function gogglesActive() { return gogglesOn || goggleTrial() || feel.guide >= 0.5; }
// 9차 입술 높이: 'eye' 눈높이(지금 입) | 'low' 책상에 턱. 판마다 눈높이로 시작, 저장 안 함
let pose = 'eye', poseK = 0;
const POSE_UNLOCK_PUFFS = 9;
if (profile.settings.lang) setLang(profile.settings.lang);
else setLang(getLang());
const sfx = new Sfx();
sfx.muted = !profile.settings.sound;
const mic = new Mic();
let micEnabled = false;

let renderer, scene, camera, fx;
let table = null; // 물리 테이블 (매치 중)
const meshes = new Map(); // disc.id → mesh
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
let mode = 'keeps'; // 'keeps' = 따먹기(딴 만큼 내 것) / 'fun' = 친선(끝나면 돌려받음)
let match = null;
let runId = 0; // 매치 세대 번호: 중간에 홈으로 나가면 이전 매치의 비동기 흐름·입력을 끊는다
let cancelInput = null;
let aimCtl = null; // 플레이어 조준 컨트롤러
const piles = { me: [], ai: [] };

// ── 텍스처 ──────────────────────────────────────────────
const texCache = new Map();
const imgCache = new Map();
let backTex, backTapeTex;
const edgeTex = {};

function faceTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  drawFace(cv.getContext('2d'), 512, CARD_BY_ID[id]);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  texCache.set(id, tx);
  return tx;
}

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

function makeShared() {
  const bc = document.createElement('canvas');
  bc.width = bc.height = 512;
  drawBack(bc.getContext('2d'), 512);
  backTex = new THREE.CanvasTexture(bc);
  backTex.colorSpace = THREE.SRGBColorSpace;
  const tc = document.createElement('canvas');
  tc.width = tc.height = 512;
  drawBack(tc.getContext('2d'), 512);
  drawTape(tc.getContext('2d'), 512);
  backTapeTex = new THREE.CanvasTexture(tc);
  backTapeTex.colorSpace = THREE.SRGBColorSpace;
  for (const [rar, info] of [...Object.entries(RARITY), ['tape', { side: '#c9d3dc' }], ['golden', { side: '#ffcf33' }]]) {
    const ec = document.createElement('canvas');
    ec.width = 256; ec.height = 32;
    drawEdge(ec.getContext('2d'), 256, 32, info.side);
    const tx = new THREE.CanvasTexture(ec);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = THREE.RepeatWrapping;
    tx.repeat.set(6, 1);
    edgeTex[rar] = tx;
  }
}

const discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 56, 1);
const matCache = new Map();
function discMaterials(id, heavy = false) {
  const key = id + (heavy ? ':h' : '');
  if (matCache.has(key)) return matCache.get(key);
  const c = CARD_BY_ID[id];
  if (id === 'golden') {
    // 황금 딱지: 옆면이 금빛으로 번쩍 → 더미 속 위치가 보인다(어디를 노릴지)
    const mats = [
      new THREE.MeshStandardMaterial({ map: edgeTex.golden, color: 0xffd34d, roughness: 0.25, metalness: 0.85, emissive: 0x3a2500, envMapIntensity: 1.2 }),
      new THREE.MeshPhysicalMaterial({ map: faceTexture(id), roughness: 0.25, metalness: 0.4, clearcoat: 0.8 }),
      new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6, color: 0xffe9a0, envMapIntensity: 0.6 }),
    ];
    matCache.set(key, mats);
    return mats;
  }
  const fancy = c.rarity === 'epic' || c.rarity === 'legendary';
  const top = fancy
    ? new THREE.MeshPhysicalMaterial({ map: faceTexture(id), roughness: 0.35, metalness: 0.1, iridescence: 0.9, iridescenceIOR: 1.6, clearcoat: 0.6, clearcoatRoughness: 0.25 })
    : new THREE.MeshStandardMaterial({ map: faceTexture(id), roughness: 0.5, metalness: 0, envMapIntensity: 0.35 });
  const side = heavy
    ? new THREE.MeshStandardMaterial({ map: edgeTex.tape, roughness: 0.35, metalness: 0.3, envMapIntensity: 0.8 })
    : new THREE.MeshStandardMaterial({ map: edgeTex[c.rarity], roughness: c.rarity === 'legendary' ? 0.3 : 0.8, metalness: c.rarity === 'legendary' ? 0.5 : 0, envMapIntensity: c.rarity === 'legendary' ? 1 : 0.3 });
  const bottom = new THREE.MeshStandardMaterial({ map: heavy ? backTapeTex : backTex, roughness: 0.7, envMapIntensity: 0.3 });
  const mats = [side, top, bottom];
  matCache.set(key, mats);
  return mats;
}

function makeDiscMesh(id, heavy = false) {
  const m = new THREE.Mesh(discGeo, discMaterials(id, heavy));
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.cardId = id;
  return m;
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
  makeShared();
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
  const kind = Cues.classifyShot({ n: sn.n, k: sn.k, ratio: sn.ratio, lat: sn.lat, flips: flipped.length, outs: outs.length, type: sn.type, pocketLatSign: sn.pls, pocketOk });
  const c = profile.cue;
  if (kind && kind === c.prev) { c.relapse[kind] = 2; c.prev = null; } else c.prev = kind;
  Store.save(profile);
  // 영수증은 높이·숨 단계가 낮을 때, 또는 꽝·원 밖 2장↑일 때, 또는 규칙이 다시 켜졌을 때만
  const show = sn.stH <= 1 || sn.stB <= 1 || flipped.length === 0 || outs.length >= 2 || (kind && c.relapse[kind] > 0);
  cue.receipt = show ? { ...sn, fl, ou, kind, t0: performance.now() } : null;
  window.__puffReceipt = cue.receipt ? { kind, flips: flipped.length, outs: outs.length, k: sn.k } : null; // 테스트용
  trailEnd(pocketOk);
}
// 더미 영수증 '방금 숨' (6차: 재윤님 "빨간 막대가 무슨 뜻인지 모르겠다 — 내가 불었다는 건가?" → 더 친절하게)
// 쏘기 전 더미를 딱지 모양으로 그리고 범례(내 것·원 밖 무효·그대로) + '여기 불었음' 바람 화살표 + 숨 컵('딱 좋음' 눈금) + 한 줄 조언
function receiptTip(R) {
  const flips = R.fl.size, outs = R.ou.size;
  if (R.type === 'goldenSide' && R.kind === 'side') return t('rcpSideStar');
  if (R.kind === 'breath') return R.ratio < Rules.GREEN_LO ? t('rcpWeak') : t('rcpStrong');
  if (R.pose === 'low' && R.k <= 1 && flips < Math.max(1, R.n * 0.5)) return t('rcpLowTop'); // 책상 입으로 맨 위: 약함
  if (R.kind === 'height' && R.pose !== 'low') {
    const low = !(R.win && R.k < R.win[0]);
    if (low && poseUnlocked() && R.n >= 8 && (profile.settings.useLowTips || 0) < 3) { profile.settings.useLowTips = (profile.settings.useLowTips || 0) + 1; Store.save(profile); return t('rcpUseLow'); }
    return low ? t('rcpLow') : t('rcpHigh');
  }
  if (R.kind === 'side') return t('rcpSide');
  if (flips >= Math.max(1, R.n * 0.5) && outs < 2) return t('rcpGood');
  if (outs >= 2) return t('rcpStrong');
  if (!R.win) { // '위에서 3번째' 규칙이 없는 판(황금·작은 더미)
    if (R.type === 'goldenSide') return t('rcpSideStar');
    if (R.type === 'golden') return t('rcpGold');
    return t('rcpLuck');
  }
  return flips ? t('rcpOk') : t('rcpLuck');
}
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
  const tip = receiptTip(R);
  wrapText(ctx, tip, x0 + 10, ly + 38, cardW - 20, 16);
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
  if (mode === 'blow') fill = (puffer.fill || 0) * Math.max(0, 1 - tm / 0.22); // 불면 볼이 푹 꺼짐
  if (mode === 'cough') fill = 0.3 * Math.max(0, 1 - tm / 0.3);
  const strain = mode === 'charge' ? puffer.strain || 0 : 0;
  const full = mode === 'charge' && puffer.full;
  const v = 0.18 + 0.82 * Math.min(1, fill); // 볼이 시야에 들어온 정도 (기다릴 때도 살짝 보여 '내 얼굴' 기준을 만든다)
  const shake = (full ? 1.5 : 0) + strain * 4 + (mode === 'cough' ? 9 * Math.max(0, 1 - tm / 0.5) : 0);
  const sx = Math.sin(now * 0.07) * shake, sy = Math.cos(now * 0.09) * shake * 0.6;
  ctx.save(); ctx.scale(dpr, dpr); ctx.translate(sx, sy);
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
  const open = mode === 'blow' ? Math.min(1, tm / 0.05) * Math.max(0, 1 - tm / 0.5) : 0;
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
  const showRail = mine && !myTurn.pressed && fpvOn() && poseUnlocked();
  if (rail.hidden === showRail) rail.hidden = !showRail;
  const small = liveCount() < Rules.LOW_POSE_MIN_N;
  if (pose === 'low' && small && mine) setPose('eye', true); // 작은 더미: 보이게 눈높이로 되돌림
  rail.classList.toggle('low', pose === 'low');
  rail.classList.toggle('off', small);
  const free = goggleTrial() || feel.guide >= 0.5;
  const showG = mine && !myTurn.pressed && !free; // 누르기 전에만 (기획서 1.7)
  if (gg.hidden === showG) gg.hidden = !showG;
  if (showG) {
    gg.classList.toggle('on', gogglesOn);
    gg.classList.toggle('empty', (profile.items.goggles || 0) <= 0 && !gogglesOn);
    gg.classList.toggle('nudge', !gogglesOn && (profile.cue.relapse.breath || 0) > 0 && (profile.items.goggles || 0) > 0); // 같은 숨 실수 2연속 → '물안경 쓸래?'
    const nTxt = String(profile.items.goggles || 0);
    if ($('#gogglesN').textContent !== nTxt) $('#gogglesN').textContent = nTxt;
  }
}
// 물안경을 쓴 숨: 1인칭 화면 가장자리에 둥근 렌즈 테 두 개 + 옅은 하늘색
function drawGoggleRims() {
  if (!(state === 'match' && myTurn.on && fpvOn() && puffer.who === 'me' && (gogglesOn || goggleTrial()))) return;
  const cv = $('#breath'), ctx = cv.getContext('2d'), dpr = cv._dpr || 1;
  const W = cv.width / dpr, H = cv.height / dpr, r = Math.max(W, H) * 0.62;
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(120,210,255,0.07)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(40,120,200,0.55)'; ctx.lineWidth = 14;
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W / 2 + sx * W * 0.27, H * 0.45, r * 0.62, r * 0.78, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
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
  const { c, top, h, ys } = st;
  const pulling = st.p >= 0.05;
  // 소매(뚜껑): 조준 딱지 아래 경계 ~ 꼭대기
  const y0 = Math.max(0, h - DISC_H / 2);
  cue.sleeve.visible = true;
  cue.sleeve.position.set(c.x, (y0 + top) / 2, c.z);
  cue.sleeve.scale.set(1, Math.max(0.02, top - y0), 1);
  cue.sleeve.material.opacity = pulling ? 0.05 : 0.16;
  // 금 띠: 위에서 2~4장째
  const showBand = !pulling && st.win && cueStage('height') === 0 && pose !== 'low';
  for (const m of Object.values(cue.band)) m.visible = !!showBand;
  if (showBand) {
    const yTop = ys[st.win[0] - 1] + DISC_H / 2, yBot = ys[Math.min(ys.length, st.win[1]) - 1] - DISC_H / 2;
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
  if (breath.mode !== 'blow') {
    breath.aim = g.aim.clone();
    breath.p = (shot.power || 0) / Rules.POUCH_FULL; // 절대값(주머니 비율). 정답 대비로 그리면 숨겨진 정답 게이지가 된다
    if (breath.mode !== 'charge') { breath.mode = 'charge'; breath.t = 0; }
  }
  reticle.visible = layerRing.visible = aimLine.visible = true;
  reticle.position.copy(g.aim).addScaledVector(g.dir, -0.02);
  reticle.lookAt(g.aim.clone().add(g.normal)); // 표적 고리가 원기둥 곡면에 붙어 보이게 (옆을 노리면 비스듬히 누움)
  reticle.material.color.setHex(color);
  // 지난 숨 고스트: 직전 조준 자리 (내 차례일 때만)
  if (lastBreath.aim && puffer.who === 'me' && breath.mode === 'charge') {
    ghostRing.visible = true;
    ghostRing.position.copy(lastBreath.aim).addScaledVector(g.dir, -0.03);
    ghostRing.lookAt(lastBreath.aim.clone().add(lastBreath.normal || g.normal));
  }
  const s = 0.8 + (shot.power || 0) * 0.6;
  reticle.scale.setScalar(s);
  layerRing.position.set(g.center.x, shot.h, g.center.z);
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
const breath = { mode: 'off', p: 0, t: 0, who: 'me', aim: null, ratio: 1 };
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
  const v = breath.aim.clone().project(camera);
  const ax = (v.x * 0.5 + 0.5) * W, ay = (-v.y * 0.5 + 0.5) * H;
  const p = clamp(breath.p, 0, 1.3);
  const dx = ax - mx, dy = ay - my, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const w0 = (4 + p * 8) * dpr, w1 = (12 + p * 34) * dpr;
  let alpha;
  if (breath.mode === 'charge') alpha = 0.08 + 0.2 * Math.min(1, p);
  else {
    const k = breath.t / 0.55;
    if (k >= 1) { breath.mode = 'off'; return; }
    alpha = 0.6 * (1 - k);
  }
  const grad = ctx.createLinearGradient(mx, my, ax, ay);
  const sr = breath.mode === 'charge' ? breath.strain || 0 : 0; // 버팀: 숨 줄기가 붉어짐
  grad.addColorStop(0, `rgba(255,${Math.round(255 - 130 * sr)},${Math.round(255 - 130 * sr)},${alpha})`);
  grad.addColorStop(1, `rgba(215,243,255,${alpha * 0.55})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(mx + nx * w0, my + ny * w0); ctx.lineTo(ax + nx * w1, ay + ny * w1);
  ctx.lineTo(ax - nx * w1, ay - ny * w1); ctx.lineTo(mx - nx * w0, my - ny * w0);
  ctx.closePath(); ctx.fill();
  const blow = breath.mode === 'blow';
  const N = blow ? 26 : 16;
  ctx.lineCap = 'round';
  // 실패 서명(글자 없이 원인 보이기): 숨 부족 = 닿기 전에 흐려지며 위로 흩어짐 / 과호흡 = 지그재그로 흔들림
  const weak = blow && breath.ratio < 0.75;
  const reach = weak ? 0.45 + 0.55 * (breath.ratio / 0.75) : 1;
  const zig = blow && breath.ratio > 1.1 ? Math.min(1, (breath.ratio - 1.1) * 4) : 0;
  for (let i = 0; i < N; i++) {
    let u = blow ? Math.min(reach, breath.t * 3 + (i / N) * 0.55) : 1 - ((breath.t * (0.5 + p * 0.6) + i / N) % 1);
    const off = Math.sin(i * 12.9898) * 0.85 + zig * Math.sin(u * 18 + breath.t * 40) * 1.4;
    const wl = w0 + (w1 - w0) * u;
    let x = mx + dx * u + nx * off * wl, y = my + dy * u + ny * off * wl;
    if (weak && u >= reach - 0.02) y -= (breath.t * 3 + (i / N) * 0.55 - reach) * 120 * dpr; // 힘이 빠져 위로 흩어짐
    const len = (blow ? 30 : 9) * dpr * (0.5 + p);
    const sgn = blow ? 1 : -1;
    ctx.strokeStyle = `rgba(255,255,255,${blow ? 0.95 * (1 - breath.t / 0.55) : 0.55})`;
    ctx.lineWidth = (blow ? 3.2 : 2) * dpr;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (dx / L) * len * sgn, y - (dy / L) * len * sgn); ctx.stroke();
  }
  if (blow && breath.t < 0.3) {
    // 조준점에 '퍽' 방사선
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - breath.t / 0.3)})`;
    ctx.lineWidth = 3 * dpr;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r0 = (10 + breath.t * 160) * dpr, r1 = r0 + 14 * dpr;
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
  ring.position.y = DISC_H / 2 + 0.01;
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
  for (const d of table.liveDiscs()) {
    const m = meshes.get(d.id);
    if (!m || m.userData.anim) continue;
    const p = d.body.translation();
    const q = d.body.rotation();
    m.position.set(p.x, p.y, p.z);
    m.quaternion.set(q.x, q.y, q.z, q.w);
  }
}

const simWatch = { revealed: new Set(), count: 0, lastClack: 0, vy: new Map(), resolve: null, simTime: 0, quiet: 0, glowed: new Set(), outShown: new Set(), outs: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (now < hitStopUntil) dt = 0;
  // 슬로모
  const targetScale = now < slowUntil ? feel.slow : 1;
  timeScale = lerp(timeScale, targetScale, targetScale < timeScale ? 0.5 : 0.08);
  $('#vignette').style.opacity = String(clamp((1 - timeScale) * 1.3, 0, 0.85));

  if (simOn && table && dt > 0) {
    acc += dt * timeScale;
    let n = 0;
    while (acc >= table.T.dt && n < 8) {
      table.step();
      acc -= table.T.dt;
      simWatch.simTime += table.T.dt;
      n++;
    }
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
  // 트윈
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.update(k);
    if (k >= 1) { tweens.splice(i, 1); tw.done(); }
  }
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
    if (fpvOn()) {
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
  drawTapGuide(now);
  drawLipLine();
  drawGoggleRims();
  updateRail();
  drawPocketHint(now);
  updateCues(now);
  drawReceipt(now);
  $('#puffWrap').classList.toggle('fpvhide', fpvOn() && puffer.who === 'me'); // 1인칭 모드: 내 정면 얼굴은 안 보임(상대 차례엔 상대 얼굴)
  frame._last = now;
  renderer.render(scene, camera);
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
      sfx.flip(simWatch.count - 1);
      const p = d.body.translation();
      const c = CARD_BY_ID[d.cardId];
      fx.emit({ at: { x: p.x, y: p.y + 0.1, z: p.z }, n: 14 + (c.rarity !== 'common' ? 16 : 0), color: new THREE.Color(RARITY[c.rarity].ring[1]).getHex(), speed: 2.5, up: 3, life: 0.7, size: 0.22 });
      fx.text(new THREE.Vector3(p.x, p.y + 0.6, p.z), '+1', 'plus');
      ownerGlow(d, simWatch.shooter === 'ai' ? 0xff4d5e : 0x3a8fe0);
      if (c.rarity !== 'common') fx.text(new THREE.Vector3(p.x, p.y + 1.1, p.z), RARITY[c.rarity].label, 'rar r-' + c.rarity);
      if (simWatch.count >= 4) { slowUntil = Math.max(slowUntil, now + 450); camZoom = Math.min(0.28, camZoom + 0.04); }
      navigator.vibrate?.(12);
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
  $('#dailyCard').hidden = true;
  $('#lvResult').hidden = true;
  $('#lvIntro').hidden = true;
  $('#potLbl').textContent = t('pot');
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
    m.position.set((rng() - 0.5) * 0.12, DISC_H / 2 + i * (DISC_H + 0.004), (rng() - 0.5) * 0.12);
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
    m.position.set(Math.cos(a) * 3.2, DISC_H / 2, Math.sin(a) * 3.2);
    m.rotation.y = -a + Math.PI / 2;
    scene.add(m);
    homeMeshes.push(m);
  });
  refreshTexts();
  show('#home');
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
  for (const m of homeMeshes) scene.remove(m);
  homeMeshes = [];
  const lv = opts.level || null;
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
    addTween(0.22, (k) => { f.m.position.y = lerp(y0, f.p.y, k * k); }, () => { f.m.userData.anim = false; sfx.clack(0.5); });
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
    await maybeOfferMic(flipped.length, who);
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
  const dir = toCam.clone().negate();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const top = table.columnTop();
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
    if (y <= top) hit = new THREE.Vector3(o.x + t * v.x, Math.max(0.03, y), o.z + t * v.z); // 옆면(아래로 넘치면 맨 아래)
    else if (v.y < 0) {
      const tt = (top - o.y) / v.y; // 옆면 위로 넘치면 윗면을 누른 것 → 맨 위 층
      hit = new THREE.Vector3(o.x + tt * v.x, top - 0.02, o.z + tt * v.z);
    }
  }
  if (!hit) {
    // 더미 바깥(옆)을 누름: 중심 세로 평면으로 읽어 가장자리로 붙인다
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(toCam, new THREE.Vector3(c.x, 0, c.z));
    hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
  }
  const lat = clamp(new THREE.Vector3(hit.x - c.x, 0, hit.z - c.z).dot(side), -0.9 * DISC_R, 0.9 * DISC_R);
  const h = clamp(hit.y, 0.03, Math.max(0.05, top - 0.02));
  return { dir: { x: dir.x, z: dir.z }, lat, h, power: 0 };
}

function playerShot() {
  return new Promise((resolve) => {
    const el = renderer.domElement;
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    let aiming = null;
    let inhale = null;
    let micPeak = 0, micBlowing = false, micTimer = null;
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
      if (aiming.beat) {
        // 콩닥 숨: 당긴 숨(가운데) + 박동 → 볼·물결·숨 줄기가 모두 유효 숨으로 오르내림. 꽉 래치·버팀은 당긴 숨 기준(안정)
        const off = Rules.beatStep(aiming.beat, dt, now - aiming.beat.t0, aiming.power / F, feel.beat, aiming.beat.rng);
        aiming.eff = clamp(aiming.power + sweetHiFor(aiming.n) * off, 0, POWER_MAX);
        aiming.beat.buf.push({ t: now, eff: aiming.eff });
        while (aiming.beat.buf.length > 2 && aiming.beat.buf[0].t < now - 400) aiming.beat.buf.shift();
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
    const finish = (shot) => {
      cancelInput = null;
      myTurn.on = false;
      myTurn.until = shot ? performance.now() + 650 : 0; // 불고 난 뒤 잠깐 볼이 꺼지는 모습까지
      hideCues();
      camAimGoal = 0; // 불고 나면 뒤집히는 장면을 보도록 원래 시점으로
      camStrafeGoal = 0;
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
      if (beatOn()) { aiming.n = liveCount(); aiming.beat = { ph: 0, k: 0, u: 0, t0: performance.now(), buf: [], rng: mulberry32((Math.random() * 2 ** 31) | 0) }; aiming.eff = 0; } // 박동 난수는 경기 rng 와 따로(켜고 꺼도 상대·판 흐름이 같게)
      myTurn.pressed = true;
      camStrafeSide.set(-s.dir.z, 0, s.dir.x).normalize(); camStrafeGoal = s.lat || 0; // 몸이 표적 쪽으로 옆걸음
      el.setPointerCapture?.(ev.pointerId);
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
        micPeak = 0; micBlowing = false;
        micTimer = setInterval(() => {
          const { level, blowing } = mic.sample();
          puffer.p = Math.min(POWER_MAX, level);
          breath.over = puffer.p > F + 0.01; // 마이크: 버팀·콜록 없음, 꽉 너머면 고리만 빨갛게
          if (blowing) { micBlowing = true; micPeak = Math.max(micPeak, level); }
          else if (micBlowing && level < micPeak * 0.45) {
            // 불기 끝 → 발사
            const shot = { ...aiming, power: clamp(micPeak, 0.15, POWER_MAX) };
            micBlowing = false;
            fire(shot);
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
      if (aiming.beat) return; // 콩닥 숨: 볼·물결·조준은 rAF 루프가 유효 숨으로 그린다
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
      if (micEnabled && mic.ready) { if (!micBlowing) { aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); clearInterval(micTimer); unpress(); } return; }
      if (aiming.power < 0.06) {
        aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); resetPouch(); inhale?.stop(); inhale = null; unpress();
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
    const unpress = () => { camStrafeGoal = 0; if (!myTurn.on) return; myTurn.pressed = false; myTurn.t0 = performance.now(); $('#hint').hidden = false; }; // 누름이 취소되면 안내를 다시
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
function breathFeedback(ratio, who, forceKey) {
  const key = forceKey || (ratio < 0.66 ? 'fbTooWeak' : ratio < Rules.GREEN_LO ? 'fbWeak' : ratio <= 1.0 ? 'fbPerfect' : ratio <= 1.12 ? 'fbStrong' : 'fbTooStrong');
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

async function blow(rawShot, who) {
  const shot = resolveShot(rawShot, match.rng);
  const g = shotGeometry(shot);
  if (who === 'me') takeCueSnap(rawShot, shot, g);
  if (who === 'me') {
    puffer.snapUntil = performance.now() + 900; puffer.snapP = rawShot.power; puffer.snapN = liveCount();
    lastBreath.p = rawShot.power; lastBreath.aim = g.aim.clone(); lastBreath.normal = g.normal.clone();
    profile.tutorialPuffs = (profile.tutorialPuffs || 0) + 1; Store.save(profile);
  }
  setTimeout(() => breathFeedback(shot.ratio, who), 380);
  breath.mode = 'blow'; breath.t = 0; breath.p = Math.min(1.2, rawShot.power / sweetHiFor(liveCount())); breath.who = who; breath.ratio = shot.ratio;
  puffer.mode = 'blow';
  puffer.p = shot.power;
  puffer.fill = clamp(rawShot.power / Rules.POUCH_FULL, 0, 1);
  puffer.ratio = shot.ratio ?? 1;
  puffer.strain = 0; puffer.full = false;
  breath.press = null; breath.full = false; breath.over = false; breath.strain = 0;
  const hs = Math.round(60 + 60 * clamp(shot.ratio ?? 0.8, 0, 1)); // 히트스톱 60~120ms, 숨 세기에 비례 (2라운드 리서치)
  hitStopUntil = performance.now() + hs;
  await wait(hs);
  hideGizmo();
  sfx.puff(Math.min(1.2, rawShot.power), shot.ratio ?? 1); // '푸' — 약함·초록·셈에 따라 길이·거칠기
  navigator.vibrate?.(Math.round(20 + shot.power * 30));
  if (who === 'me') window.__lastShot = { pose: rawShot.pose || 'eye', mouthY: rawShot.mouthY ?? null, power: rawShot.power }; // 테스트용
  const windFrom = rawShot.mouthY != null ? new THREE.Vector3(g.aim.x - g.dir.x * Rules.LIP_BACK, rawShot.mouthY, g.aim.z - g.dir.z * Rules.LIP_BACK) : g.origin; // 책상 입: 낮은 곳에서 올려 붊
  fx.wind(windFrom, g.aim, shot.power, who === 'me' ? 0xffffff : 0xffe7a0);
  if (shot.h < table.columnTop() * 0.15) fx.emit({ at: { x: g.aim.x, y: 0.05, z: g.aim.z }, n: 40, color: 0xc9a77a, speed: 2.4, up: 1.2, life: 0.8, size: 0.32, gravity: 2 }); // 너무 낮게: 바닥 먼지
  fx.emit({ at: { x: g.aim.x, y: Math.max(0.05, g.aim.y), z: g.aim.z }, n: 18, color: 0xfff6e0, speed: 2.2 * shot.power, up: 1.2, life: 0.5, size: 0.3, gravity: 1 });
  shake = 0.18 + rawShot.power * 0.22;
  flash(0.55 * Math.min(1, rawShot.power));
  shockwave(table.pileCenter(), rawShot.power);
  // 물리에 바람 적용
  table.blow({ aim: { x: g.aim.x, y: g.aim.y, z: g.aim.z }, dir: { x: g.dir.x, z: g.dir.z }, power: shot.power, blast: shot.blast || 0, ...(rawShot.mouthY != null ? { mouthY: rawShot.mouthY } : {}) });
  if (shot.blast > 0.15) {
    // 너무 센 숨 = 돌풍: 휘잉~ 먼지바람이 더미를 통째로 밀어 버린다 (들어 올리지 못하고 날려 버림)
    sfx.whoosh();
    shake += 0.25 * Math.min(1, shot.blast);
    for (let i = 0; i < 3; i++) fx.emit({ at: { x: g.aim.x, y: 0.15 + i * 0.4, z: g.aim.z }, n: 22, color: 0xd9c7a8, speed: 7 * Math.min(1.2, shot.blast), up: 0.6, life: 0.9, size: 0.38, gravity: 0.5, dir: { x: g.dir.x, y: 0, z: g.dir.z } });
  }
  simWatch.revealed = new Set(table.liveDiscs().filter((d) => table.faceUp(d) > 0.5).map((d) => d.id));
  simWatch.count = 0;
  simWatch.glowed = new Set();
  simWatch.outShown = new Set();
  simWatch.outs = 0;
  simWatch.shooter = who;
  simWatch.simTime = 0;
  simWatch.quiet = 0;
  simWatch.vy.clear();
  slowUntil = performance.now() + 120 + 380; // 날아오르는 순간만 짧게 슬로모(대박 조짐이면 watchSim 에서 연장)
  acc = 0;
  simOn = true;
  setTimeout(() => { puffer.mode = 'idle'; puffer.p = 0; puffer.aimX = 0; $('#puffWrap').classList.remove('ai'); puffer.who = 'me'; }, 450);
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

async function react(flipped, who) {
  const n = flipped.length;
  const remainingBefore = table.liveDiscs().length;
  let key = 'miss', cls = 'r0';
  const nearMiss = table.liveDiscs().some((d) => Math.abs(table.faceUp(d)) < 0.45);
  const blown = simWatch.outs >= 2 && simWatch.outs >= n;
  if (n === 0) { key = blown ? 'blownOut' : nearMiss ? 'close' : 'miss'; cls = 'r0'; }
  else if ((n >= 2 && n === remainingBefore) || n >= 12) { key = 'perfect'; cls = 'r4'; }
  else if (n >= Math.max(6, Math.ceil(remainingBefore * 0.5))) { key = 'amazing'; cls = 'r3'; }
  else if (n >= 3) { key = 'great'; cls = 'r2'; }
  else { key = 'nice'; cls = 'r1'; }
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
  if (simWatch.outs > 0 && (blown || n > 0)) label += `<small class="outs">${fmt(t('outCount'), { k: simWatch.outs })}</small>`;
  if (simWatch.outs > 0 && !profile.settings.outTipSeen) { profile.settings.outTipSeen = true; Store.save(profile); if (!cue.receipt) setTimeout(() => toast(t('outTip')), 900); }
  const el = $('#big');
  el.innerHTML = label;
  el.className = 'big ' + cls + (who === 'ai' ? ' ai' : '');
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('go');
  await wait(n > 0 ? 900 : 1000);
  el.hidden = true;
}

// 첫 대박(5장↑) 직후에만 "진짜로 불어볼래?" — 마이크 권한은 첫 실행에 묻지 않는다(리서치)
async function maybeOfferMic(n, who) {
  if (who !== 'me' || n < 5 || micEnabled || profile.settings.micOffered || !navigator.mediaDevices?.getUserMedia) return;
  profile.settings.micOffered = true;
  Store.save(profile);
  const el = $('#micOffer');
  el.hidden = false;
  const choice = await new Promise((res) => {
    $('#micYes').onclick = () => res(true);
    $('#micNo').onclick = () => res(false);
  });
  el.hidden = true;
  if (choice) {
    const ok = await mic.start();
    micEnabled = ok;
    toast(ok ? t('micOn') : t('micFail'));
    refreshTexts();
  }
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
    m.userData.anim = true;
    const from = m.position.clone();
    const q0 = m.quaternion.clone();
    const idx = piles[who].length;
    piles[who].push(m);
    const to = dest.clone().add(new THREE.Vector3(0, DISC_H / 2 + idx * (DISC_H + 0.004), 0));
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
  const anims = live.map((d) => {
    const m = meshes.get(d.id), b = before.get(d.id), p = d.body.translation(), q = d.body.rotation();
    return { m, from: b.p, q0: b.q, to: new THREE.Vector3(p.x, p.y, p.z), q1: new THREE.Quaternion(q.x, q.y, q.z, q.w) };
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
  sfx.clack(0.6);
  await wait(200);
}

async function endMatch() {
  simOn = false;
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
  if (!match || !match.solo) return;
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
  const my = ++runId;
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
  $('#lrTitle').textContent = res.win ? t('clear') : t('failed');
  $('#lrTitle').className = 'res-title ' + (res.win ? 'win' : 'lose');
  $('#lrStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.25}s">★</span>`).join('');
  let detail = '';
  if (spec.type === 'flip') detail = `${res.flipped} / ${spec.target}`;
  else if (spec.type === 'golden') detail = res.win ? t('goldenGot') : t('goldenMiss');
  else if (spec.type === 'goldenSide') detail = res.win ? t('goldenGot') : t('goldenSideMiss');
  else detail = `${res.me} : ${res.ai}`;
  if (!res.win && spec.type === 'flip' && spec.target - res.flipped <= 2) detail += ` — ${fmt(t('nearMiss'), { k: spec.target - res.flipped })}`;
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
  $('#lrNext').onclick = () => { $('#lvResult').hidden = true; clearMatchMeshes(); openLevelIntro(spec.n + 1); };
  $('#lrRetry').onclick = () => { $('#lvResult').hidden = true; clearMatchMeshes(); startLevel(spec.n); };
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
  for (const k of Object.keys(TUNE_DEFAULTS)) {
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
  $('#tune').hidden = false;
}
function closeTune(reset) {
  if (reset) Object.assign(feel, TUNE_DEFAULTS);
  profile.settings.feel = { ...feel };
  Store.save(profile);
  if (reset) openTune(); else $('#tune').hidden = true;
}
function tuneSummary() {
  return Object.entries(feel).map(([k, v]) => `${k}=${(+v).toFixed(2)}`).join(' ');
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

// ── 부트 ───────────────────────────────────────────────
function wireUI() {
  $('#playBtn').addEventListener('click', () => { sfx.unlock(); openMap(); });
  $('#freeBtn').addEventListener('click', () => { sfx.unlock(); sfx.pop(); startMatch(); });
  $('#mapBack').addEventListener('click', () => { sfx.pop(); goHome(); });
  $('#liClose').addEventListener('click', () => { $('#lvIntro').hidden = true; });
  $('#albumBtn').addEventListener('click', openAlbum);
  $('#sheetBtn').addEventListener('click', openSheet);
  $('#tuneBtn').addEventListener('click', openTune);
  $('#dailyBtn').addEventListener('click', startDaily);
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
  $('#againBtn').addEventListener('click', () => { sfx.pop(); clearMatchMeshes(); startMatch(); });
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
  $('#quitBtn').addEventListener('click', () => { const wasLevel = match && match.level; simOn = false; table = null; goHome(); if (wasLevel) openMap(); });
  $('#langBtn').addEventListener('click', () => {
    setLang(getLang() === 'ko' ? 'en' : 'ko');
    profile.settings.lang = getLang();
    Store.save(profile);
    refreshTexts();
  });
  $('#sndBtn').addEventListener('click', () => {
    sfx.unlock();
    sfx.muted = !sfx.muted;
    profile.settings.sound = !sfx.muted;
    Store.save(profile);
    refreshTexts();
  });
  $('#micBtn').addEventListener('click', async () => {
    sfx.unlock();
    if (micEnabled) { micEnabled = false; mic.stop(); refreshTexts(); return; }
    const ok = await mic.start();
    micEnabled = ok;
    if (!ok) toast(t('micFail'));
    refreshTexts();
  });
  document.querySelectorAll('#chips button').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); sfx.pop(); stakeN = +b.dataset.n; refreshTexts(); }));
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); sfx.pop(); mode = b.dataset.m; refreshTexts(); }));
  window.addEventListener('resize', layout);
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
  const lvHash = /#lv(\d+)/.exec(location.hash || '');
  if (lvHash) setTimeout(() => openLevelIntro(Math.max(1, +lvHash[1])), 400); // 테스트용: 주소 끝 #lv18
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
    return { state, puffP: puffer.p, live: table.liveDiscs().length, me: piles.me.length, ai: piles.ai.length, top: toScreen(top), bottom: toScreen(0), frontTop: fr(top), frontBottom: fr(0), reticle: ret, turn: match?.turn, level: match?.level?.n, puffsLeft: match?.puffsLeft, flipped: match?.flipped };
  };
}

boot();
