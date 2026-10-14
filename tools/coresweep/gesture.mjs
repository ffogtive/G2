// tools/coresweep/gesture.mjs — 한 엄지 인식기 (docs/design/core-sweep.md §4.1). 렌더러 독립: Node 에서 그대로 돈다.
//
// 🧭 가설(확인됨, gestnoise.mjs 손 잡음 모델 안에서 · 모델 자체는 미검증): '푸' 시작 규칙의 300 ms 는 당긴 뒤의 마감이 아니라 굴러가는 창이다.
//   매 tick 마다 "평활 엄지가 최근 300 ms 안에 12 px 이상 올라갔나"를 본다 = 300 ms 평균 속도 40 px/s 바닥.
//   그래서 언제 밀기 시작해도 되고, 처음이 느려도 빨라지는 순간 시작한다. 대신 끝까지 40 px/s 를 못 넘는 밀기는 '푸'가 안 된다.
//
// 문법
//  누르기(아래쪽 아무 데나) → 아래로 당기기 = 들이쉼(가장 깊이 당긴 곳 = 숨, 되물림 없음)
//  (a) 위로 밀지 않고 떼기 = 퍽
//  (b) 위로 밀기 시작 = '푸' 시작. 그때부터 엄지가 가장 낮은 점에서 올라간 높이 u = 바람 자국 높이. 떼기 = 숨 끝(최소 0.131 s)
//  옆으로 화면 폭 30% 넘게 빼서 떼기 / 당김 0.06 미만 = 취소(숨·차례 안 씀).
//  시간 ms, 거리 CSS px(≈ pt). 손떨림: 시작 판정만 100 ms 이동 평균(ZOH, 사건이 없어도 tick 으로 판정). 당김 세기·u 는 원신호.
//
// 시작 규칙 (rise = 평활 최저점 − 지금 평활 y, 화면 y 는 아래로 +)
//  ① 굴러가는 창(기본): rise ≥ upStart 이고 (최근 upWin ms 의 평활 최저점 − 지금) ≥ upStart
//  ② 누적(선택, upCum > 0): rise ≥ upCum 이 upCumMs 동안 이어지면. 속도와 무관 — 아주 느린 밀기용
//  ③ 둘째 창(선택, roll2 = [px, ms]): 최근 ms 안에 px 이상. 더 긴 창 = 더 낮은 속도 바닥
//  ④ 떼기(선택, slowCancel > 0): '푸' 없이 떼는데 rise ≥ slowCancel 이면 퍽이 아니라 취소(slow: true). '푸'를 새로 열지는 않는다
//  기본값(①만)은 레포 밖 2안 시제품과 대조해 시작 판정이 같았다(출처 메모, 레포만으로는 다시 확인할 수 없다). why = 'roll' | 'cum' | 'roll2' 로 어느 규칙이 열었는지 남긴다.
//
// 원본: 2안 시제품의 인식기 부분(출처 메모: 세션 임시 폴더의 시제품과 gestnoise.mjs table 15줄 숫자를 대조해 같았다. 시제품은 레포에 없다). 고개 매핑·목 운동학은 문서 §2.1·§4.1 이 기준이라 옮기지 않았다.
//  u(바람 자국 높이)는 '푸' 시작점이 아니라 가장 낮은 점(당김 끝, lowRaw)부터 잰다 — '푸'가 늦게 열리면 그 순간의 높이로 바로 간다.
// 문서 §4.1 제안(미검증): GCFG + { slowCancel: 40 } — 느린 밀기를 퍽으로 쏘지 않고 취소 + '툭 밀어 올려요' 안내.
export const POUCH_FULL = 1.12, POUCH_DETENT = 0.08, POUCH_GAIN = 0.4, POWER_MAX = 1.25;
export function pouchPower(u) { u = Math.max(0, u); if (u <= POUCH_FULL) return u; if (u <= POUCH_FULL + POUCH_DETENT) return POUCH_FULL; return Math.min(POWER_MAX, POUCH_FULL + (u - POUCH_FULL - POUCH_DETENT) * POUCH_GAIN); }
export const GCFG = {
  pull: 0.42,      // 당김 1.0 = 화면 짧은 변 × 0.42 (지금 게임과 같음)
  upStart: 12,     // (평활) 12 px 위로 → '푸' 시작
  upWin: 300,      // 그 12 px 를 '최근' 300 ms 안에(굴러가는 창 = 40 px/s 바닥). 160 ms 는 느린 손 쓸기를 1.55% 놓침(gestnoise table)
  smoothMs: 100,   // 시작 판정용 이동 평균 창. 50 ms 면 아이 손떨림 '퍽 → 잘못 시작' 28%, 100 ms 면 0.25%
  upCum: 0,        // ② 누적 규칙(px). 0 = 끔
  upCumMs: 0,      //   그 높이에 이만큼 머물러야(ms)
  roll2: null,     // ③ 둘째 창 [px, ms]. null = 끔
  slowCancel: 0,   // ④ 떼기 규칙(px, 선택): '푸'가 안 열린 채 평활 엄지가 최저점보다 이만큼 위에서 떼면 퍽 대신 취소(+ '툭 밀어요' 안내). 0 = 끔
  minP: 0.06,      // 이보다 덜 당기고 떼면 취소(지금 게임과 같음)
  cancelFrac: 0.30,
  minBlowMs: 131,  // 숨은 한 번 나가면 퍽 길이만큼은 나간다(튕겨 떼기)
  capMs: 1600,     // 푸 상한(이 시제품 값. 문서 §4.1 은 화면 1.0 s)
};
export class Gesture {
  constructor(W, H, cfg = {}) { this.W = W; this.H = H; this.c = { ...GCFG, ...cfg }; this.reset(); }
  reset() { this.st = 'idle'; this.tr = []; this.sm = []; this.out = null; this.cumAt = null; this.why = null; this.relAt = null; }
  get minDim() { return Math.min(this.W, this.H); }
  // ZOH 신호의 [t − w, t] 시간 평균
  avgY(t) {
    const w = this.c.smoothMs, tr = this.tr; if (!w) return tr.at(-1)[2];
    let acc = 0, tEnd = t;
    for (let i = tr.length - 1; i >= 0; i--) {
      const t0 = Math.max(tr[i][0], t - w); if (tEnd > t0) acc += tr[i][2] * (tEnd - t0); tEnd = t0;
      if (tr[i][0] <= t - w) break;
    }
    const span = t - Math.max(tr[0][0], t - w); return span > 0 ? acc / span : tr.at(-1)[2];
  }
  // 최근 ms 안의 평활 최저점(화면 y 최대) − 지금 평활 y
  riseWithin(ms, t, ys) {
    let yOld = -1e9; for (let i = this.sm.length - 1; i >= 0 && t - this.sm[i][0] <= ms; i--) yOld = Math.max(yOld, this.sm[i][1]);
    return yOld - ys;
  }
  down(x, y, t) { this.reset(); this.st = 'inhale'; this.ax = x; this.ay = y; this.lowRaw = y; this.lowS = y; this.pMax = 0; this.tr.push([t, x, y]); this.sm.push([t, y]); }
  tick(t) { // 사건이 없어도 매 프레임 부른다(멈춰 있는 엄지도 판정)
    if (this.st === 'inhale') {
      const c = this.c;
      const ys = this.avgY(t); this.sm.push([t, ys]); if (this.sm.length > 400) this.sm.splice(0, 100);
      if (ys > this.lowS) this.lowS = ys;
      const x = this.tr.at(-1)[1]; this.sideOut = Math.abs(x - this.ax) > c.cancelFrac * this.W;
      const rise = this.lowS - ys;
      if (c.upCum > 0) { if (rise >= c.upCum) { if (this.cumAt == null) this.cumAt = t; } else this.cumAt = null; }
      if (!this.sideOut && this.pMax >= c.minP && rise >= c.upStart) {
        let why = null;
        if (this.riseWithin(c.upWin, t, ys) >= c.upStart) why = 'roll';
        else if (c.roll2 && rise >= c.roll2[0] && this.riseWithin(c.roll2[1], t, ys) >= c.roll2[0]) why = 'roll2';
        else if (c.upCum > 0 && this.cumAt != null && t - this.cumAt >= c.upCumMs) why = 'cum';
        if (why) { this.st = 'blow'; this.t0 = t; this.ys = this.lowRaw; this.p = this.pMax; this.why = why; return { ev: 'blowStart', p: this.p, why }; }
      }
      return { ev: 'inhale', p: this.pMax };
    }
    if (this.st === 'blow') {
      const u = Math.max(0, this.ys - this.tr.at(-1)[2]);
      if (t - this.t0 >= this.c.capMs) { this.st = 'done'; this.out = { kind: 'pueok', p: this.p, ms: this.c.capMs, u, cap: true, why: this.why }; return { ev: 'blowEnd', u, cap: true, endAt: t }; }
      if (this.relAt != null && t >= this.relAt) { this.st = 'done'; return { ev: 'blowEnd', u, endAt: t }; }
      return { ev: 'sweep', u, ms: t - this.t0 };
    }
    return null;
  }
  move(x, y, t) {
    if (this.st === 'idle' || this.st === 'done') return null;
    if (this.relAt != null) return this.tick(t); // 뗀 뒤(최소 숨 시간 동안)는 위치가 안 바뀜
    this.tr.push([t, x, y]);
    if (this.st === 'inhale' && y > this.lowRaw) { this.lowRaw = y; this.pMax = pouchPower((y - this.ay) / (this.minDim * this.c.pull)); }
    return this.tick(t);
  }
  up(x, y, t) {
    if (this.st === 'inhale') {
      this.tr.push([t, x, y]); this.st = 'done';
      if (this.sideOut || Math.abs(x - this.ax) > this.c.cancelFrac * this.W || this.pMax < this.c.minP) return (this.out = { kind: 'cancel', p: this.pMax });
      if (this.c.slowCancel > 0 && this.lowS - this.avgY(t) >= this.c.slowCancel) return (this.out = { kind: 'cancel', p: this.pMax, slow: true });
      return (this.out = { kind: 'puff', p: this.pMax });
    }
    if (this.st === 'blow') {
      const u = Math.max(0, this.ys - y); this.tr.push([t, x, y]);
      const ms = Math.max(this.c.minBlowMs, t - this.t0); this.relAt = this.t0 + ms;
      return (this.out = { kind: 'pueok', p: this.p, ms, u, flick: t - this.t0 < this.c.minBlowMs, why: this.why });
    }
    return this.out;
  }
}
