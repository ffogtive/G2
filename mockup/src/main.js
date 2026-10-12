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
function guideStage() {
  if (feel.guide >= 0.5) return 0;
  const k = profile.tutorialPuffs || 0;
  return k < 3 ? 0 : k < 8 ? 1 : k < 15 ? 2 : 3;
}
function guideOn() { return guideStage() === 0; }
const MAX_TURNS = 18;

// ── 상태 ─────────────────────────────────────────────────
let profile = Store.load();
// 손맛 튜닝 값 (홈 ⚙ 패널에서 조절 → 재윤님 피드백 루프용)
const TUNE_DEFAULTS = { pull: 0.42, wind: 1, slow: 0.3, aiSkill: 1, overShake: 1, guide: 0 };
const TUNE_RANGE = { pull: [0.25, 0.7, 0.01], wind: [0.6, 1.6, 0.05], slow: [0.12, 1, 0.02], aiSkill: [0.3, 2, 0.05], overShake: [0, 2, 0.1], guide: [0, 1, 1] };
const feel = { ...TUNE_DEFAULTS, ...(profile.settings.feel || {}) };
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
  pileX = portrait ? 2.5 : 4.4;
  camera.updateProjectionMatrix();
  const bc = $('#breath');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  bc.width = Math.round(w * dpr); bc.height = Math.round(h * dpr); bc._dpr = dpr;
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
  layerRing = new THREE.Mesh(
    new THREE.TorusGeometry(DISC_R * 1.08, 0.025, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false }),
  );
  layerRing.rotation.x = Math.PI / 2;
  layerRing.renderOrder = 9;
  layerRing.visible = false;
  scene.add(layerRing);
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  aimLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9, depthTest: false }));
  aimLine.renderOrder = 9;
  aimLine.visible = false;
  scene.add(aimLine);
}

function powerColor(p) {
  if (!guideOn()) return 0xffffff; // 가이드 끝나면 색으로 정답을 알려 주지 않는다
  const n = liveCount();
  if (p > sweetHiFor(n) * 1.05) return 0xff4d4d;
  if (p >= sweetLoFor(n)) return 0x6dff5a;
  return 0xffe066;
}

// 슛 → 월드 조준점 (원기둥 앞쪽 접평면)
function shotGeometry(shot) {
  const c = table.pileCenter();
  const dir = new THREE.Vector3(shot.dir.x, 0, shot.dir.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const aim = new THREE.Vector3(c.x, shot.h, c.z).addScaledVector(dir, -DISC_R).addScaledVector(side, shot.lat);
  const pitch = 0.1;
  const d3 = new THREE.Vector3(dir.x * Math.cos(pitch), -Math.sin(pitch), dir.z * Math.cos(pitch));
  const origin = aim.clone().addScaledVector(d3, -2.6);
  return { aim, origin, dir, side, center: c };
}

function showGizmo(shot, color = 0xffffff) {
  const g = shotGeometry(shot);
  if (breath.mode !== 'blow') {
    breath.aim = g.aim.clone();
    breath.p = (shot.power || 0) / sweetHiFor(liveCount());
    if (breath.mode !== 'charge') { breath.mode = 'charge'; breath.t = 0; }
  }
  reticle.visible = layerRing.visible = aimLine.visible = true;
  reticle.position.copy(g.aim).addScaledVector(g.dir, -0.02);
  reticle.lookAt(g.aim.clone().addScaledVector(g.dir, -1));
  reticle.material.color.setHex(color);
  // 지난 숨 고스트: 직전 조준 자리 (내 차례일 때만)
  if (lastBreath.aim && puffer.who === 'me' && breath.mode === 'charge') {
    ghostRing.visible = true;
    ghostRing.position.copy(lastBreath.aim).addScaledVector(g.dir, -0.03);
    ghostRing.lookAt(lastBreath.aim.clone().addScaledVector(g.dir, -1));
  }
  const s = 0.8 + (shot.power || 0) * 0.6;
  reticle.scale.setScalar(s);
  layerRing.position.set(g.center.x, shot.h, g.center.z);
  layerRing.material.color.setHex(color);
  const from = g.origin.clone().lerp(g.aim, 0.15);
  aimLine.visible = false; // 숨 줄기(2D 오버레이)로 대체
  aimLine.geometry.setFromPoints([from, g.aim]);
  aimLine.computeLineDistances();
  aimLine.material.color.setHex(color);
}

function hideGizmo() {
  reticle.visible = layerRing.visible = aimLine.visible = false;
  if (ghostRing) ghostRing.visible = false;
  if (breath.mode === 'charge') breath.mode = 'off';
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
  breath.t += dt;
  const r = $('#puffWrap').getBoundingClientRect();
  const mx = (r.left + r.width * 0.5) * dpr, my = (r.top + r.height * 0.68) * dpr;
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
  grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
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

// ── 퍼퍼(볼 빵빵 얼굴) ───────────────────────────────────
const puffer = { p: 0, mode: 'idle', t: 0, who: 'me', snapUntil: 0, snapP: 0, snapN: 0 };
const lastBreath = { p: null, aim: null }; // 지난 숨 고스트 (내 숨만)
function drawPuffer() {
  const cv = $('#puffCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = cv.width;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2, S / 2 + S * 0.04);
  ctx.scale(S, S);
  const p = puffer.p;
  const over = p > sweetHiFor(liveCount()) * 1.12; // 숨이 넘치면 얼굴이 빨개짐 (몸의 신호 — 정답 구간은 숨김)
  const wob = over ? Math.sin(performance.now() * 0.05) * 0.012 : 0;
  ctx.translate(wob, 0);
  const blow = puffer.mode === 'blow';
  // 얼굴
  const skin = over ? '#ff8f7a' : '#ffd8a8';
  const g = ctx.createRadialGradient(-0.08, -0.1, 0.02, 0, 0, 0.36);
  g.addColorStop(0, '#fff0d6'); g.addColorStop(1, skin);
  const sx = 1 + (blow ? -0.06 : p * 0.12);
  ctx.save(); ctx.scale(sx, 1 - (blow ? -0.04 : p * 0.04));
  ctx.beginPath(); ctx.arc(0, 0, 0.33, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 0.03; ctx.strokeStyle = '#2a1a12'; ctx.stroke();
  ctx.restore();
  // 머리카락(뽀글)
  ctx.fillStyle = '#3a2a22';
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-0.21 + i * 0.07, -0.3 + Math.abs(i - 3) * 0.018, 0.075, 0, Math.PI * 2); ctx.fill(); }
  // 볼 (빵빵)
  const cheek = blow ? 0.05 : 0.06 + p * 0.09;
  ctx.fillStyle = over ? 'rgba(255,60,60,0.75)' : 'rgba(255,120,120,0.6)';
  ctx.beginPath(); ctx.arc(-0.19 - p * 0.03, 0.06, cheek, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0.19 + p * 0.03, 0.06, cheek, 0, Math.PI * 2); ctx.fill();
  // 절대 눈금: 볼 반짝임 3단계(흰 김 0.55 / 하늘 0.75 / 금 0.95) — 정답이 아니라 '내 숨의 크기' 자
  if (!blow && p >= 0.55) {
    const col = p >= 0.95 ? '255,210,63' : p >= 0.75 ? '120,210,255' : '255,255,255';
    const tw = 0.6 + 0.4 * Math.sin(performance.now() * 0.02);
    ctx.fillStyle = `rgba(${col},${0.85 * tw})`;
    for (const sgn of [-1, 1]) {
      const cx = sgn * (0.19 + p * 0.03), cy = 0.06;
      for (let k = 0; k < 3; k++) { const a = performance.now() * 0.004 + k * 2.1; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (cheek + 0.02), cy + Math.sin(a) * (cheek + 0.02), 0.012, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // 지난 숨 고스트: 직전에 불었던 볼 크기를 점선으로 (결과 지식, 정답 아님)
  if (!blow && puffer.who === 'me' && lastBreath.p != null && puffer.mode === 'charge') {
    const gc = 0.06 + lastBreath.p * 0.09;
    ctx.setLineDash([0.02, 0.018]);
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = 'rgba(42,26,18,0.55)';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(sgn * (0.19 + lastBreath.p * 0.03), 0.06, gc, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // 눈
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 0.03;
  if (p > 0.3 || blow) {
    ctx.beginPath(); ctx.moveTo(-0.17, -0.06); ctx.lineTo(-0.08, -0.03); ctx.moveTo(-0.17, 0.0); ctx.lineTo(-0.08, -0.03); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.17, -0.06); ctx.lineTo(0.08, -0.03); ctx.moveTo(0.17, 0.0); ctx.lineTo(0.08, -0.03); ctx.stroke();
  } else {
    ctx.fillStyle = '#2a1a12';
    ctx.beginPath(); ctx.arc(-0.12, -0.04, 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.12, -0.04, 0.035, 0, Math.PI * 2); ctx.fill();
  }
  // 입
  ctx.fillStyle = '#7a1f2b';
  if (blow) {
    ctx.beginPath(); ctx.ellipse(0, 0.14, 0.07, 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.022;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.06 + i * 0.06, 0.24); ctx.lineTo(-0.1 + i * 0.1, 0.42); ctx.stroke(); }
  } else {
    const r = 0.03 - p * 0.012;
    ctx.beginPath(); ctx.ellipse(0, 0.14, Math.max(0.012, r), 0.025, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 파워 게이지 (아크) — 단계적 은퇴. 구간은 '더미 양'에 따라 움직인다
  const stage = puffer.who === 'ai' ? 3 : guideStage();
  const snap = performance.now() < puffer.snapUntil; // 놓은 직후 정답 스냅샷 (stage 1)
  if (stage >= 2 || (stage === 1 && !snap && puffer.mode !== 'charge')) return;
  const n = puffer.snapN || liveCount();
  const SWEET_LO = sweetLoFor(n), SWEET_HI = sweetHiFor(n);
  const R = S * 0.46;
  ctx.save();
  ctx.translate(S / 2, S / 2);
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
  const ang = (v) => a0 + (a1 - a0) * (v / POWER_MAX);
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.06;
  ctx.strokeStyle = 'rgba(42,26,18,0.55)';
  ctx.beginPath(); ctx.arc(0, 0, R, a0, a1); ctx.stroke();
  if (stage === 1 && !snap) {
    // 테두리 + 내 숨 바늘(흰색)만 — 정답 구간은 숨김
    if (p > 0.01) { ctx.lineWidth = S * 0.045; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(0, 0, R, a0, ang(Math.min(p, POWER_MAX))); ctx.stroke(); }
    ctx.restore();
    return;
  }
  ctx.lineWidth = S * 0.035;
  ctx.strokeStyle = 'rgba(109,255,90,0.55)';
  ctx.beginPath(); ctx.arc(0, 0, R, ang(SWEET_LO), ang(SWEET_HI)); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,77,77,0.5)';
  ctx.beginPath(); ctx.arc(0, 0, R, ang(SWEET_HI + 0.05), a1); ctx.stroke();
  const pv = snap ? puffer.snapP : p;
  if (pv > 0.01) {
    ctx.lineWidth = S * 0.045;
    const hiN = sweetHiFor(n);
    ctx.strokeStyle = pv > hiN * 1.05 ? '#ff4d4d' : pv >= sweetLoFor(n) ? '#6dff5a' : '#ffe066';
    ctx.beginPath(); ctx.arc(0, 0, R, a0, ang(Math.min(pv, POWER_MAX))); ctx.stroke();
  }
  ctx.restore();
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

const simWatch = { revealed: new Set(), count: 0, lastClack: 0, vy: new Map(), resolve: null, simTime: 0, quiet: 0, glowed: new Set() };

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
  const pos = camBase.clone().lerp(new THREE.Vector3(0, 1, 0), camZoom);
  pos.x += (Math.random() - 0.5) * sh; pos.y += (Math.random() - 0.5) * sh;
  if (state === 'home') {
    const a = now * 0.00012;
    pos.set(Math.sin(a) * 12.5, 7.2, Math.cos(a) * 12.5);
    target.set(0, 2.2, 0);
  }
  camera.position.lerp(pos, state === 'home' ? 1 : 0.2);
  camera.lookAt(target);
  if (state === 'home') for (const m of homeMeshes) m.rotation.y += dt * 0.15;
  if (puffer.mode !== 'hidden') drawPuffer();
  drawBreath(Math.min(0.05, (now - (frame._last || now)) / 1000));
  frame._last = now;
  renderer.render(scene, camera);
}

function watchSim() {
  // 착지 '탁' 소리 + 뒤집혀 드러나는 순간 연출
  const now = performance.now();
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
    if (up > 0.5 && speed < 2.2 && !simWatch.revealed.has(d.id)) {
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
  state = 'match';
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
  match.turn = match.level ? (match.level.role === 'boss' ? 'ai' : 'me') : match.practice ? 'me' : await rps();
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
  const toCam = new THREE.Vector3(camera.position.x - c.x, 0, camera.position.z - c.z).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(toCam, new THREE.Vector3(c.x, 0, c.z));
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  const dir = toCam.clone().negate();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const lat = clamp(new THREE.Vector3(hit.x - c.x, 0, hit.z - c.z).dot(side), -1.35, 1.35);
  const top = table.columnTop();
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
    const first = profile.firstPlay;
    $('#hint').hidden = false;
    $('#hint').className = 'hint' + (first ? ' first' : '');
    $('#hintText').textContent = micEnabled && mic.ready ? t('hintMic') : `${t('hintAim')} · ${t('hintPull')}`;
    cancelInput = () => finish(null);
    const finish = (shot) => {
      cancelInput = null;
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
      aiming = { ...s, sx: ev.clientX, sy: ev.clientY, lat0: s.lat };
      el.setPointerCapture?.(ev.pointerId);
      puffer.mode = 'charge';
      puffer.p = 0;
      showGizmo(aiming, powerColor(0));
      $('#hint').hidden = true;
      if (micEnabled && mic.ready) {
        micPeak = 0; micBlowing = false;
        micTimer = setInterval(() => {
          const { level, blowing } = mic.sample();
          puffer.p = Math.min(POWER_MAX, level);
          if (blowing) { micBlowing = true; micPeak = Math.max(micPeak, level); }
          else if (micBlowing && level < micPeak * 0.45) {
            // 불기 끝 → 발사
            const shot = { ...aiming, power: clamp(micPeak, 0.15, POWER_MAX) };
            micBlowing = false;
            fire(shot);
          }
          showGizmo({ ...aiming, power: puffer.p }, powerColor(puffer.p));
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
      const dx = ev.clientX - aiming.sx;
      aiming.power = clamp(dy / (minDim * feel.pull), 0, POWER_MAX);
      aiming.lat = clamp(aiming.lat0 - dx / (minDim * 0.5), -1.35, 1.35);
      puffer.p = aiming.power;
      inhale?.set(aiming.power);
      // 절대 피치 계단: 숨 크기를 8칸 음계로 (같은 크기 = 같은 음 → 귀로 익히는 자)
      const step = Math.min(7, Math.floor((aiming.power / POWER_MAX) * 8));
      if (step !== aiming.step) { aiming.step = step; if (step > 0) sfx.tone([392, 440, 494, 523, 587, 659, 698, 784][step], 0.05, 'triangle', 0.06); }
      showGizmo(aiming, powerColor(aiming.power));
    };
    const fire = (shot) => {
      aiming = null;
      profile.firstPlay = false;
      finish(shot);
    };
    const up = () => {
      if (!aiming) return;
      if (micEnabled && mic.ready) { if (!micBlowing) { aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); clearInterval(micTimer); } return; }
      if (aiming.power < 0.06) {
        aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); inhale?.stop(); inhale = null;
        return;
      }
      fire({ ...aiming });
    };
    const cancel = () => { aiming = null; puffer.mode = 'idle'; puffer.p = 0; hideGizmo(); inhale?.stop(); inhale = null; };
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
  const toCam = new THREE.Vector3(camera.position.x - c.x, 0, camera.position.z - c.z).normalize();
  const dir = toCam.clone(); // 상대는 맞은편에서 내 쪽으로 분다
  const shot = {
    dir: { x: dir.x, z: dir.z },
    lat: clamp(g() * 0.35 / feel.aiSkill, -1.2, 1.2),
    h: clamp(top * clamp(0.68 + 0.18 * clamp(((match.aiSkill || 1) - 1) / 1.2, 0, 1) + g() * 0.17 / feel.aiSkill, 0.05, 1), 0.03, top),
    power: clamp(sweetHiFor(table.liveDiscs().length) * (0.92 + g() * 0.14 / feel.aiSkill), 0.2, POWER_MAX),
  };
  puffer.mode = 'charge';
  puffer.who = 'ai';
  $('#puffWrap').classList.add('ai');
  // 조준 흔들기 연출
  const startLat = shot.lat + (rng() - 0.5) * 1.6, startH = top * rng();
  await addTween(0.9, (k) => {
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
function breathFeedback(ratio, who) {
  const key = ratio < 0.62 ? 'fbTooWeak' : ratio < 0.86 ? 'fbWeak' : ratio <= 1.0 ? 'fbPerfect' : ratio <= 1.15 ? 'fbStrong' : 'fbTooStrong';
  if (who === 'me') {
    const st = guideStage();
    if (key === 'fbPerfect' && st >= 2) sfx.tone(1568, 0.25, 'sine', 0.12); // '칭' — 좋은 숨엔 소리
    if (st === 3) return; // 16번째 숨부터 글자 없음
    if (st === 2 && key !== 'fbPerfect' && ratio >= 0.68 && ratio <= 1.18) return; // 크게 틀렸을 때만 교정
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
  if (who === 'me') {
    puffer.snapUntil = performance.now() + 900; puffer.snapP = rawShot.power; puffer.snapN = liveCount();
    lastBreath.p = rawShot.power; lastBreath.aim = g.aim.clone();
    profile.tutorialPuffs = (profile.tutorialPuffs || 0) + 1; Store.save(profile);
  }
  setTimeout(() => breathFeedback(shot.ratio, who), 380);
  breath.mode = 'blow'; breath.t = 0; breath.p = Math.min(1.2, rawShot.power / sweetHiFor(liveCount())); breath.who = who; breath.ratio = shot.ratio;
  puffer.mode = 'blow';
  puffer.p = shot.power;
  hitStopUntil = performance.now() + 70; // 히트스톱(기대감)
  await wait(70);
  hideGizmo();
  sfx.puff(Math.min(1.2, rawShot.power));
  navigator.vibrate?.(Math.round(20 + shot.power * 30));
  fx.wind(g.origin, g.aim, shot.power, who === 'me' ? 0xffffff : 0xffe7a0);
  if (shot.h < table.columnTop() * 0.15) fx.emit({ at: { x: g.aim.x, y: 0.05, z: g.aim.z }, n: 40, color: 0xc9a77a, speed: 2.4, up: 1.2, life: 0.8, size: 0.32, gravity: 2 }); // 너무 낮게: 바닥 먼지
  fx.emit({ at: { x: g.aim.x, y: Math.max(0.05, g.aim.y), z: g.aim.z }, n: 18, color: 0xfff6e0, speed: 2.2 * shot.power, up: 1.2, life: 0.5, size: 0.3, gravity: 1 });
  shake = 0.18 + rawShot.power * 0.22;
  flash(0.55 * Math.min(1, rawShot.power));
  shockwave(table.pileCenter(), rawShot.power);
  // 물리에 바람 적용
  table.blow({ aim: { x: g.aim.x, y: g.aim.y, z: g.aim.z }, dir: { x: g.dir.x, z: g.dir.z }, power: shot.power });
  simWatch.revealed = new Set(table.liveDiscs().filter((d) => table.faceUp(d) > 0.5).map((d) => d.id));
  simWatch.count = 0;
  simWatch.glowed = new Set();
  simWatch.shooter = who;
  simWatch.simTime = 0;
  simWatch.quiet = 0;
  simWatch.vy.clear();
  slowUntil = performance.now() + 120 + 380; // 날아오르는 순간만 짧게 슬로모(대박 조짐이면 watchSim 에서 연장)
  acc = 0;
  simOn = true;
  setTimeout(() => { puffer.mode = 'idle'; puffer.p = 0; $('#puffWrap').classList.remove('ai'); puffer.who = 'me'; }, 450);
}

function simulate() {
  return new Promise((resolve) => {
    simWatch.resolve = () => {
      simOn = false;
      const flipped = table.liveDiscs().filter((d) => table.faceUp(d) > 0.2);
      resolve(flipped);
    };
  });
}

async function react(flipped, who) {
  const n = flipped.length;
  const remainingBefore = table.liveDiscs().length;
  let key = 'miss', cls = 'r0';
  const nearMiss = table.liveDiscs().some((d) => Math.abs(table.faceUp(d)) < 0.45);
  if (n === 0) { key = nearMiss ? 'close' : 'miss'; cls = 'r0'; }
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
  const label = n > 0 ? `${t(key)} <small>${n} ${t('flipped')}</small>` : t(key);
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
  // 남은 딱지를 다시 원기둥으로
  const targets = table.restackTargets({ x: 0, z: 0 });
  const anims = targets.map(({ d, p, q }) => {
    const m = meshes.get(d.id);
    m.userData.anim = true;
    return { m, from: m.position.clone(), q0: m.quaternion.clone(), to: new THREE.Vector3(p.x, p.y, p.z), q1: new THREE.Quaternion(q.x, q.y, q.z, q.w) };
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
  table.applyRestack(targets);
  table.settle(240);
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
  state = 'match';
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
    b.innerHTML = `<b>${n}</b>${spec.tier === 'hard' || spec.tier === 'superhard' ? `<em>${tierLabel(spec.tier)}</em>` : ''}${done ? `<i>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</i>` : ''}${spec.type === 'rival' ? '<u>VS</u>' : spec.type === 'golden' ? '<u class="g">★</u>' : ''}`;
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
  img.src = spec.type === 'golden' ? faceImage('golden', 70) : spec.type === 'rival' ? faceImage(RIVALS.find((r) => r.id === spec.rival).card, 70) : backImage();
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
  if (spec.type === 'golden') { goldenIdx = Math.round((1 - spec.goldenDepth) * (spec.N - 1)); ids[goldenIdx] = 'golden'; }
  const heavy = new Set();
  while (heavy.size < Math.min(spec.heavy, spec.N - 1)) { const i = Math.floor(rng() * spec.N); if (i !== goldenIdx) heavy.add(i); }
  match = { seed: spec.seed, rng, myStake: [], aiStake: [], pot: ids.map((id) => ({ id, from: 'level' })), rivalName: '', rivalCard: CARDS[0], mode: 'fun', level: spec, solo: true, n: spec.N, turn: 'me', turnNo: 0, best: 0, flipsMe: 0, puffsLeft: spec.puffs, flipped: 0, goldenTaken: false };
  table = new Table(spec.seed >>> 0, { lift: 519.59 * feel.wind });
  table.addPile(ids, { heavy });
  table.settle();
  clearMatchMeshes();
  for (const d of table.discs) { const m = makeDiscMesh(d.cardId, d.heavy); meshes.set(d.id, m); scene.add(m); }
  syncMeshes();
  state = 'match';
  camZoom = 0;
  snapCam();
  $('#meScore').textContent = '0';
  $('#rivalAva').src = spec.type === 'golden' ? faceImage('golden', 48) : backImage();
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
  const stars = starsFor(spec, res);
  const before = new Set(Object.keys(profile.inv).filter((k) => profile.inv[k] > 0));
  const rewards = [];
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
  requestAnimationFrame((t0) => { lastT = t0; frame(t0); });
  // 자동 테스트용 훅: 더미의 화면 좌표(꼭대기·바닥)와 상태
  window.__puff = () => {
    if (!table) return { state };
    const c = table.pileCenter();
    const top = table.columnTop();
    const toScreen = (y) => { const v = new THREE.Vector3(c.x, y, c.z).project(camera); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }; };
    return { state, live: table.liveDiscs().length, me: piles.me.length, ai: piles.ai.length, top: toScreen(top), bottom: toScreen(0), turn: match?.turn, level: match?.level?.n, puffsLeft: match?.puffsLeft, flipped: match?.flipped };
  };
}

boot();
