// turn.js — PvP 한 턴: 쏜 사람이 심판(시뮬·녹화), 받는 쪽은 재생 (렌더러 독립: Node 도구와 브라우저가 같은 코드)
//
// 🧭 가설 (docs/design/items-pvp.md §2.1 일관성 방식)
//   포즈만 받아 다시 시뮬하면 숨의 30%에서 결과가 갈린다(§2.0) → 받는 쪽은 시뮬하지 않고 30Hz 궤적을 재생, 판정은 쏜 사람의 res(id)를 그대로.
//   턴마다 새 월드(fromTurnState) + 턴별 시드 + 스텝 판정(stepJudge) 이면 같은 엔진끼리는 입력 ~20B 로 비트 단위 재현(뒤에서 검증).
//   판가름: tools/pvpsync.mjs (a) 20장 궤적 p90 ≤11KB, 조각 ≤3,800B (b) 재생 끝 = post (c) 새 월드 재시뮬 해시 100% (d) 판정 분포 그대로
//
// 좌표: 모든 샷은 '부는 사람 기준 바람 −z' 에서 시뮬한다(정규 좌표). 받는 쪽은 화면에서만 y축 180° (mirrorPose).
import { Table, DISC_R, mulberry32, simVersion, JUDGE } from './sim.js';
import * as Rules from './rules.js';

export const TRACK_HZ = 30;
export const POSE_BYTES = 13; // 1B id(6비트)+최대 성분 자리(2비트) · 6B 위치 int16×3 (×1/1000) · 6B 사원수 smallest-three int16×3
// 프레임에 넣는 기준 = '받는 쪽이 지금 보고 있는 자세'에서 벗어난 정도(오차 상한이 문턱 그대로). 문서 원안 '프레임 사이 0.002'는
// 같은 크기(20장 평균 8.4KB)인데 느린 미끄러짐(settle 압축이 풀리며 기어오름)을 놓쳐 0.037(상대 화면 ≈3px)까지 어긋나고 회전을 안 본다.
// 0.006 = 상대 차례 카메라(세로 50°, 거리 12)에서 0.46px, 회전 0.012rad = 테두리 0.9px. 20장 평균 8.5KB·p90 10.4KB (100샷 실측)
export const MOVE_EPS = 0.006; // 위치(축별)
export const ROT_EPS = 0.012; // 회전(라디안)
export const CHUNK_MAX = 3800; // room emit 조각 하나의 JSON UTF-8 상한(4KiB 안쪽 여유)
export const CANON_DIR = Object.freeze({ x: 0, z: -1 });

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const Q_POS = 1000;
const Q_ROT = 32767 / Math.SQRT1_2; // smallest-three 성분 범위 ±1/√2 → int16
const i16 = (v) => clamp(Math.round(v), -32767, 32767);
export const pidOf = (d) => d.pid ?? d.id;

// ── 코덱 ─────────────────────────────────────────────
export function encodePose(dv, off, id, p, q) {
  if (id < 0 || id > 63) throw new Error('pid 6비트 초과: ' + id);
  const c = [q.x, q.y, q.z, q.w];
  let li = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(c[i]) > Math.abs(c[li])) li = i;
  const s = c[li] < 0 ? -1 : 1; // q 와 −q 는 같은 회전 → 가장 큰 성분을 양수로
  dv.setUint8(off, (id << 2) | li);
  dv.setInt16(off + 1, i16(p.x * Q_POS), true);
  dv.setInt16(off + 3, i16(p.y * Q_POS), true);
  dv.setInt16(off + 5, i16(p.z * Q_POS), true);
  let k = 0;
  for (let i = 0; i < 4; i++) if (i !== li) { dv.setInt16(off + 7 + 2 * k, i16(c[i] * s * Q_ROT), true); k++; }
}
export function decodePose(dv, off) {
  const b = dv.getUint8(off), li = b & 3;
  const p = { x: dv.getInt16(off + 1, true) / Q_POS, y: dv.getInt16(off + 3, true) / Q_POS, z: dv.getInt16(off + 5, true) / Q_POS };
  const c = [0, 0, 0, 0];
  let k = 0, ss = 0;
  for (let i = 0; i < 4; i++) if (i !== li) { const v = dv.getInt16(off + 7 + 2 * k, true) / Q_ROT; c[i] = v; ss += v * v; k++; }
  c[li] = Math.sqrt(Math.max(0, 1 - ss));
  return { id: b >> 2, p, q: { x: c[0], y: c[1], z: c[2], w: c[3] } };
}
function poseOf(d) {
  const p = d.body.translation(), q = d.body.rotation();
  return { p: { x: p.x, y: p.y, z: p.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w } };
}
// 판 위 딱지 전부(pid 오름차순) → n×13B
export function encodeState(table) {
  const list = table.liveDiscs().slice().sort((a, b) => pidOf(a) - pidOf(b));
  const u8 = new Uint8Array(list.length * POSE_BYTES), dv = new DataView(u8.buffer);
  list.forEach((d, i) => { const { p, q } = poseOf(d); encodePose(dv, i * POSE_BYTES, pidOf(d), p, q); });
  return u8;
}
export function decodeState(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = [];
  for (let off = 0; off + POSE_BYTES <= u8.length; off += POSE_BYTES) out.push(decodePose(dv, off));
  return out;
}

// base64 (Node·브라우저 공통, 의존성 없음)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;
export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = u8[i + 1], c = u8[i + 2], n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? '=' : B64[(n >> 6) & 63]) + (c === undefined ? '=' : B64[n & 63]);
  }
  return s;
}
export function fromB64(s) {
  const len = s.length, pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((len / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const n = (B64I[s.charCodeAt(i)] << 18) | (B64I[s.charCodeAt(i + 1)] << 12) | ((B64I[s.charCodeAt(i + 2)] & 63) << 6) | (B64I[s.charCodeAt(i + 3)] & 63);
    out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
const byteLen = (str) => { let n = 0; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3; } return n; };
export const jsonBytes = (obj) => byteLen(JSON.stringify(obj));

// 64비트(32×2) 바이트 해시 → 16자 hex. 정수 연산만이라 엔진이 달라도 같은 바이트면 같은 값
export function hashBytes(u8) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < u8.length; i++) { const b = u8[i]; h1 = Math.imul(h1 ^ b, 2654435761); h2 = Math.imul(h2 ^ b, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
// 월드 상태 해시: 모든 딱지의 위치·회전 float64 원값 + 책상 밖(off) — 반올림 없음(같은 엔진 비트 동일 검사용)
export function hashState(table) {
  const list = table.discs.filter((d) => !d.removed).sort((a, b) => pidOf(a) - pidOf(b));
  const dv = new DataView(new ArrayBuffer(list.length * 8 * 9));
  let o = 0;
  for (const d of list) {
    const { p, q } = poseOf(d);
    for (const v of [pidOf(d), p.x, p.y, p.z, q.x, q.y, q.z, q.w, d.off ? 1 : 0]) { dv.setFloat64(o, v, true); o += 8; }
  }
  return hashBytes(new Uint8Array(dv.buffer));
}

// 같은 엔진·같은 규칙 확인용 버전(8자): sim(TUNE·JUDGE·Rapier) + 숨 규칙 상수 + 코덱
// 빌드가 넣는 물리·규칙·코덱 소스 해시(tools/build.mjs define). Node 도구에선 없음 → ''(pvpsync 는 Node 끼리만 비교)
const SIM_SRC = typeof __PUFF_SIMSRC__ !== 'undefined' ? __PUFF_SIMSRC__ : ''; // eslint-disable-line no-undef
export function shotSimV() {
  const r = [Rules.GREEN_LO, Rules.WEAK_ZERO, Rules.WEAK_FLOOR, Rules.WEAK_EXP, Rules.BLAST_SPAN, Rules.PHYS_SWEET, Rules.PHYS_SWEET_ONE, Rules.POWER_MAX, Rules.sweetHiFor(1), Rules.sweetHiFor(20), Rules.LIP_BACK, Rules.LIP_MIN];
  return hashBytes(new TextEncoder().encode(simVersion() + '|' + r.join(',') + `|${TRACK_HZ},${MOVE_EPS},${ROT_EPS},${POSE_BYTES}` + (SIM_SRC ? '|' + SIM_SRC : ''))).slice(0, 8);
}

// ── 화면용: 받는 쪽은 y축 180° (p' = (−x, y, −z), q' = qy(π)·q) ───────────
export function mirrorPose(p, q) {
  return { p: { x: -p.x, y: p.y, z: -p.z }, q: { x: q.z, y: q.w, z: -q.x, w: -q.y } };
}

// ── 녹화 ─────────────────────────────────────────────
// 받는 쪽이 가진 자세(마지막으로 보낸 13B)를 그대로 들고 있다가, 문턱을 넘게 달라진 딱지만 30Hz 프레임에 넣는다.
// 판정 스텝의 마지막 프레임은 문턱 0(바이트가 하나라도 다르면 넣음) → 재생 끝 = post 가 바이트 단위로 같다.
// 프레임 = [개수 u8][개수 × 13B]. frames[i] 는 (i+1)·spf 스텝 시각, 마지막 프레임은 판정 스텝.
export class TrackRecorder {
  constructor(table, { eps = MOVE_EPS, rotEps = ROT_EPS } = {}) {
    this.table = table;
    this.eps = eps;
    this.cosHalfRot = Math.cos(rotEps / 2);
    this.spf = Math.max(1, Math.round(1 / (TRACK_HZ * table.T.dt))); // 120Hz 물리 → 4스텝마다
    this.view = new Map(); // pid → { bytes, p, q } (받는 쪽이 지금 가진 자세)
    const pre = encodeState(table), dv = new DataView(pre.buffer);
    for (let off = 0; off < pre.length; off += POSE_BYTES) {
      const r = decodePose(dv, off);
      this.view.set(r.id, { bytes: pre.slice(off, off + POSE_BYTES), p: r.p, q: r.q });
    }
    this.pre = pre;
    this.frames = [];
    this.bytes = 0;
  }
  // 물리 스텝 n(1부터) 뒤에 부른다. last = 판정 스텝
  onStep(n, last) {
    if (!last && n % this.spf) return;
    const rows = [];
    const tmp = new Uint8Array(POSE_BYTES), tdv = new DataView(tmp.buffer);
    for (const d of this.table.liveDiscs()) {
      const id = pidOf(d), v = this.view.get(id), { p, q } = poseOf(d);
      if (!last) {
        const dot = Math.abs(q.x * v.q.x + q.y * v.q.y + q.z * v.q.z + q.w * v.q.w);
        const e = this.eps;
        if (Math.abs(p.x - v.p.x) <= e && Math.abs(p.y - v.p.y) <= e && Math.abs(p.z - v.p.z) <= e && dot >= this.cosHalfRot) continue;
      }
      encodePose(tdv, 0, id, p, q);
      if (last && tmp.every((b, i) => b === v.bytes[i])) continue;
      const bytes = tmp.slice();
      const r = decodePose(new DataView(bytes.buffer), 0);
      this.view.set(id, { bytes, p: r.p, q: r.q });
      rows.push(bytes);
    }
    const f = new Uint8Array(1 + rows.length * POSE_BYTES);
    f[0] = rows.length;
    rows.forEach((b, i) => f.set(b, 1 + i * POSE_BYTES));
    this.frames.push(f);
    this.bytes += f.length;
  }
  trackBytes() {
    const u8 = new Uint8Array(this.bytes);
    let o = 0;
    for (const f of this.frames) { u8.set(f, o); o += f.length; }
    return u8;
  }
}

// room emit 조각: 프레임 단위로 잘라 JSON {t, seq, f(첫 프레임 번호), b} 하나가 max 바이트 이하.
// 흘려보내기(simulate-ahead 중 녹화되는 대로): add(frame) 이 꽉 찬 조각을 돌려주고, maxFrames 마다(예: 8 = 0.27초) 끊어 받는 쪽이 일찍 재생을 시작하게.
// 크기는 정확히 계산한다: 봉투 JSON 바이트 + base64 4·⌈raw/3⌉ (base64 는 JSON 이스케이프가 없다)
export class TrackChunker {
  constructor(t, { max = CHUNK_MAX, maxFrames = Infinity } = {}) {
    Object.assign(this, { t, max, maxFrames, seq: 0, f: 0, cur: [], raw: 0 });
  }
  size(seq, f, raw) { return jsonBytes({ t: this.t, seq, f, b: '' }) + 4 * Math.ceil(raw / 3); }
  // 반환: 보낼 조각 배열(0~2개)
  add(frame) {
    const out = [];
    if (this.cur.length && this.size(this.seq, this.f, this.raw + frame.length) > this.max) out.push(this.flush());
    this.cur.push(frame);
    this.raw += frame.length;
    if (this.cur.length >= this.maxFrames) out.push(this.flush());
    return out;
  }
  flush() {
    if (!this.cur.length) return null;
    const u8 = new Uint8Array(this.raw);
    let o = 0;
    for (const fr of this.cur) { u8.set(fr, o); o += fr.length; }
    const c = { t: this.t, seq: this.seq++, f: this.f, b: toB64(u8) };
    this.f += this.cur.length;
    this.cur = [];
    this.raw = 0;
    return c;
  }
}
export function chunkTrack(frames, t, opts) {
  const ch = new TrackChunker(t, opts), out = [];
  for (const f of frames) out.push(...ch.add(f));
  const last = ch.flush();
  if (last) out.push(last);
  return out;
}

// ── 재생 ─────────────────────────────────────────────
// pre(13B×n) 에서 시작해 프레임을 차례로 적용. 화면은 poseAt(프레임 시각) 으로 프레임 사이를 보간(60Hz 화면에도 부드럽게).
// 끝 상태는 마지막으로 받은 13B 를 그대로 들고 있으므로(다시 인코딩하지 않음) endBytes() == post 가 바이트 단위로 성립한다.
export class TrackPlayer {
  constructor(pre, { mirror = false } = {}) {
    const u8 = typeof pre === 'string' ? fromB64(pre) : pre;
    this.mirror = mirror;
    this.raw = new Map();
    this.cur = new Map();
    this.prev = new Map();
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    for (let off = 0; off + POSE_BYTES <= u8.length; off += POSE_BYTES) {
      const r = decodePose(dv, off);
      this.raw.set(r.id, u8.slice(off, off + POSE_BYTES));
      this.cur.set(r.id, { p: r.p, q: r.q, f: 0 });
    }
    this.frames = []; // 받은 프레임(파싱됨)
    this.applied = 0;
  }
  // 조각(또는 통째 궤적 바이트) 받기. f = 첫 프레임 번호: 빈칸이면 false(→ db 샷 문서로 이어서)
  push(b, f = this.frames.length) {
    if (f !== this.frames.length) return false;
    const u8 = typeof b === 'string' ? fromB64(b) : b;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0;
    while (o < u8.length) {
      const n = u8[o++], rows = [];
      for (let k = 0; k < n; k++, o += POSE_BYTES) { const r = decodePose(dv, o); r.bytes = u8.slice(o, o + POSE_BYTES); rows.push(r); }
      this.frames.push(rows);
    }
    return true;
  }
  // 조각이 빠졌을 때: db 샷 문서의 통째 궤적에서 아직 못 받은 프레임부터 이어 붙인다
  resume(track) {
    const tmp = new TrackPlayer(new Uint8Array(0));
    tmp.push(track);
    for (let i = this.frames.length; i < tmp.frames.length; i++) this.frames.push(tmp.frames[i]);
    return this.frames.length;
  }
  get received() { return this.frames.length; }
  applyUntil(k) {
    k = Math.min(k, this.frames.length);
    for (; this.applied < k; this.applied++) {
      const i = this.applied;
      for (const r of this.frames[i]) {
        const c = this.cur.get(r.id);
        if (c) this.prev.set(r.id, { p: c.p, q: c.q, f: i }); // 프레임 i 시각까지는 앞 자세 그대로였다
        this.cur.set(r.id, { p: r.p, q: r.q, f: i + 1 });
        this.raw.set(r.id, r.bytes);
      }
    }
    return this.applied;
  }
  // tf = 재생 시각(프레임 단위, 경과 초 × 30). 반환: pid → {p, q} (mirror 면 받는 쪽 화면 좌표)
  poseAt(tf) {
    this.applyUntil(Math.ceil(tf));
    const out = new Map();
    for (const [id, c] of this.cur) {
      const pv = this.prev.get(id);
      let p = c.p, q = c.q;
      if (pv && tf < c.f && tf > pv.f) {
        const k = (tf - pv.f) / (c.f - pv.f);
        p = { x: pv.p.x + (c.p.x - pv.p.x) * k, y: pv.p.y + (c.p.y - pv.p.y) * k, z: pv.p.z + (c.p.z - pv.p.z) * k };
        q = nlerp(pv.q, c.q, k);
      } else if (pv && tf <= pv.f) { p = pv.p; q = pv.q; }
      out.set(id, this.mirror ? mirrorPose(p, q) : { p, q });
    }
    return out;
  }
  get done() { return this.applied >= this.frames.length; }
  endBytes() {
    const ids = [...this.raw.keys()].sort((a, b) => a - b);
    const u8 = new Uint8Array(ids.length * POSE_BYTES);
    ids.forEach((id, i) => u8.set(this.raw.get(id), i * POSE_BYTES));
    return u8;
  }
}
function nlerp(a, b, k) {
  const s = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = a.x + (b.x * s - a.x) * k, y = a.y + (b.y * s - a.y) * k, z = a.z + (b.z * s - a.z) * k, w = a.w + (b.w * s - a.w) * k;
  const l = Math.hypot(x, y, z, w) || 1;
  return { x: x / l, y: y / l, z: z / l, w: w / l };
}

// ── 한 턴 시뮬 (쏜 사람 = 심판, 받는 쪽의 뒤 검증도 같은 코드) ─────────────
// ids: 남은 판 id(오름차순), seeds: { puff, stack, beat } (sim.turnSeeds), input: { h, lat, power, mouthY?, ... } (power = 콩닥 반영한 유효 숨)
// 미리 시뮬(simulate-ahead): advance(k) 로 프레임마다 조금씩 돌려도, 한 번에 돌려도 같은 결과(스텝 판정 + 고정 호출 순서).
// 두 단계(P0.5a): new ShotRun({ ids, seeds }) = 턴 시작에 새 월드 쌓기·가라앉히기(조준 전, 20장 ≈70ms) → 놓을 때 fire(input).
//   input 을 생성자에 주면 곧바로 fire (P0 와 같은 한 번 호출, 호출 순서·난수 소비가 같아 기록이 바이트 단위로 같다 — pvpsync 로 확인)
export class ShotRun {
  constructor({ ids, seeds, input, cardOf, heavy, tune, overShake = 1, track }) {
    // 실험 jetLag(바람 도달 시간, 06 §8.10 · BLOCKERS G12)는 솔로 시험 토글 전용. shotSimV 는 전역 TUNE 만 해시하고 여기는 tune 을 안 넘기므로
    // 한쪽만 켜면 버전은 같은데 해시가 갈라진다(E10 뒤 검증이 조용히 실패) → PvP 에 넣으려면 방 문서·두 쪽 tune·shotSimV·pvp-check 를 먼저 바꿀 것
    if (tune && tune.jetLag != null) throw new Error('ShotRun: jetLag 는 솔로 시험 전용 — PvP 금지');
    // 고개 쓸기(푸어억, sim.js blowProg)는 솔로 '쓸기 연습판' 전용(docs/design/core-sweep.md §9). PvP 는 고전 조작·고전 물리만 — 들어오면 해시가 갈라지기 전에 막는다
    if (tune && tune.prog != null) throw new Error('ShotRun: 쓸기(prog)는 솔로 연습판 전용 — PvP 금지');
    const t = (this.table = Table.fromTurnState([...ids].sort((a, b) => a - b), seeds.stack, { cardOf, heavy, tune }));
    this.ids = t.discs.map(pidOf);
    this.seeds = { ...seeds };
    this.n = t.liveDiscs().length;
    this.overShake = overShake;
    this.trackOpts = track;
    this.fired = false;
    this.done = false;
    this.record = null;
    if (input) this.fire(input);
  }
  // 놓는 순간: 녹화 시작(pre) → 숨 해석(puffSeed) → 바람
  fire(input) {
    if (this.fired) throw new Error('ShotRun.fire: 이미 쐈다');
    if (input && input.jetLag != null) throw new Error('ShotRun.fire: jetLag 는 솔로 시험 전용 — PvP 금지');
    if (input && ((input.kind && input.kind !== 'classic') || input.prog != null)) throw new Error('ShotRun.fire: 쓸기(kind·prog)는 솔로 연습판 전용 — PvP 금지');
    this.fired = true;
    const t = this.table;
    this.input = { ...input };
    this.rec = new TrackRecorder(t, this.trackOpts);
    this.pre = this.rec.pre;
    const top = t.columnTop();
    // 숨 해석·떨림·텀블 난수는 모두 puffSeed 한 줄기 (솔로 match.rng 와 같은 소비 순서: resolveShot → blow 의 jitter → applyWind 텀블)
    const rng = mulberry32(this.seeds.puff >>> 0);
    const shot = (this.shot = Rules.resolveShot({ h: input.h, lat: input.lat || 0, power: input.power }, this.n, top, rng, this.overShake));
    t.rng = rng;
    // main.js shotGeometry 와 같은 기하(표적 = 곡면 위 c − D·√(1−lat²) + side·lat), D = 정규 좌표 −z
    const D = CANON_DIR, side = { x: -D.z, z: D.x }, c = t.pileCenter();
    const lat = clamp(shot.lat || 0, -0.95 * DISC_R, 0.95 * DISC_R), back = Math.sqrt(DISC_R * DISC_R - lat * lat);
    const aim = { x: c.x - D.x * back + side.x * lat, y: shot.h, z: c.z - D.z * back + side.z * lat };
    this.aim = aim;
    t.blow({ aim, dir: { x: D.x, z: D.z }, power: shot.power, blast: shot.blast || 0, ...(input.mouthY != null ? { mouthY: input.mouthY } : {}) });
    if (t.air || t.puff?.lag) throw new Error('ShotRun.fire: jetLag 가 켜진 숨 — PvP 금지'); // 위 blow 는 jetLag 를 안 넘긴다(방어)
    this.judge = { n: 0, quiet: 0 };
    return this;
  }
  // 최대 maxSteps 스텝 진행. 판정되면 true
  advance(maxSteps = Infinity) {
    if (!this.fired) return false;
    const t = this.table;
    for (let k = 0; k < maxSteps && !this.done; k++) {
      t.step();
      const end = t.stepJudge(this.judge);
      this.rec.onStep(this.judge.n, end);
      if (end) this.finish();
    }
    return this.done;
  }
  get steps() { return this.judge ? this.judge.n : 0; }
  // WASM 메모리 돌려주기(턴마다 새 월드라 안 하면 쌓인다). 그 뒤로는 이 월드의 몸체를 만지면 안 된다
  free() { if (!this.freed) { this.freed = true; this.table.world.free(); } }
  finish() {
    const t = this.table, r = t.judgeResult();
    const track = this.rec.trackBytes();
    const post = encodeState(t);
    this.done = true;
    this.record = {
      v: 1,
      simV: shotSimV(),
      seeds: this.seeds,
      ids: this.ids,
      in: this.input,
      shot: { h: this.shot.h, lat: this.shot.lat || 0, power: this.shot.power, blast: this.shot.blast || 0 },
      pre: toB64(this.pre),
      post: toB64(post),
      track: { hz: TRACK_HZ, spf: this.rec.spf, frames: this.rec.frames.length, steps: this.judge.n, b: toB64(track) },
      res: { flipped: r.flipped.map(pidOf).sort((a, b) => a - b), outs: r.outs.map(pidOf).sort((a, b) => a - b), ratio: this.shot.ratio, blast: this.shot.blast || 0 },
      hash: hashState(t), // 쏜 사람 월드 원값 해시(뒤 검증 비교용)
      qhash: hashBytes(post), // post(양자화) 해시 = 재생 끝 해시
    };
    return this.record;
  }
}

// ── 콩닥 숨: 고정 30Hz 하위 스텝 (§2.1 일관성 4) ─────────────
// 솔로는 rAF 간격(16.7ms / 8.3ms)으로 박동을 적분 → 60Hz·120Hz 폰의 박동 위상이 조금씩 다르다. PvP 는 1/30초 하위 스텝으로만 적분하고,
// 하위 스텝마다 그때의 당긴 숨을 trace 에 남긴다 → (beatSeed, tier, n, trace) 만으로 누구나(나중엔 서버가) 유효 숨을 다시 계산한다.
// 놓는 순간은 마지막으로 끝난 하위 스텝의 박동을 쓴다(최대 33ms 앞 — 솔로의 '50ms 앞당김'과 같은 방향의 고정 보정).
export const BEAT_SUB_MS = 1000 / 30;
export class BeatClock {
  constructor(beatSeed, tier, n) {
    this.tier = tier;
    this.hi = Rules.sweetHiFor(n);
    this.rng = mulberry32(beatSeed >>> 0);
    this.st = { ph: 0, k: 0, u: 0 };
    this.k = 0; // 끝난 하위 스텝 수
    this.off = 0;
    this.trace = []; // 하위 스텝마다 당긴 숨(u12 = 숨/POWER_MAX·4095)
  }
  // 누른 뒤 tMs 까지 하위 스텝을 진행. power = 지금 당긴 숨(아직 안 끝난 하위 스텝들에 쓰임). 반환 = 유효 숨
  to(tMs, power) {
    const q = Math.round(clamp(power, 0, Rules.POWER_MAX) / Rules.POWER_MAX * 4095);
    while ((this.k + 1) * BEAT_SUB_MS <= tMs) this.sub(q);
    return this.eff(); // 마지막으로 끝난 하위 스텝 기준(그래야 replay 와 비트 단위로 같다)
  }
  sub(q) {
    const p = (q / 4095) * Rules.POWER_MAX;
    this.k++;
    this.trace.push(q);
    this.off = Rules.beatStep(this.st, BEAT_SUB_MS, this.k * BEAT_SUB_MS, p / Rules.POUCH_FULL, this.tier, this.rng);
  }
  eff(q = this.trace.at(-1) ?? 0) { return clamp((q / 4095) * Rules.POWER_MAX + this.hi * this.off, 0, Rules.POWER_MAX); }
  // 다시 계산: trace 를 처음부터 → 놓는 순간 유효 숨
  static replay(beatSeed, tier, n, trace) {
    const c = new BeatClock(beatSeed, tier, n);
    for (const q of trace) c.sub(q);
    return c.eff();
  }
}

// 한 번에 끝까지
export function runShot(opts) {
  const run = new ShotRun(opts);
  run.advance();
  return { record: run.record, run };
}

// 받는 쪽 뒤 검증: 같은 입력을 자기 새 월드에서 다시 시뮬 → hashVerifier. 화면에는 손대지 않는다
export function verifyShot(record, opts = {}) {
  const { record: mine } = runShot({ ids: record.ids, seeds: record.seeds, input: record.in, ...opts });
  return { hashVerifier: mine.hash, sameEngine: mine.simV === record.simV, same: mine.hash === record.hash && mine.post === record.post };
}

// ── 화면용 꼭두각시 월드 (P0.5a) ─────────────
// 13B 자세들(pre 등)로 딱지를 그 자리에 놓기만 한 월드. 스텝을 돌리지 않는다 — 재생 중엔 궤적 자세를 그대로 꽂는다.
// d.id = d.pid = 판 id → main.js 의 메시·판정·영수증 코드(d.id 기준)가 턴이 바뀌어도 같은 딱지를 가리킨다.
// mirror = 받는 쪽 화면(y축 180°). faceUp·inCircle 은 y축 회전에 불변이라 판정 화면이 그대로 맞는다.
export function puppetTable(pre, { cardOf, mirror = false } = {}) {
  const u8 = typeof pre === 'string' ? fromB64(pre) : pre;
  const rows = decodeState(u8);
  const t = new Table(1);
  t.addPile(rows.map((r) => (cardOf ? cardOf(r.id) : r.id)));
  t.discs.forEach((d, i) => {
    const r = rows[i];
    d.id = d.pid = r.id;
    setPose(d, mirror ? mirrorPose(r.p, r.q) : r);
  });
  t.puppet = true;
  return t;
}
export function setPose(d, { p, q }) {
  d.body.setTranslation(p, false);
  d.body.setRotation(q, false);
}
// 꼭두각시 자세를 13B 자세들로 다시 맞춤(같은 판 id 집합)
export function posePuppet(t, pre, mirror = false) {
  const u8 = typeof pre === 'string' ? fromB64(pre) : pre;
  const byId = new Map(t.liveDiscs().map((d) => [d.id, d]));
  for (const r of decodeState(u8)) { const d = byId.get(r.id); if (d) setPose(d, mirror ? mirrorPose(r.p, r.q) : r); }
}

// 콩닥 trace(u12 배열) ↔ b64 (u16 LE). 샷 문서에만 싣는다(받는 쪽·나중 서버가 BeatClock.replay 로 유효 숨을 다시 계산)
export function traceToB64(trace) {
  const u8 = new Uint8Array(trace.length * 2);
  trace.forEach((v, i) => { u8[2 * i] = v & 255; u8[2 * i + 1] = v >> 8; });
  return toB64(u8);
}
export function traceFromB64(s) {
  const u8 = fromB64(s), out = [];
  for (let i = 0; i + 1 < u8.length; i += 2) out.push(u8[i] | (u8[i + 1] << 8));
  return out;
}

export { JUDGE };
