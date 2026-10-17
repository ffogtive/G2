// net.js — PvP 네트워크 한 겹 (P0.5a). 렌더러 독립.
//
// 🧭 가설: 게임 코드가 아티팩트 capability 와 같은 모양(net.db.doc/collection · net.room.join → NamedRoom · net.user.id)만 쓰면
//   LocalNet(같은 브라우저 두 탭: BroadcastChannel + localStorage) → ArtifactNet(P0.5b, claude.use('db'|'room'|'user'))
//   교체가 어댑터 한 장으로 끝난다. 판가름 = tools/pvp-check.mjs 가 이 모양만으로 3판을 끝까지 두는가.
//
// Net 인터페이스 (docs/design/items-pvp.md §2.1, 아티팩트 db.d.ts·room.d.ts·user.d.ts 의 부분집합):
//   net.kind                         'local' | 'artifact'
//   net.uid                          내 id (db 경로 p/{uid}/…, data/users/{uid}/…)
//   net.codeLen                      방 코드 길이(LocalNet 4 · ArtifactNet 6)
//   net.user.me() / id() / can() / profiles(ids) → { [id]: {id, name, …} }
//   net.db.doc(path)                 { id, path, get() → {exists, data()}, set(obj), update(obj), delete(), acquire({holder, ttlMs}), onSnapshot(next, err) → unsub, collection(p) }
//   net.db.collection(path)          { path, doc(id?), get() → {docs, size, empty, docChanges()}, onSnapshot(next, err) → unsub }
//   net.room.join(name) → NamedRoom  { name, emit(topic, data), on(topic, h) → unsub, presence(patch), peers(), onPeers(h) → unsub, connected(), onConnection(h), leave() }
//   net.meter                        상한 위반·크기 기록 (LocalNet 은 강제, ArtifactNet 은 플랫폼이 강제하고 여기선 기록만)
//
// LocalNet 은 상한을 실제와 같은 계산으로 강제한다: emit·presence = JSON UTF-8 4KiB, 문서 256KiB·깊이 32, 경로 문법(짝수=문서·홀수=컬렉션),
// 선언된 주제만(blow·trk·done, 나머지 not_permitted), emit+presence 초당 40·버스트 80(넘친 emit 은 버려짐, presence 는 기다림).

export const LIMITS = Object.freeze({ emit: 4096, presence: 4096, doc: 256 * 1024, depth: 32, rate: 40, burst: 80, topics: Object.freeze(['blow', 'trk', 'done']) });
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0 O 1 I L 을 뺀 31자
const TOPIC_RE = /^[a-z][a-z0-9_.-]{0,47}$/;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const SEG_RE = /^[A-Za-z0-9_\-.~:@+]+$/;

const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
export const utf8 = (s) => (enc ? enc.encode(s).length : unescape(encodeURIComponent(s)).length);
export const jsonBytes = (v) => utf8(JSON.stringify(v ?? null));
const err = (code, message) => Object.assign(new Error(message), { code });
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
function depth(v, d = 1) {
  if (v && typeof v === 'object') { let m = d; for (const k in v) m = Math.max(m, depth(v[k], d + 1)); return m; }
  return d;
}
function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k in o) deepFreeze(o[k]); } return o; }
function randId(n = 12) { let s = ''; const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const r = new Uint8Array(n); (globalThis.crypto?.getRandomValues?.(r)) || r.forEach((_, i) => { r[i] = Math.random() * 256; }); for (const x of r) s += a[x % a.length]; return s; }
export function makeCode(len = 4) {
  const r = new Uint8Array(len);
  globalThis.crypto?.getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 256; });
  let s = '';
  for (const x of r) s += CODE_ALPHABET[x % CODE_ALPHABET.length];
  return s;
}
export function checkPath(path, parity) {
  if (typeof path !== 'string' || !path) throw new TypeError('path: empty');
  const segs = path.split('/');
  if (segs.length > 16 || utf8(path) > 1000) throw new TypeError('path: too long ' + path);
  for (const s of segs) if (!SEG_RE.test(s) || s === '.' || s === '..' || utf8(s) > 200) throw new TypeError('path segment: "' + s + '" in ' + path);
  if (segs.length % 2 !== parity) throw new TypeError(`path parity: ${segs.length} segments (${parity ? 'collection needs odd' : 'document needs even'}) ${path}`);
}

// URL 토글: ?pvplocal 또는 #pvplocal (아티팩트 iframe 은 둘 다 못 붙인다 → 거기선 LocalNet 이 안 켜짐)
export function param(name) {
  if (typeof location === 'undefined') return null;
  const s = (location.search || '') + '&' + (location.hash || '').replace(/^#/, '');
  const m = new RegExp('(?:^|[?&#])' + name + '(?:=([^&#]*))?(?:&|#|$)').exec(s);
  return m ? decodeURIComponent(m[1] ?? '') : null;
}

// ── 계량기: 상한 위반·크기 ─────────────────────────
export class Meter {
  constructor() {
    this.violations = [];
    this.count = { emit: 0, presence: 0, docWrite: 0, dropped: 0 };
    this.max = { emit: 0, presence: 0, doc: 0 };
    this.byTopic = {};
  }
  violation(kind, detail) {
    this.violations.push({ kind, detail, at: Date.now() });
    console.warn('[net] 상한 위반', kind, JSON.stringify(detail));
  }
  topic(t, bytes) { const o = (this.byTopic[t] ||= { n: 0, max: 0, sum: 0 }); o.n++; o.sum += bytes; o.max = Math.max(o.max, bytes); }
  // 플랫폼이 돌려준 오류(코드별 수 + 최근 20개) — 사람 시험 때 window.__pvpMeter() 로 본다
  fail(kind, e) {
    const code = (e && e.code) || 'error';
    this.errors = this.errors || { n: {}, last: [] };
    this.errors.n[code] = (this.errors.n[code] || 0) + 1;
    this.errors.last.push({ kind, code, message: String((e && e.message) || e).slice(0, 160), at: Date.now() });
    if (this.errors.last.length > 20) this.errors.last.shift();
  }
  summary() { return { violations: this.violations, count: this.count, max: this.max, byTopic: this.byTopic, errors: this.errors || null }; }
}

// ── LocalNet: 같은 브라우저의 두 탭 ─────────────────────────
// uid = 탭마다(sessionStorage → 새로고침해도 같은 사람 = 재접속 시험). peer = 페이지 로드마다 새로(아티팩트와 같음).
// lag(ms): room·db 알림을 늦춰 실제 네트워크 흉내(?pvplag=60).
const DB_KEY = 'pn1:';
const LEASE_KEY = 'pn1L:';

export class LocalNet {
  constructor({ lag = 0, uid } = {}) {
    this.kind = 'local';
    this.lag = Math.max(0, +lag || 0);
    let u = uid;
    if (!u) { try { u = sessionStorage.getItem('pn1-uid'); } catch (e) { /* 없음 */ } }
    if (!u) { u = 'u_' + randId(10); try { sessionStorage.setItem('pn1-uid', u); } catch (e) { /* 없음 */ } }
    this.uid = u;
    this.peer = 'p' + randId(15);
    this.meter = new Meter();
    this.tokens = LIMITS.burst;
    this.tokAt = now();
    this.rooms = new Map();
    this.db = new LocalDb(this);
    this.room = { join: (name) => this.join(name) };
    const nick = 'Tab ' + this.uid.slice(-4).toUpperCase();
    this.user = {
      id: async () => this.uid,
      me: async () => ({ id: this.uid, name: nick, avatarUrl: '', color: '#3a8fe0', email: null, isOwner: true, canEdit: true }),
      can: async () => true,
      // 아티팩트 user.profiles 와 같은 모양: { [id]: Profile } (넘긴 id 마다 한 칸)
      profiles: async (ids) => Object.fromEntries([...new Set([].concat(ids))].map((id) => [id, { id, name: 'Tab ' + String(id).slice(-4).toUpperCase(), avatarUrl: '', color: '#3a8fe0', email: null, isMe: id === this.uid, guest: false }])),
    };
    this.codeLen = 4;
  }
  // emit·presence 공용 예산(초당 40, 버스트 80)
  take() {
    const t = now();
    this.tokens = Math.min(LIMITS.burst, this.tokens + ((t - this.tokAt) / 1000) * LIMITS.rate);
    this.tokAt = t;
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    return false;
  }
  later(fn) { if (this.lag) setTimeout(fn, this.lag); else setTimeout(fn, 0); }
  async join(name) {
    if (!ROOM_RE.test(name)) throw err('invalid_argument', 'room name: ' + name);
    if (!this.rooms.has(name)) this.rooms.set(name, new LocalRoom(this, name));
    return this.rooms.get(name);
  }
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class LocalDb {
  constructor(net) {
    this.net = net;
    this.subs = new Map(); // 'd:'+path | 'c:'+collPath → Set<fn>
    // 다른 탭의 쓰기 알림은 'storage' 이벤트로 받는다. BroadcastChannel 로 알리고 localStorage 를 읽으면, 탭이 다른 렌더러 프로세스일 때
    // 알림이 저장소 반영보다 먼저 와서 옛 값을 읽고(→ 같은 값이라 다시 안 알림) 영영 놓친다(실측: 참가자가 로비에서 멈춤, 샷 문서 놓침).
    // storage 이벤트는 그 탭의 저장소 보기가 갱신된 뒤에 온다.
    if (typeof window !== 'undefined') window.addEventListener('storage', (e) => {
      if (!e.key || !e.key.startsWith(DB_KEY)) return;
      const path = e.key.slice(DB_KEY.length);
      if (this.net.lag) setTimeout(() => this.changed(path), this.net.lag); else this.changed(path);
    });
  }
  read(path) {
    try { const s = localStorage.getItem(DB_KEY + path); return s == null ? null : JSON.parse(s); } catch (e) { return null; }
  }
  write(path, data) {
    const m = this.net.meter;
    if (data != null) {
      const json = JSON.stringify(data);
      const bytes = utf8(json);
      m.count.docWrite++;
      m.max.doc = Math.max(m.max.doc, bytes);
      if (bytes > LIMITS.doc) { m.violation('doc', { path, bytes }); throw err('invalid_argument', `document over 256 KiB (${bytes} B): ${path}`); }
      if (depth(data) > LIMITS.depth) { m.violation('depth', { path }); throw err('invalid_argument', 'document too deep: ' + path); }
      try { localStorage.setItem(DB_KEY + path, json); } catch (e) { m.violation('quota', { path, bytes }); throw err('quota_exceeded', 'local storage full'); }
    } else {
      try { localStorage.removeItem(DB_KEY + path); } catch (e) { /* 무시 */ }
    }
    setTimeout(() => this.changed(path), 0); // 내 탭의 구독자(내 쓰기는 바로 보임). 다른 탭은 storage 이벤트
  }
  changed(path) {
    const coll = path.slice(0, path.lastIndexOf('/'));
    for (const key of ['d:' + path, 'c:' + coll]) for (const fn of [...(this.subs.get(key) || [])]) { try { fn(); } catch (e) { console.error(e); } }
  }
  sub(key, fn) {
    if (!this.subs.has(key)) this.subs.set(key, new Set());
    this.subs.get(key).add(fn);
    return () => this.subs.get(key)?.delete(fn);
  }
  list(coll) {
    const pre = DB_KEY + coll + '/', out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(pre) && !k.slice(pre.length).includes('/')) out.push(k.slice(pre.length));
      }
    } catch (e) { /* 무시 */ }
    return out.sort();
  }
  doc(path) { checkPath(path, 0); return new LocalDocRef(this, path); }
  collection(path) { checkPath(path, 1); return new LocalCollRef(this, path); }
}
function docSnap(id, data) {
  const d = data == null ? undefined : deepFreeze(clone(data));
  return Object.freeze({ id, exists: data != null, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } });
}
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = merge(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}
class LocalDocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.slice(path.lastIndexOf('/') + 1); }
  async get() { return docSnap(this.id, this.db.read(this.path)); }
  async set(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw err('invalid_argument', 'set: body must be an object');
    this.db.write(this.path, clone(data));
  }
  async update(data) {
    const cur = this.db.read(this.path);
    if (cur == null) throw err('invalid_argument', 'update: document does not exist ' + this.path);
    this.db.write(this.path, merge(cur, data));
  }
  async delete() { this.db.write(this.path, null); }
  async acquire({ holder, ttlMs = 30000, data } = {}) {
    const ttl = Math.max(1000, Math.min(600000, ttlMs || 30000));
    const key = LEASE_KEY + this.path, t = Date.now();
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { cur = null; }
    if (cur && cur.exp > t && cur.holder !== holder) return { acquired: false, expiresAt: new Date(cur.exp).toISOString() };
    const exp = t + ttl;
    try { localStorage.setItem(key, JSON.stringify({ holder, exp })); } catch (e) { /* 무시 */ }
    if (data) { const body = this.db.read(this.path) || {}; this.db.write(this.path, merge(body, data)); }
    return { acquired: true, holder, expiresAt: new Date(exp).toISOString(), version: t };
  }
  onSnapshot(next, onErr) {
    let alive = true, last;
    const fire = () => {
      if (!alive) return;
      const raw = this.db.read(this.path), s = JSON.stringify(raw);
      if (s === last) return; // 안 바뀌었으면 다시 안 줌
      last = s;
      next(docSnap(this.id, raw));
    };
    const un = this.db.sub('d:' + this.path, fire);
    setTimeout(fire, 0);
    return () => { alive = false; un(); };
  }
  collection(sub) { return this.db.collection(this.path + '/' + sub); }
}
class LocalCollRef {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return this.db.doc(this.path + '/' + (id || randId(20))); }
  async add(data) { const r = this.doc(); await r.set(data); return r; }
  snap(prev) {
    const docs = this.db.list(this.path).map((id) => docSnap(id, this.db.read(this.path + '/' + id))).filter((d) => d.exists);
    const changes = [];
    const old = prev || new Map();
    docs.forEach((d, i) => { const o = old.get(d.id); if (!o) changes.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i }); else if (JSON.stringify(o.data()) !== JSON.stringify(d.data())) changes.push({ type: 'modified', doc: d, oldIndex: -1, newIndex: i }); });
    for (const [id, o] of old) if (!docs.some((d) => d.id === id)) changes.push({ type: 'removed', doc: o, oldIndex: -1, newIndex: -1 });
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  async get() { return this.snap(); }
  onSnapshot(next) {
    let alive = true, prev = null;
    const fire = () => {
      if (!alive) return;
      const s = this.snap(prev);
      if (prev && !s.docChanges().length) return;
      prev = new Map(s.docs.map((d) => [d.id, d]));
      next(s);
    };
    const un = this.db.sub('c:' + this.path, fire);
    setTimeout(fire, 0);
    return () => { alive = false; un(); };
  }
}

// ── 방(room) ─────────────────────────
// 다른 탭에는 BroadcastChannel, 내 탭에는 echo(isMe·sameTab). presence 는 30Hz 이하로 합쳐 보내고, 1초마다 살아 있음 신호, 3.5초 안 들리면 left.
class LocalRoom {
  constructor(net, name) {
    this.net = net;
    this.name = name;
    this.bc = new BroadcastChannel('pn1-room-' + name);
    this.bc.onmessage = (e) => this.recv(e.data);
    this.handlers = new Map();
    this.peerSubs = new Set();
    this.connSubs = new Set();
    this.pres = {};
    this.peerMap = new Map();
    this.pending = { joined: new Map(), left: new Map(), updated: new Map() };
    this.left = false;
    this.me = this.mkPeer({ peer: net.peer, by: net.uid }, {});
    this.peerMap.set(net.peer, { p: this.me, seen: now() });
    this.pending.joined.set(net.peer, this.me);
    this.send({ k: 'hello', presence: this.pres }, true);
    this.hb = setInterval(() => { this.send({ k: 'hb' }, true); this.prune(); }, 1000);
    this.onUnload = () => this.send({ k: 'bye' }, true, true);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onUnload);
    this.flushPeers();
  }
  mkPeer(src, presence, at = Date.now()) {
    const isMe = src.by != null && src.by === this.net.uid;
    return Object.freeze({ peer: src.peer, by: src.by ?? null, isMe, sameTab: src.peer === this.net.peer, kind: 'viewer', guest: false, presence: deepFreeze(clone(presence) || {}), updatedAt: at });
  }
  // sys = 플랫폼 내부(살아 있음·hello·bye): 예산에 안 셈. now = 페이지가 닫힐 때 지연 없이
  send(msg, sys = false, nowSend = false) {
    if (this.left && !nowSend) return;
    const m = { ...msg, peer: this.net.peer, by: this.net.uid };
    if (this.net.lag && !nowSend) setTimeout(() => { try { this.bc.postMessage(m); } catch (e) { /* 닫힘 */ } }, this.net.lag);
    else { try { this.bc.postMessage(m); } catch (e) { /* 닫힘 */ } }
  }
  recv(m) {
    if (this.left || !m || m.peer === this.net.peer) return;
    const known = this.peerMap.get(m.peer);
    if (m.k === 'bye') { if (known) { this.peerMap.delete(m.peer); this.pending.left.set(m.peer, known.p); this.flushPeers(); } return; }
    if (!known) {
      const p = this.mkPeer(m, m.presence || {});
      this.peerMap.set(m.peer, { p, seen: now() });
      this.pending.joined.set(m.peer, p);
      this.flushPeers();
      if (m.k !== 'pres') this.send({ k: 'pres', presence: this.pres }, true); // 새로 온 사람에게 내 presence 를 건넨다
    } else known.seen = now();
    if (m.k === 'pres' && known) {
      const p = this.mkPeer(m, m.presence || {});
      this.peerMap.set(m.peer, { p, seen: now() });
      this.pending.updated.set(m.peer, p);
      this.flushPeers();
    }
    if (m.k === 'hello' && known) this.send({ k: 'pres', presence: this.pres }, true); // 새로고침한 사람(같은 peer 는 아님) — 방어
    if (m.k === 'emit') this.dispatch({ topic: m.topic, data: clone(m.data), peer: m.peer, by: m.by ?? null, isMe: m.by === this.net.uid, sameTab: false, kind: 'viewer', guest: false });
  }
  dispatch(msg) {
    Object.freeze(msg);
    for (const h of [...(this.handlers.get(msg.topic) || [])]) { try { h(msg); } catch (e) { console.error(e); } }
  }
  prune() {
    const t = now();
    for (const [peer, v] of this.peerMap) if (peer !== this.net.peer && t - v.seen > 3500) { this.peerMap.delete(peer); this.pending.left.set(peer, v.p); }
    this.flushPeers();
  }
  flushPeers() {
    if (this.flushT) return;
    this.flushT = setTimeout(() => {
      this.flushT = null;
      const { joined, left, updated } = this.pending;
      if (!joined.size && !left.size && !updated.size) return;
      const ch = { peers: this.peers(), joined: [...joined.values()], left: [...left.values()], updated: [...updated.values()].filter((p) => !joined.has(p.peer)) };
      this.pending = { joined: new Map(), left: new Map(), updated: new Map() };
      for (const h of [...this.peerSubs]) { try { h(ch); } catch (e) { console.error(e); } }
    }, 16);
  }
  peers() { return Object.freeze([...this.peerMap.values()].map((v) => v.p)); }
  onPeers(h) {
    this.peerSubs.add(h);
    setTimeout(() => { if (this.peerSubs.has(h)) h({ peers: this.peers(), joined: this.peers(), left: [], updated: [] }); }, 0);
    return () => this.peerSubs.delete(h);
  }
  on(topic, h) {
    if (typeof h !== 'function') throw new TypeError('handler');
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set());
    this.handlers.get(topic).add(h);
    return () => this.handlers.get(topic)?.delete(h);
  }
  async emit(topic, data) {
    const m = this.net.meter;
    if (this.left) throw err('invalid_argument', 'left room');
    if (!TOPIC_RE.test(topic)) { m.violation('topicName', { topic }); throw err('invalid_argument', 'topic: ' + topic); }
    if (!LIMITS.topics.includes(topic)) { m.violation('topic', { topic }); throw err('not_permitted', 'topic not declared: ' + topic); }
    const bytes = jsonBytes(data);
    m.count.emit++;
    m.max.emit = Math.max(m.max.emit, bytes);
    m.topic(topic, bytes);
    if (bytes > LIMITS.emit) { m.violation('emit', { topic, bytes }); throw err('invalid_argument', `emit over 4 KiB (${bytes} B)`); }
    if (!this.net.take()) { m.count.dropped++; m.violation('rate', { topic }); return; } // 플랫폼처럼 조용히 버림(그리고 센다)
    const own = { topic, data: clone(data), peer: this.net.peer, by: this.net.uid, isMe: true, sameTab: true, kind: 'viewer', guest: false };
    setTimeout(() => this.dispatch(own), 0);
    this.send({ k: 'emit', topic, data });
  }
  async presence(patch) {
    if (this.left) throw err('invalid_argument', 'left room');
    const next = { ...this.pres };
    for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete next[k]; else next[k] = clone(v); }
    const bytes = jsonBytes(next), m = this.net.meter;
    m.count.presence++;
    m.max.presence = Math.max(m.max.presence, bytes);
    if (bytes > LIMITS.presence) { m.violation('presence', { bytes }); throw err('invalid_argument', `presence over 4 KiB (${bytes} B)`); }
    this.pres = next;
    this.me = this.mkPeer({ peer: this.net.peer, by: this.net.uid }, next);
    this.peerMap.set(this.net.peer, { p: this.me, seen: now() });
    this.pending.updated.set(this.net.peer, this.me);
    this.flushPeers();
    this.schedulePres();
  }
  // 30Hz 이하로 합쳐 보내기. 예산이 없으면 기다린다(presence 는 버리지 않음)
  schedulePres() {
    if (this.presT) return;
    const wait = Math.max(0, 33 - (now() - (this.presAt || 0)));
    this.presT = setTimeout(() => {
      this.presT = null;
      if (this.left) return;
      if (!this.net.take()) { this.schedulePres(); return; }
      this.presAt = now();
      this.send({ k: 'pres', presence: this.pres });
    }, wait);
  }
  connected() { return !this.left; }
  onConnection(h) { setTimeout(() => h(!this.left), 0); this.connSubs.add(h); return () => this.connSubs.delete(h); }
  async leave() {
    if (this.left) return;
    this.send({ k: 'bye' }, true, true);
    this.left = true;
    clearInterval(this.hb);
    clearTimeout(this.presT);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onUnload);
    try { this.bc.close(); } catch (e) { /* 무시 */ }
    this.net.rooms.delete(this.name);
  }
}

// ── ArtifactNet: claude.ai 아티팩트 capability (P0.5b) ─────────────────────────
// 🧭 가설: 아티팩트 db·room·user 는 이미 Net 과 같은 모양이라, 어댑터는 (1) 크기 기록(플랫폼이 강제하니 여기선 계량만)
//   (2) 일시 오류 한 번 다시(db unavailable, room upstream_error) (3) 끝난 방·죽은 구독 다시 잇기 (4) user.profiles 모양 맞추기 — 이 넷이면 된다.
//   판가름 = 가짜 claude(LocalNet 위에 아티팩트 API 모양, tools/fake-claude.js)로 아티팩트 빌드 두 페이지가 pvp-check 3판을 끝까지 두는가.
// 선언(docs/design/items-pvp.md §2.1 선언 JSON): db rules(matches·p·p/{self}·data/users/{self}) · room topics blow·trk·done = interact · user profile.
const TERMINAL = new Set(['revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 동사 한 번 다시: db 'unavailable' 은 문서가 '짧은 무작위 지연 뒤 한 번' 다시 하라고 한다(set = 전체 교체, update = 절댓값 병합 → 두 번 써도 같다)
async function again(fn, codes) {
  try { return await fn(); } catch (e) {
    if (!e || !codes.includes(e.code)) throw e;
    await sleep(300 + Math.random() * 700);
    return fn();
  }
}
const DB_RETRY = ['unavailable'];
// 구독이 끝나면(다리가 멈춘 unavailable · 잠깐 넘친 resource_exhausted) 새로 구독하는 것만이 복구 → 몇 번 다시 건다. 나머지 코드는 err 로 넘김
function resub(open, next, onErr, meter, what) {
  let un = null, alive = true, tries = 0;
  const sub = () => {
    un = open((s) => { tries = 0; if (alive) next(s); }, (e) => {
      if (!alive) return;
      meter.fail(what, e);
      if (e && (e.code === 'unavailable' || e.code === 'resource_exhausted' || e.code === 'queue_overflow') && tries < 6) { tries++; setTimeout(() => { if (alive) sub(); }, 1500 * tries); }
      else onErr?.(e);
    });
  };
  sub();
  return () => { alive = false; try { un?.(); } catch (e) { /* 무시 */ } };
}
class ArtDb {
  constructor(net, db) { this.net = net; this.d = db; }
  doc(path) { return new ArtDocRef(this, this.d.doc(path)); }
  collection(path) { return new ArtCollRef(this, this.d.collection(path)); }
  // 쓰기 크기 기록. 256KiB·깊이 32 를 넘으면 보내지 않고 바로 invalid_argument(플랫폼과 같은 답)
  meterDoc(path, data, patch = false) {
    const m = this.net.meter, bytes = jsonBytes(data);
    m.count.docWrite++;
    m.max.doc = Math.max(m.max.doc, bytes);
    if (bytes > LIMITS.doc) { m.violation('doc', { path, bytes, patch }); throw err('invalid_argument', `document over 256 KiB (${bytes} B): ${path}`); }
    if (depth(data) > LIMITS.depth) { m.violation('depth', { path }); throw err('invalid_argument', 'document too deep: ' + path); }
  }
  wrapErr(p) { return p.catch((e) => { this.net.meter.fail('db', e); throw e; }); }
}
class ArtDocRef {
  constructor(db, ref) { this.db = db; this.r = ref; this.id = ref.id; this.path = ref.path; }
  get() { return this.db.wrapErr(again(() => this.r.get(), DB_RETRY)); }
  async set(data) { this.db.meterDoc(this.path, data); return this.db.wrapErr(again(() => this.r.set(data), DB_RETRY)); }
  async update(data) { this.db.meterDoc(this.path, data, true); return this.db.wrapErr(again(() => this.r.update(data), DB_RETRY)); }
  delete() { return this.db.wrapErr(again(() => this.r.delete(), DB_RETRY)); }
  acquire(o) { return this.db.wrapErr(again(() => this.r.acquire(o), DB_RETRY)); }
  onSnapshot(next, onErr) { return resub((n, e) => this.r.onSnapshot(n, e), next, onErr, this.db.net.meter, 'snap:' + this.path); }
  collection(p) { return new ArtCollRef(this.db, this.r.collection(p)); }
}
class ArtCollRef {
  constructor(db, ref) { this.db = db; this.r = ref; this.path = ref.path; }
  doc(id) { return new ArtDocRef(this.db, id == null ? this.r.doc() : this.r.doc(id)); }
  async add(data) { const d = this.doc(); await d.set(data); return d; }
  get() { return this.db.wrapErr(again(() => this.r.get(), DB_RETRY)); }
  onSnapshot(next, onErr) { return resub((n, e) => this.r.onSnapshot(n, e), next, onErr, this.db.net.meter, 'snapq:' + this.path); }
}
// 이름 있는 방. 플랫폼이 재연결 때 스스로 다시 들어가지만, 못 하면 그 방이 끝난다(리스너마다 오류 하나) → 같은 이름으로 다시 들어가
// 손잡이(on·onPeers·onConnection)와 내 presence 를 그대로 다시 건다. 게임 코드는 방이 바뀐 줄 모른다.
class ArtRoom {
  constructor(net, name) {
    this.net = net; this.name = name; this.r = null;
    this.handlers = new Map(); this.peerSubs = new Set(); this.connSubs = new Set();
    this.pres = {}; this.left = false; this.dead = false; this.rejoining = false; this.wired = []; this.gen = 0;
  }
  async open() { this.r = await joinRetry(this.net, this.name); this.wire(); return this; }
  wire() {
    const r = this.r, gen = ++this.gen;
    for (const u of this.wired.splice(0)) { try { u(); } catch (e) { /* 무시 */ } }
    this.lostFn = (e) => { if (gen === this.gen) this.lost(e); };
    for (const topic of this.handlers.keys()) this.wired.push(r.on(topic, (m) => this.fan(topic, m), this.lostFn));
    this.wired.push(r.onPeers((ch) => { for (const h of [...this.peerSubs]) { try { h(ch); } catch (e) { console.error(e); } } }, this.lostFn));
    this.wired.push(r.onConnection((c) => this.connFan(c), this.lostFn));
  }
  fan(topic, m) { for (const h of [...(this.handlers.get(topic) || [])]) { try { h(m); } catch (e) { console.error(e); } } }
  connFan(c) { for (const h of [...this.connSubs]) { try { h(c); } catch (e) { console.error(e); } } }
  lost(e) {
    this.net.meter.fail('room', e);
    if (this.left || this.rejoining) return;
    if (TERMINAL.has(e?.code) || e?.code === 'not_permitted') { this.dead = true; this.connFan(false); return; }
    this.rejoining = true;
    this.connFan(false);
    (async () => {
      for (let i = 1; i <= 8 && !this.left; i++) {
        await sleep(Math.min(8000, 800 * i));
        if (this.left) break;
        try {
          this.r = await this.net.cap.room.join(this.name);
          this.wire();
          if (Object.keys(this.pres).length) await this.r.presence(this.pres).catch(() => {});
          this.rejoining = false;
          this.connFan(this.r.connected());
          return;
        } catch (e2) { this.net.meter.fail('rejoin', e2); if (TERMINAL.has(e2?.code) || e2?.code === 'not_permitted') break; }
      }
      this.rejoining = false; this.dead = true;
    })();
  }
  on(topic, h) {
    if (typeof h !== 'function') throw new TypeError('handler');
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
      if (this.r) this.wired.push(this.r.on(topic, (m) => this.fan(topic, m), this.lostFn));
    }
    this.handlers.get(topic).add(h);
    return () => this.handlers.get(topic)?.delete(h);
  }
  onPeers(h) {
    this.peerSubs.add(h);
    setTimeout(() => { if (this.peerSubs.has(h) && this.r) { const ps = this.r.peers(); h({ peers: ps, joined: ps, left: [], updated: [] }); } }, 0); // 늦게 단 손잡이도 첫 배달(지금 방)을 받는다
    return () => this.peerSubs.delete(h);
  }
  onConnection(h) { this.connSubs.add(h); setTimeout(() => { if (this.connSubs.has(h)) h(this.connected()); }, 0); return () => this.connSubs.delete(h); }
  peers() { return this.r ? this.r.peers() : Object.freeze([]); }
  connected() { return !!this.r && !this.dead && !this.rejoining && this.r.connected(); }
  async emit(topic, data) {
    const m = this.net.meter, bytes = jsonBytes(data);
    m.count.emit++; m.max.emit = Math.max(m.max.emit, bytes); m.topic(topic, bytes);
    if (!LIMITS.topics.includes(topic)) m.violation('topic', { topic }); // 선언에 없는 주제 → 플랫폼이 not_permitted
    if (bytes > LIMITS.emit) { m.violation('emit', { topic, bytes }); throw err('invalid_argument', `emit over 4 KiB (${bytes} B)`); }
    if (!this.net.take()) { m.count.dropped++; m.violation('rate', { topic }); } // 기록만(예산은 플랫폼이 강제: 넘친 emit 은 버려짐)
    if (!this.r || this.dead) throw err('upstream_error', 'room not open');
    return this.r.emit(topic, data).catch((e) => { m.fail('emit', e); throw e; });
  }
  async presence(patch) {
    const next = { ...this.pres };
    for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete next[k]; else next[k] = clone(v); }
    const m = this.net.meter, bytes = jsonBytes(next);
    m.count.presence++; m.max.presence = Math.max(m.max.presence, bytes);
    if (bytes > LIMITS.presence) { m.violation('presence', { bytes }); throw err('invalid_argument', `presence over 4 KiB (${bytes} B)`); }
    this.pres = next;
    if (!this.r || this.dead) return;
    return this.r.presence(patch).catch((e) => { m.fail('presence', e); throw e; });
  }
  async leave() {
    if (this.left) return;
    this.left = true;
    for (const u of this.wired.splice(0)) { try { u(); } catch (e) { /* 무시 */ } }
    this.net.rooms.delete(this.name);
    try { await this.r?.leave(); } catch (e) { /* 무시 */ }
  }
}
async function joinRetry(net, name) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await net.cap.room.join(name); } catch (e) {
      last = e; net.meter.fail('join', e);
      if (!(e?.code === 'upstream_error' || e?.code === 'limit_reached')) throw e;
      await sleep(1000 * (i + 1));
    }
  }
  throw last;
}
export class ArtifactNet {
  constructor({ db, room, user, uid, canWrite = null }) {
    this.kind = 'artifact';
    this.uid = uid;
    this.peer = 't' + randId(12); // 이 페이지 로드(자리 잡기 lease 의 holder — 같은 계정 두 탭도 서로 다르게). 플랫폼 peer 와는 별개
    this.canWrite = canWrite; // true | null(플랫폼이 말 안 함 → 쓰기 거절이 판가름)
    this.codeLen = 6; // 같은 조직 사람이 모두 같은 db 를 쓴다 → 문서대로 6자(31^6 ≈ 8.9억)
    this.cap = Object.freeze({ db, room, user });
    this.meter = new Meter();
    this.tokens = LIMITS.burst; this.tokAt = now();
    this.rooms = new Map();
    this.db = new ArtDb(this, db);
    this.room = { join: (name) => this.join(name) };
    this.user = {
      id: async () => uid,
      me: () => user.me(),
      can: (c) => user.can(c),
      profiles: async (ids) => { try { return (await user.profiles(ids)) || {}; } catch (e) { return {}; } }, // 절대 거절 안 한다지만 방어
    };
  }
  take() { return LocalNet.prototype.take.call(this); }
  join(name) {
    if (!ROOM_RE.test(name)) return Promise.reject(err('invalid_argument', 'room name: ' + name));
    let r = this.rooms.get(name);
    if (!r) {
      r = new ArtRoom(this, name);
      this.rooms.set(name, r);
      r.ready = r.open().catch((e) => { this.rooms.delete(name); throw e; });
    }
    return r.ready;
  }
}

// 지금 쓸 수 있는 Net(동기): ?pvplocal(또는 #pvplocal) 이면 LocalNet, 아니면 null. 아티팩트 iframe 은 주소 토글을 못 붙인다
export function pickNet() {
  if (param('pvplocal') == null) return null;
  try {
    if (typeof BroadcastChannel !== 'function' || typeof localStorage === 'undefined') return null;
    localStorage.getItem('pn1-probe');
    return new LocalNet({ lag: +(param('pvplag') || 0) });
  } catch (e) { return null; }
}
// 비동기(P0.5b): ?pvplocal → LocalNet. 아니면 claude.use('db'|'room'|'user') 셋이 다 있고 내 id 가 있고 can('data.write') 이 false 가
// 아니면 ArtifactNet. 하나라도 없으면 null → PvP 버튼은 숨고 혼자서도 다 돈다. use() 는 최대 10초 → 부팅을 막지 않게 부트 뒤에 기다린다.
// can() 이 null = 플랫폼이 이 화면에 아무 말도 안 함(user.d.ts: 'null 은 못 함이 아니다') → 버튼을 두고 쓰기 거절(invalid_argument)이 판가름.
export async function resolveNet() {
  const local = pickNet();
  if (local) return local;
  const c = typeof window !== 'undefined' ? window.claude : undefined;
  if (!c || typeof c.use !== 'function') return null;
  try {
    const use = (n) => Promise.resolve().then(() => c.use(n)).catch(() => null);
    const [db, room, user] = await Promise.all([use('db'), use('room'), use('user')]);
    if (!db || !room || !user || typeof room.join !== 'function') return null;
    const uid = await Promise.resolve(user.id()).catch(() => null);
    if (!uid) return null; // id 없음 = 내 자리(p/{self}·data/users/{self})를 못 씀
    const can = await Promise.resolve(user.can('data.write')).catch(() => null);
    if (can === false) return null; // 보기 전용(Viewer·Commenter·밖 손님)
    return new ArtifactNet({ db, room, user, uid, canWrite: can });
  } catch (e) { return null; }
}
