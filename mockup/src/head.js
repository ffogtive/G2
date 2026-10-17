// head.js — 문법 D ② '장면'의 three.js 묶음: 재윤님 머리(mockup/assets/head.glb, 빌드가 #puffHead 에 base64 로 넣음) · 접촉 그늘 · 바람 리본 ·
//   더미 색 띠(영점 → 닿는 높이) · 닿는 곳 빛 · 옆 시점 교실 벽. 자세·리본 길·카메라 식은 sidecam.js(렌더러 독립), 언제 보이나는 main.js.
//
// 🧭 가설(재윤님 시제품 피드백 2026-10-17 '얼굴 밑에 그림자가 없어서 조금 어색하다'): 머리가 책상 위에 '얹혀' 보이려면 (1) 해 그림자가 책상에 떨어지고
//   (2) 턱이 닿은 곳이 어두워야 한다(접촉 그늘 — 해 그림자가 멀리 비켜 떨어지는 쪽에서도). 시제품은 머리 castShadow 끔 + 해 그림자 틀(±9, 원점)이
//   머리 자리(z 5~11)를 못 덮었다(three.js 그림자 행렬로 확인됨) → 머리 castShadow 켬 · 옆 시점 동안 해 그림자 틀을 머리까지 옮김(main.js, 해 방향 그대로
//   = 더미 그림자 모양 그대로) · 턱 밑 두 겹 그늘(진한 접촉 + 넓은 흐림). 얼굴 밝기는 해(얼굴 반대쪽)가 아니라 머리 재질에만 넣은 보조 키 빛(책상·더미 그림자를 안 지움).
//
// 불러오기: GLTFLoader 대신 이 GLB 한 꼴(메시 1 · 프리미티브 1 · POSITION/NORMAL/TEXCOORD_0/TANGENT · JPEG 3장)만 읽는 작은 파서.
//   텍스처는 createImageBitmap(Blob) — blob:/data: 주소를 안 만든다(아티팩트 CSP 에서도 같은 길). 탄젠트는 파일 값 그대로(노멀맵이 그 탄젠트로 구워짐 — 다시 계산 금지).
//   부팅을 막지 않는다: D 연습판이 열릴 때 부르고(base64 를 조각내 풀며 사이사이 양보), 다 안 됐으면 ② 는 머리 없이(리본·색 띠) 돈다.
import * as THREE from 'three';
import { HEAD, SV, headPt } from './sidecam.js';

export const headState = { loading: false, ready: false, failed: null, ms: null, bytes: 0, tris: 0 };
let loadP = null, headObj = null;

const tick = () => new Promise((r) => setTimeout(r, 0));
async function b64Bytes(b64) {
  const CH = 1 << 19, out = new Uint8Array(Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0));
  let o = 0;
  for (let i = 0; i < b64.length; i += CH) { // 조각마다 양보(긴 한 덩이로 메인 스레드를 안 막게) — CH 는 4 의 배수
    const bin = atob(b64.slice(i, i + CH));
    for (let k = 0; k < bin.length; k++) out[o++] = bin.charCodeAt(k);
    await tick();
  }
  return out;
}
async function bitmapOf(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob); // 옛 브라우저만
  try { const im = new Image(); im.src = url; await im.decode(); return im; } finally { URL.revokeObjectURL(url); }
}
// GLB → { mesh, mat, tris } (이 파일 꼴만: 메시 1 · 프리미티브 1 · 재질 1 — 다른 꼴이면 throw → 머리 없이)
async function parseGlb(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error('GLB 아님');
  const jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
  const b0 = 20 + jl + 8, bin = u8.subarray(b0, b0 + dv.getUint32(20 + jl, true));
  const prim = J.meshes?.[0]?.primitives?.[0];
  if (!prim || J.meshes.length !== 1 || J.meshes[0].primitives.length !== 1 || (prim.mode ?? 4) !== 4) throw new Error('GLB 꼴이 다름');
  const viewBytes = (i) => { const v = J.bufferViews[i]; return bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); }; // 복사(정렬 걱정 없음)
  const ibufs = new Map();
  const attr = (ai) => {
    const a = J.accessors[ai], v = J.bufferViews[a.bufferView], size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    if (a.componentType !== 5126) throw new Error('float 아닌 꼭짓점 값');
    if (v.byteStride && v.byteStride !== size * 4) {
      if (!ibufs.has(a.bufferView)) ibufs.set(a.bufferView, new THREE.InterleavedBuffer(new Float32Array(viewBytes(a.bufferView).buffer), v.byteStride / 4));
      return new THREE.InterleavedBufferAttribute(ibufs.get(a.bufferView), size, (a.byteOffset || 0) / 4);
    }
    const b = viewBytes(a.bufferView);
    return new THREE.BufferAttribute(new Float32Array(b.buffer, a.byteOffset || 0, a.count * size), size);
  };
  const g = new THREE.BufferGeometry();
  const A = prim.attributes;
  g.setAttribute('position', attr(A.POSITION));
  g.setAttribute('normal', attr(A.NORMAL));
  g.setAttribute('uv', attr(A.TEXCOORD_0));
  if (A.TANGENT != null) g.setAttribute('tangent', attr(A.TANGENT));
  const ia = J.accessors[prim.indices], ib = viewBytes(ia.bufferView);
  const IT = ia.componentType === 5125 ? Uint32Array : ia.componentType === 5123 ? Uint16Array : Uint8Array;
  g.setIndex(new THREE.BufferAttribute(new IT(ib.buffer, ia.byteOffset || 0, ia.count), 1));
  g.computeBoundingSphere();
  const M = J.materials[prim.material ?? 0], pbr = M.pbrMetallicRoughness || {};
  const tex = async (ref, srgb) => {
    if (!ref) return null;
    const T = J.textures[ref.index], im = J.images[T.source];
    const t = new THREE.Texture(await bitmapOf(viewBytes(im.bufferView), im.mimeType || 'image/jpeg'));
    t.flipY = false; // glTF 텍스처 좌표 원점 = 왼쪽 위
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const [map, normalMap, mr] = await Promise.all([tex(pbr.baseColorTexture, true), tex(M.normalTexture, false), tex(pbr.metallicRoughnessTexture, false)]);
  if (!map) throw new Error('색 텍스처 없음');
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap: mr, metalnessMap: mr, metalness: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
    side: M.doubleSided ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 1.25,
  });
  // 머리에만 닿는 보조 키 빛(얼굴 쪽 · 카메라 위): 해는 옆 시점에서 얼굴 반대쪽이라 얼굴이 어둡다. 장면 빛을 더하면 책상의 머리 그림자까지 옅어져서 재질 안에만 넣는다
  mat.userData.key = { dir: { value: new THREE.Vector3(0, 0, 1) }, col: { value: new THREE.Color(0, 0, 0) } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uKeyDir = mat.userData.key.dir; sh.uniforms.uKeyCol = mat.userData.key.col;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uKeyDir; uniform vec3 uKeyCol;')
      .replace('#include <lights_fragment_end>', '{ float kn = saturate( dot( normal, uKeyDir ) ); reflectedLight.directDiffuse += uKeyCol * kn * BRDF_Lambert( material.diffuseColor ); }\n#include <lights_fragment_end>');
  };
  mat.customProgramCacheKey = () => 'puffHeadKey';
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true; mesh.receiveShadow = false; // 얼굴에 받는 그림자는 끔(얼굴 쪽은 늘 해 반대편 — 그림자 여드름 없이)
  return { mesh, mat, tris: ia.count / 3 };
}
// 한 번만 불러온다(실패도 한 번 — 다시 안 시도). 결과 = 머리 Group(크기 1 · 모델 좌표) 또는 null
export function loadHead() {
  if (loadP) return loadP;
  const el = typeof document !== 'undefined' ? document.getElementById('puffHead') : null;
  if (!el) { headState.failed = 'none'; loadP = Promise.resolve(null); return loadP; }
  headState.loading = true;
  const t0 = performance.now();
  loadP = (async () => {
    try {
      await tick();
      const b64 = el.textContent.replace(/\s+/g, '');
      el.remove(); // 큰 글 노드를 DOM 에서 내린다(메모리)
      const u8 = await b64Bytes(b64);
      headState.bytes = u8.length;
      const { mesh, mat, tris } = await parseGlb(u8);
      headObj = { mesh, mat };
      headState.tris = tris; headState.ready = true; headState.ms = Math.round(performance.now() - t0);
      return headObj;
    } catch (e) {
      headState.failed = String(e?.message || e); console.warn('[머리] 불러오기 실패 — ② 는 머리 없이:', headState.failed);
      return null;
    } finally { headState.loading = false; }
  })();
  return loadP;
}

// ── 장면 소품(머리가 없어도 리본·색 띠는 돈다) ──
function radialTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const SEG = 28;
function makeRibbon() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((SEG + 1) * 2 * 3), uv = new Float32Array((SEG + 1) * 2 * 2), idx = [];
  for (let i = 0; i <= SEG; i++) { uv.set([i / SEG, 0, i / SEG, 1], i * 4); if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0xff4d4d) }, uTime: { value: 0 }, uLen: { value: 4 }, uOp: { value: 0.8 }, uFlash: { value: 0 }, uWhite: { value: 0.7 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // 몸(가운데 진하고 가장자리 옅음) + 길이 방향으로 흐르는 바람 줄 셋 · 시작·끝은 옅게
    fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uTime, uLen, uOp, uFlash, uWhite;
      float line(float v, float c, float w){ return 1.0 - smoothstep(0.0, w, abs(v - c)); }
      void main(){
        float t = vUv.x, y = vUv.y, v = abs(y * 2.0 - 1.0), d = t * uLen;
        float body = 1.0 - smoothstep(0.25, 1.0, v);
        float l1 = line(y, 0.5 + 0.06 * sin(d * 2.1 - uTime * 3.0), 0.07) * smoothstep(0.25, 0.75, fract(d * 0.9 - uTime * 2.6));
        float l2 = line(y, 0.28 + 0.05 * sin(d * 1.7 + 1.0 - uTime * 2.4), 0.06) * smoothstep(0.35, 0.8, fract(d * 0.75 - uTime * 2.2 + 0.4));
        float l3 = line(y, 0.72 + 0.05 * sin(d * 1.9 + 2.0 - uTime * 2.8), 0.06) * smoothstep(0.35, 0.8, fract(d * 0.8 - uTime * 2.4 + 0.7));
        float lines = max(l1, max(l2, l3));
        float fade = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.8, 1.0, t));
        float a = uOp * fade * (0.42 * body + 0.75 * lines * body);
        vec3 c = mix(uCol, vec3(1.0), uWhite * lines + 0.45 * uFlash);
        gl_FragColor = vec4(c, clamp(a + 0.3 * uFlash * body * fade, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 12; m.frustumCulled = false; m.visible = false;
  return m;
}
// 옆 시점에서만 보이는 교실 옆 벽(+x, 카메라 맞은편: 창 둘 · 게시판 — 글 없음) + 책상 아래 교실 바닥
function makeWall() {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024;
  const g = cv.getContext('2d');
  const wall = g.createLinearGradient(0, 0, 0, 1024); wall.addColorStop(0, '#f6e7c4'); wall.addColorStop(1, '#e9cf9c');
  g.fillStyle = wall; g.fillRect(0, 0, 2048, 1024);
  g.fillStyle = '#b07a46'; g.fillRect(0, 860, 2048, 164); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 2048; x += 128) g.fillRect(x, 860, 4, 164);
  for (const x0 of [180, 760]) {
    g.fillStyle = '#ffffff'; g.fillRect(x0 - 14, 150, 468, 520);
    const sky = g.createLinearGradient(0, 160, 0, 660); sky.addColorStop(0, '#5fc8ff'); sky.addColorStop(1, '#c8efff');
    g.fillStyle = sky; g.fillRect(x0, 164, 440, 492);
    g.fillStyle = '#ffffff'; g.fillRect(x0 + 216, 164, 8, 492); g.fillRect(x0, 400, 440, 8);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.arc(x0 + 110, 250, 34, 0, 6.3); g.arc(x0 + 150, 236, 42, 0, 6.3); g.arc(x0 + 192, 252, 30, 0, 6.3); g.fill();
  }
  g.fillStyle = '#8a5a2f'; g.fillRect(1380, 200, 520, 380); g.fillStyle = '#d9a86a'; g.fillRect(1400, 220, 480, 340);
  const notes = ['#ff8a8a', '#ffd34d', '#8fd3ff', '#9ee6a8', '#ffffff', '#ffb36b'];
  for (let i = 0; i < 6; i++) { g.save(); g.translate(1450 + (i % 3) * 150, 280 + Math.floor(i / 3) * 150); g.rotate((i % 2 ? -1 : 1) * 0.06); g.fillStyle = notes[i]; g.fillRect(0, 0, 110, 100); g.fillStyle = '#e04545'; g.beginPath(); g.arc(55, 10, 7, 0, 6.3); g.fill(); g.restore(); }
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  const w = new THREE.Mesh(new THREE.PlaneGeometry(44, 20), new THREE.MeshBasicMaterial({ map: tx }));
  w.rotation.y = -Math.PI / 2; w.position.set(16, 3.5, 4);
  const fc = document.createElement('canvas'); fc.width = fc.height = 256; const f = fc.getContext('2d');
  f.fillStyle = '#9a6a3f'; f.fillRect(0, 0, 256, 256); f.fillStyle = 'rgba(0,0,0,0.13)'; for (let y = 0; y < 256; y += 32) f.fillRect(0, y, 256, 3);
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace; ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(12, 12);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85 }));
  fl.rotation.x = -Math.PI / 2; fl.position.y = -7;
  // 가로 화면(넓은 시야)에서 벽 그림 밖이 하늘로 비지 않게: 같은 벽 색 큰 판을 뒤에
  const back = new THREE.Mesh(new THREE.PlaneGeometry(140, 70), new THREE.MeshBasicMaterial({ color: 0xefdbb0 }));
  back.rotation.y = -Math.PI / 2; back.position.set(16.05, 10, 10);
  const grp = new THREE.Group(); grp.add(back, w, fl); grp.visible = false;
  return grp;
}

// 장면 소품 묶음. set*(…) 를 프레임마다 부르고, 안 부른 것은 hide() 가 숨긴다
export class SceneProps {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    this.head = null; this.headGrp = new THREE.Group(); this.headGrp.visible = false; this.root.add(this.headGrp);
    // 접촉 그늘 두 겹: 턱이 닿은 곳(진하고 작게) · 머리 밑 넓게(옅고 크게 — 해 그림자가 비켜 떨어져도 '얹힘')
    const shadeMat = (stops, op) => new THREE.MeshBasicMaterial({ map: radialTex(stops), transparent: true, depthWrite: false, opacity: op, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadeMat([[0, 'rgba(40,20,8,0.85)'], [0.45, 'rgba(40,20,8,0.45)'], [1, 'rgba(40,20,8,0)']], 1));
    this.ao = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadeMat([[0, 'rgba(50,26,10,0.5)'], [0.55, 'rgba(50,26,10,0.22)'], [1, 'rgba(50,26,10,0)']], 1));
    for (const m of [this.contact, this.ao]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; this.root.add(m); }
    this.ribbon = makeRibbon(); this.root.add(this.ribbon);
    // 더미 색 띠(영점 → 지금 바람 높이) + 바람 앞머리 테(흰 + 색 빛) + 넘으면 꼭대기 덮개
    const grad = document.createElement('canvas'); grad.width = 4; grad.height = 128;
    { const g = grad.getContext('2d'), gr = g.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); }
    const gt = new THREE.CanvasTexture(grad); gt.colorSpace = THREE.SRGBColorSpace;
    const cyl = (h) => new THREE.CylinderGeometry(1, 1, h, 72, 1, true);
    const bm = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, ...o });
    this.band = new THREE.Mesh(cyl(1), bm({ color: 0xff4a4a, map: gt, opacity: 0.5 }));
    this.rim = new THREE.Mesh(cyl(0.045), bm({ color: 0xffffff, opacity: 0.95 }));
    this.rimC = new THREE.Mesh(cyl(0.11), bm({ color: 0xff4a4a, opacity: 0.55, blending: THREE.AdditiveBlending }));
    this.cap = new THREE.Mesh(new THREE.CircleGeometry(1, 64), bm({ color: 0x37d067, opacity: 0.4, side: THREE.DoubleSide }));
    this.cap.rotation.x = -Math.PI / 2;
    this.band.renderOrder = 9; this.rim.renderOrder = 10; this.rimC.renderOrder = 10; this.cap.renderOrder = 9;
    this.sleeve = new THREE.Group(); this.sleeve.add(this.band, this.rim, this.rimC, this.cap); this.sleeve.visible = false; this.root.add(this.sleeve);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]), color: 0xff4d4d, transparent: true, depthWrite: false, depthTest: false, opacity: 0.8 }));
    this.glow.renderOrder = 13; this.glow.visible = false; this.root.add(this.glow);
    this.wall = makeWall(); this.root.add(this.wall);
    this.used = new Set();
  }
  attachHead(h) {
    if (this.head || !h) return;
    this.head = h; this.headGrp.add(h.mesh);
  }
  begin() { this.used.clear(); }
  // 보이지 않게 된 것 숨기기(이번 프레임에 set 안 한 것)
  end() {
    if (!this.used.has('head')) this.headGrp.visible = false;
    if (!this.used.has('shade')) { this.contact.visible = false; this.ao.visible = false; }
    if (!this.used.has('ribbon')) this.ribbon.visible = false;
    if (!this.used.has('sleeve')) this.sleeve.visible = false;
    if (!this.used.has('glow')) this.glow.visible = false;
    if (!this.used.has('wall')) this.wall.visible = false;
  }
  hide() { this.begin(); this.end(); }
  setWall(on) { this.used.add('wall'); this.wall.visible = !!on; }
  // 머리: 자세(sidecam headPose) · 불투명도 · 카메라(가까우면 앞면만 — 앞 시점 카메라는 머리 속 자리라 안쪽 면이 보이면 안 됨) · 보조 키 빛
  setHead(pose, op, camera, key = 1.5) {
    if (!this.head) return false;
    this.used.add('head');
    const g = this.headGrp, H = SV.head.H;
    g.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    g.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.phi).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    g.scale.setScalar(H);
    // 카메라와 머리 사이: 경계 상자 거리(상자 반폭 단위, 1 = 겉면). 앞 시점 카메라는 머리 속 → 빠져나오는 동안 머리카락이 화면을 덮지 않게
    //   상자 1.25 배 안 = 안 그림 · 1.9 배까지 서서히 · 상자 안이면 앞면만(안쪽 면 숨김)
    g.updateMatrixWorld(true);
    const lc = g.worldToLocal(camera.position.clone()), [A, B] = HEAD.box;
    let e = 0; for (let k = 0; k < 3; k++) { const c = (A[k] + B[k]) / 2, h = (B[k] - A[k]) / 2, v = [lc.x, lc.y, lc.z][k]; e = Math.max(e, Math.abs(v - c) / h); }
    const inside = e < 1.08;
    op *= Math.min(1, Math.max(0, (e - 1.25) / 0.65));
    g.visible = op > 0.004;
    const m = this.head.mat, tr = op < 0.999;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = op; m.depthWrite = true;
    this.head.mesh.castShadow = op > 0.5;
    const side = inside ? THREE.FrontSide : THREE.DoubleSide;
    if (m.side !== side) { m.side = side; m.needsUpdate = true; }
    // 보조 키 빛: 머리에서 카메라 쪽 + 위로 35° · 세기 key(재질 안에서만)
    const ctr = new THREE.Vector3(0, 0.1, 0.1).applyMatrix4(g.matrixWorld);
    const d = camera.position.clone().sub(ctr).setY(0).normalize(); d.y = Math.tan(35 * Math.PI / 180); d.normalize();
    m.userData.key.dir.value.copy(d).transformDirection(camera.matrixWorldInverse);
    m.userData.key.col.value.setRGB(1, 0.94, 0.86).multiplyScalar(key * op);
    return op;
  }
  // 접촉 그늘: 턱 닿은 점(contact) · 머리 밑 넓게(입술 → 턱 → 목 쪽으로 길게) · k = 진하기
  setShade(pose, k) {
    if (k <= 0.004) return;
    this.used.add('shade');
    const H = SV.head.H, c = pose.contact, lift = Math.max(0, headPt(HEAD.chin, pose.phi, H, pose.pos).y - c.y); // 턱이 들릴수록(닿는 점이 턱 끝에서 비켜남) 접촉 그늘은 옅게·넓게
    this.contact.visible = true; this.ao.visible = true;
    // 접촉: 턱 끝 바로 밑(조금 앞까지 — 카메라에서 보이는 턱선 아래가 어두워야 '얹힘') · 넓은 흐림: 턱 → 목 쪽
    this.contact.position.set(c.x, 0.004, c.z + 0.05 * H);
    this.contact.scale.set(0.9 * H * (1 + 0.6 * lift), 0.42 * H * (1 + 0.6 * lift), 1); // 턱선 폭(볼 양쪽 ±0.35 H)까지 — 카메라 쪽 턱선 아래도 어둡게
    this.contact.material.opacity = k * Math.max(0.35, 1 - 0.8 * lift);
    this.ao.position.set(c.x, 0.003, c.z + 0.3 * H);
    this.ao.scale.set(1.0 * H, 0.95 * H, 1);
    this.ao.material.opacity = 0.85 * k;
  }
  // 바람 리본: 점들(sidecam ribbonPts) · 굵기 w0 → w1 · 색 · 불투명도 · 흰 줄 섞음 · 번쩍
  setRibbon(pts, w0, w1, col, op, now, camera, { white = 0.7, flash = 0 } = {}) {
    if (op <= 0.004 || pts.length < 2) return;
    this.used.add('ribbon');
    const R = this.ribbon, pa = R.geometry.attributes.position, n = SEG, m = pts.length - 1;
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    const v = new THREE.Vector3(), tg = new THREE.Vector3(), sd = new THREE.Vector3(), view = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * m, k = Math.min(m - 1, Math.floor(u)), f = u - k, a = pts[k], b = pts[k + 1];
      v.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
      tg.set(b.x - a.x, b.y - a.y, b.z - a.z);
      view.copy(v).sub(camera.position).normalize();
      sd.crossVectors(tg, view).normalize();
      const w = w0 + (w1 - w0) * Math.pow(i / n, 0.8);
      pa.setXYZ(i * 2, v.x + sd.x * w, v.y + sd.y * w, v.z + sd.z * w);
      pa.setXYZ(i * 2 + 1, v.x - sd.x * w, v.y - sd.y * w, v.z - sd.z * w);
    }
    pa.needsUpdate = true;
    const U = R.material.uniforms;
    U.uCol.value.set(col); U.uTime.value = now / 1000; U.uLen.value = L; U.uOp.value = op; U.uFlash.value = flash; U.uWhite.value = white;
    R.visible = true;
  }
  // 더미 색 띠: 영점 높이 y0 → y1(꼭대기까지) · over 면 꼭대기 덮개 · 반지름 R · 색 · 진하기 · 번쩍
  setSleeve(pc, R, y0, y1, vtop, over, col, op, flash, now) {
    if (op <= 0.004) return;
    this.used.add('sleeve');
    const hh = Math.max(0.002, y1 - y0);
    this.sleeve.visible = true;
    this.band.position.set(pc.x, (y0 + y1) / 2, pc.z); this.band.scale.set(R, hh, R);
    this.band.material.color.set(col); this.band.material.opacity = 0.55 * op;
    this.rim.visible = !over; this.rimC.visible = !over;
    this.rim.position.set(pc.x, y1, pc.z); this.rim.scale.set(R + 0.012, 1, R + 0.012); this.rim.material.opacity = 0.95 * op;
    this.rimC.position.set(pc.x, y1, pc.z); this.rimC.scale.set(R + 0.02, 1 + 0.6 * flash, R + 0.02); this.rimC.material.color.set(col); this.rimC.material.opacity = 0.6 * op;
    this.cap.visible = over; this.cap.position.set(pc.x, vtop + 0.02, pc.z); this.cap.scale.set(R, R, 1);
    this.cap.material.color.set(col); this.cap.material.opacity = (0.32 + 0.12 * Math.sin(now / 90) + 0.3 * flash) * op;
  }
  setGlow(p, size, col, op) {
    if (op <= 0.004) return;
    this.used.add('glow');
    this.glow.visible = true; this.glow.position.set(p.x, p.y, p.z); this.glow.scale.set(size, size, 1);
    this.glow.material.color.set(col); this.glow.material.opacity = op;
  }
}
