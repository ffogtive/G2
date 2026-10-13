// fake-claude.js — 시험용 가짜 claude.ai 아티팩트 호스트. 페이지 스크립트보다 먼저(addInitScript) window.claude 를 만든다.
//
// 🧭 가설: 아티팩트 capability(db·room·user)와 같은 모양을 LocalNet(BroadcastChannel + localStorage, 실제 상한 강제) 위에 세우면
//   아티팩트 빌드(dist/puff-artifact.html)의 ArtifactNet 경로를 게시 없이 두 페이지로 끝까지 돌려 볼 수 있다.
//   판가름 = NET=artifact pvp-check 가 LocalNet 판(같은 게이트)과 똑같이 PASS 하는가.
//
// 흉내 내는 것(artifact-capabilities 0.2.75 claude.d.ts·db.d.ts·room.d.ts·user.d.ts):
//   claude.use(name) → Promise<네임스페이스 | null> (얼어 있는 객체, 늦게 풀림). 'null' 모드면 셋 다 null(권한 없음·공개 링크·저장 파일)
//   db.doc/collection → get·set·update·delete·acquire·onSnapshot (스냅샷 얼림, 256KiB·깊이 32·경로 문법)
//   room.join(name) → NamedRoom (emit·on·presence·peers·onPeers·connected·onConnection·leave, 4KiB, 선언 주제 blow·trk·done 만, 초당 40·버스트 80)
//   user.id/me/can/profiles(ids → { [id]: Profile })/isOwner/canEdit/name/search
// 흉내 못 내는 것: 실제 서버 지연·끊김·재게시 새로고침·다른 엔진(iOS JSC). 그건 게시 뒤 사람 시험(§2.1 시험 방법 4). 폴링 강등은 snapPoll 로 흉내
//
// 설정: window.__FAKE_CLAUDE__ = { mode: 'full' | 'null' | 'viewer' | 'nullcan' | 'noid', delay: ms(use 가 풀리는 시간, 기본 300), lag: ms,
//   snapPoll: ms }  snapPoll = db onSnapshot 이 실시간을 잃고 폴링으로 떨어진 상태 흉내(db.d.ts: '약 30초 간격'). 내 쓰기는 바로, 남의 쓰기는 다음 폴링 때
import { LocalNet } from '../mockup/src/net.js';

(function () {
  const cfg = window.__FAKE_CLAUDE__ || {};
  const mode = cfg.mode || 'full';
  let net = null;
  const getNet = () => (net ||= new LocalNet({ lag: cfg.lag || 0 })); // 탭마다 uid(sessionStorage) → 새로고침 = 같은 사람 = 재접속
  const nick = (id) => 'Tester ' + String(id).slice(-4).toUpperCase();
  const prof = (id) => Object.freeze({ id, name: nick(id), avatarUrl: 'data:,', color: '#3a8fe0', email: null, isMe: id === getNet().uid, guest: false });
  const caps = {
    db: () => Object.freeze({ doc: (p) => wrapDoc(getNet().db.doc(p)), collection: (p) => wrapColl(getNet().db.collection(p)) }),
    room: () => Object.freeze({
      join: (name) => getNet().join(name),
      connected: () => true,
      onConnection: (h) => { setTimeout(() => h(true), 0); return () => {}; },
      peers: () => Object.freeze([]),
      onPeers: () => () => {},
      on: () => () => {},
      emit: async () => { throw Object.assign(new Error('lobby topics are not declared'), { code: 'not_permitted' }); },
      presence: async () => {},
    }),
    user: () => Object.freeze({
      id: async () => (mode === 'noid' ? null : getNet().uid),
      me: async () => ({ id: mode === 'noid' ? null : getNet().uid, name: nick(getNet().uid), avatarUrl: 'data:,', color: '#3a8fe0', email: null, isOwner: false, canEdit: false }),
      can: async (c) => (c !== 'data.write' ? false : mode === 'viewer' ? false : mode === 'nullcan' ? null : true),
      isOwner: async () => false,
      canEdit: async () => false,
      name: async () => nick(getNet().uid),
      avatarUrl: async () => null,
      email: async () => null,
      search: async () => [],
      profiles: async (ids) => Object.fromEntries([...new Set([].concat(ids))].map((id) => [id, prof(id)])),
    }),
  };
  // 폴링 강등(snapPoll): 문서 구독은 첫 배달 + 내 쓰기만 바로, 나머지는 snapPoll 마다 get() 으로
  const mine = new Map(); // path → 내가 마지막으로 쓴 시각
  const wrapDoc = (r) => {
    if (!cfg.snapPoll) return r;
    const mark = (f) => (...a) => { mine.set(r.path, Date.now()); return f(...a); };
    return Object.freeze({
      id: r.id, path: r.path, get: () => r.get(), set: mark((d) => r.set(d)), update: mark((d) => r.update(d)), delete: mark(() => r.delete()),
      acquire: (o) => r.acquire(o), collection: (p) => wrapColl(r.collection(p)),
      onSnapshot: (next, onErr) => {
        let last, alive = true;
        const give = (sn) => { const k = JSON.stringify(sn.data() ?? null); if (k === last) return; last = k; next(sn); };
        const un = r.onSnapshot((sn) => { if (last === undefined || Date.now() - (mine.get(r.path) || 0) < 500) give(sn); }, onErr);
        const tm = setInterval(() => { if (alive) r.get().then((sn) => alive && give(sn)).catch(() => {}); }, cfg.snapPoll);
        return () => { alive = false; un(); clearInterval(tm); };
      },
    });
  };
  const wrapColl = (c) => (cfg.snapPoll ? Object.freeze({ path: c.path, doc: (id) => wrapDoc(c.doc(id)), add: async (d) => { const x = wrapDoc(c.doc()); await x.set(d); return x; }, get: () => c.get(), onSnapshot: (n, e) => c.onSnapshot(n, e) }) : c);
  const made = {};
  window.claude = Object.freeze({
    use: (name) => new Promise((res) => setTimeout(() => {
      if (mode === 'null' || !caps[name]) return res(null);
      res((made[name] ||= caps[name]()));
    }, cfg.delay ?? 300)),
  });
  window.__fakeMeter = () => (net ? net.meter.summary() : null);
})();
