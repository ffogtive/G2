#!/usr/bin/env python3
"""spike.py — 설계서 §7.2 S1~S6 정식 측정 실행기 (puff_v2 batch 를 묶음으로 돌리고 원자료·판정을 남긴다).

🧭 가설: 정직 물리 엔진(puff_v2)에서 턱 자세 숨은 30장 이상 더미의 맨 위 몇 장 근처에서만 넘긴다(스모크, 미검증)
  → §7.2 표의 합격 기준을 그대로, 공통 난수(같은 더미 시드) 짝 비교 + 부트스트랩 2000회 CI 로 판정한다.

규약 (사양 미정 부분은 여기서 정하고 보고서에 적는다):
  - 시드: 고르기 1~16, 보고 33~64 (§7.1 오라클 분리. 고르기 시드 수는 예산 때문에 32 → 16)
  - 조준 격자: 위에서 K 장 (K = 0.5,1.5,3,5,8,13,20, K ≤ 0.8N). h = top − K·top/N, top = 명목·(1 − 0.000237N) (G1 평균 실측)
  - 사람 잡음(설계서에 수치 정의 없음 → tools/botlib.mjs BOTS.learner 크기를 옮김):
      높이 σ = 0.12·top (분수 잡음, [0.03, 1]·top 로 자름), 옆 σ = 0.25 u (±0.9 자름), 당김 상대 σ = 0.15/0.89 (S6 만)
  - 잡음 난수는 (게이트, N, 시드) 마다 하나 → 같은 시드의 모든 팔이 같은 잡음(CRN)
  - 비교 통계: 보고 시드 짝(같은 N·시드) 평균비, 부트스트랩 2000회 백분위 95% CI (numpy default_rng(20261013))

명령:
  python3 spike.py run <phase>      # phase: core_sel core_rep s6_sel s6_rep s4 s2_sel s2_rep s3_sel s3_rep s3ab_sel s3ab_rep s5x_sel s5x_rep
  python3 spike.py analyze          # → docs/research/v2-spike/summary.json + 표 (stdout)
환경: PUFF_BIN (기본 ../puff_sim/target/release/puff_v2), SPIKE_OUT (기본 docs/research/v2-spike), THREADS=3
"""
import json, math, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BIN = os.environ.get('PUFF_BIN', os.path.join(HERE, '..', '..', 'puff_sim', 'target', 'release', 'puff_v2'))
OUT = os.environ.get('SPIKE_OUT', os.path.join(REPO, 'docs', 'research', 'v2-spike'))
RAW = os.path.join(OUT, 'raw')
THREADS = int(os.environ.get('THREADS', '3'))

SEL = list(range(1, 17))
REP = list(range(33, 65))
KGRID = [0.5, 1.5, 3, 5, 8, 13, 20]
LEARN = dict(h_sd=0.12, lat_sd=0.25, q_rel_sd=0.15 / 0.89)  # tools/botlib.mjs BOTS.learner
V1_LEARNER = dict(h_mean=0.82, p_mean=0.89)  # 민감도용 (v1 정책 평균 그대로)
DELAY = 0.3  # 푸어억 쓸기 시작 지연 (화면 초, '푸' 0.32 s 뒤)

# S2: 비용 ±10% 등비용 곡선 위 대표 3점 (§6.1 비용식, breath.rs cost_of 와 같은 값 — 아래 cost_* 로 검산)
S2_COMBOS = [(0.89, 1.93), (0.93, 1.4333), (0.97, 0.8)]
S3_RATES = [3.0, 6.0, 9.0, 13.0, 21.0, 26.0]


# ───────── 결정적 난수 (mulberry32 + Box–Muller) ─────────
class M32:
    def __init__(self, seed):
        self.a = seed & 0xFFFFFFFF
        self.spare = None

    def u(self):
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    def g(self):
        if self.spare is not None:
            s, self.spare = self.spare, None
            return s
        u1 = max(self.u(), 1e-12)
        u2 = self.u()
        r = math.sqrt(-2 * math.log(u1))
        self.spare = r * math.sin(2 * math.pi * u2)
        return r * math.cos(2 * math.pi * u2)


def noise(gate, n, seed):
    salt = {'S3': 0x5E3, 'S6': 0x5E6}[gate]
    r = M32((salt * 2654435761 ^ n * 40503 ^ seed * 0x9E3779B9) & 0xFFFFFFFF)
    for _ in range(3):
        r.u()
    return r.g(), r.g(), r.g()


# ───────── 비용 (§6.1, breath.rs 복제 — 검산용) ─────────
S_TIME = math.sqrt(9.81 / 0.95)


def _ramp(t, tr):
    return 0.0 if t <= 0 else 1.0 if t >= tr else 0.5 * (1 - math.cos(math.pi * t / tr))


def _qq(q):
    v = round(min(max(q * 1.12, 0), 1.25) / 1.25 * 4095)
    return min(1.0, v / 4095 * 1.25 / 1.12)


def cost_pueok(q, dur):
    dt = 1 / 480
    nf = math.ceil(dur * 30 - 1e-9) + 1
    ts = min(max((nf - 1) / 30, dt), 1.93)
    n = math.ceil((ts + 0.26) / dt - 1e-9)
    qv, vol = _qq(q), 0.0
    for k in range(n):
        t = (k + 0.5) * dt
        env = _ramp(t, 0.26) if t < ts else _ramp(ts, 0.26) * (1 - _ramp(t - ts, 0.26))
        vol += 3.9 * qv * env * dt / S_TIME
    x = max(qv - 0.8, 0) / 0.2
    return 2 * vol + 4.5 * x * x


def cost_puff(q):
    dt = 1 / 480
    n = math.ceil(0.385 / dt - 1e-9)
    qv, vol = _qq(q), 0.0
    for k in range(n):
        t = (k + 0.5) * dt
        env = _ramp(t, 0.096) if t < 0.096 else (1.0 if t < 0.257 else 1 - _ramp(t - 0.257, 0.128))
        vol += 3.9 * qv * env * dt / S_TIME
    x = max(qv - 0.8, 0) / 0.2
    return 2 * vol + 4.5 * x * x


# ───────── 더미 높이 ─────────
_NOM = {}


def nominal(n, seed):
    if (n, seed) not in _NOM:
        out = subprocess.run([BIN, 'nominal', str(n), '1-64'], capture_output=True, text=True, check=True).stdout
        for line in out.split('\n'):
            if line.strip():
                a, b, c = line.split()
                _NOM[(int(a), int(b))] = float(c)
    return _NOM[(n, seed)]


def top_est(n, seed):
    return nominal(n, seed) * (1 - 0.000237 * n)


def kgrid(n):
    return [k for k in KGRID if k <= 0.8 * n]


def h_of(n, seed, k):
    t = top_est(n, seed)
    return max(0.02, t - k * t / n)


def human(n, seed, h_int, gate):
    z1, z2, z3 = noise(gate, n, seed)
    t = top_est(n, seed)
    frac = min(1.0, max(0.03, h_int / t + LEARN['h_sd'] * z1))
    lat = min(0.9, max(-0.9, LEARN['lat_sd'] * z2))
    return frac * t, lat, z3


# ───────── 팔 정의 ─────────
def arm_spec(arm):
    """arm 이름 → (kind, q, dur, sweep, delay, mode)"""
    if arm == 'puff_q1':
        return ('puff', 1.0, 0.0, 0.0, 0.0, 'c')
    if arm == 'pueok_q1':
        return ('pueok', 1.0, 1.93, 0.0, DELAY, 'c')
    if arm.startswith('s2_'):  # s2_q0.89_d1.93_sw9
        _, q, d, sw = arm.split('_')
        return ('pueok', float(q[1:]), float(d[1:]), float(sw[2:]), DELAY, 'c')
    if arm.startswith('s3p_'):  # s3p_c_9 : 푸어억 q1 1.93 s, 쓸기 모드·속도
        _, mode, r = arm.split('_')
        return ('pueok', 1.0, 1.93, float(r), DELAY, mode)
    if arm.startswith('s3f_'):  # s3f_9 : 퍽 q1, 쓸기 속도 (지연 0)
        return ('puff', 1.0, 0.0, float(arm.split('_')[1]), 0.0, 'c')
    if arm.startswith('s6_'):  # s6_q0.85
        return ('puff', float(arm.split('_')[1][1:]), 0.0, 0.0, 0.0, 'c')
    raise ValueError(arm)


def line(n, seed, arm, h, lat, tag, q=None, extra=''):
    kind, q0, dur, sw, delay, mode = arm_spec(arm)
    q = q0 if q is None else q
    return (f"n={n} seed={seed} pose=chin breath={kind} q={q:.4f} dur={dur} sweep={sw} delay={delay} mode={mode} "
            f"h={h:.5f} lat={lat:.4f} {extra} tag={tag}").replace('  ', ' ')


# ───────── 실행 ─────────
KEEP = ['tag', 'n', 'seed', 'pose', 'kind', 'q', 'dur', 'sweep', 'mode', 'lat', 'h', 'inset', 'flipped', 'out', 'flipped_out',
        'zero', 'whole', 'slide_max', 'apex_rise', 'available', 'aim_clamped', 'jet_deg0', 'j_peak', 'cost', 'vol_l',
        'steps_after', 'cpu_ms', 'hash']


def compact(d):
    o = {k: d[k] for k in KEEP if k in d}
    a = d.get('audit', {})
    o['aud'] = [a.get('h1', 0), a.get('h1_cavity', 0), a.get('h2', 0), a.get('h2c', 0), a.get('h3', 0), a.get('h4_nan', 0)]
    o['aud_worst'] = [round(a.get('h1_worst', 0), 3), round(a.get('h2_worst', 0), 3), round(a.get('h2c_worst', 0), 3)]
    for k in ('slide_max', 'apex_rise', 'jet_deg0', 'cost', 'vol_l', 'cpu_ms', 'lat', 'h', 'j_peak'):
        if k in o and isinstance(o[k], float):
            o[k] = round(o[k], 4)
    return o


def load(phase):
    """raw/<phase>.jsonl (실행 중) 또는 raw/<phase>.jsonl.gz (보관본)"""
    p = os.path.join(RAW, phase + '.jsonl')
    rows = []
    if os.path.exists(p + '.gz'):
        import gzip
        rows += [json.loads(l) for l in gzip.open(p + '.gz', 'rt') if l.strip()]
    if os.path.exists(p):
        rows += [json.loads(l) for l in open(p) if l.strip()]
    return rows


def run_lines(phase, lines):
    """lines: [(tag, specline)] — 이미 있는 tag 는 건너뛰고, 더미(N·시드) 묶음 단위로 나눠 돌린다"""
    os.makedirs(RAW, exist_ok=True)
    done = {r['tag'] for r in load(phase)}
    todo = [(t, l) for t, l in lines if t not in done]
    # 더미별 묶음 → 덩어리(약 THREADS*6 더미)
    groups = {}
    for t, l in todo:
        key = ' '.join(x for x in l.split() if x.startswith(('n=', 'seed=', 'inset=')))
        groups.setdefault(key, []).append((t, l))
    keys = list(groups)
    chunk = THREADS * 6
    t0 = time.time()
    ndone = 0
    print(f'[{phase}] 할 샷 {len(todo)} (이미 {len(done)}), 더미 {len(keys)}', flush=True)
    for i in range(0, len(keys), chunk):
        batch = [x for k in keys[i:i + chunk] for x in groups[k]]
        inp = '\n'.join(l for _, l in batch) + '\n'
        res = subprocess.run([BIN, 'batch', str(THREADS)], input=inp, capture_output=True, text=True)
        if res.returncode != 0:
            print(res.stderr, file=sys.stderr)
            raise SystemExit(f'batch 실패 rc={res.returncode}')
        outs = [json.loads(x) for x in res.stdout.split('\n') if x.strip()]
        assert len(outs) == len(batch), (len(outs), len(batch))
        with open(os.path.join(RAW, phase + '.jsonl'), 'a') as f:
            for d in outs:
                f.write(json.dumps(compact(d), ensure_ascii=False, separators=(',', ':')) + '\n')
        ndone += len(batch)
        el = time.time() - t0
        print(f'[{phase}] {ndone}/{len(todo)}  {el:.0f}s  (남은 추정 {el / ndone * (len(todo) - ndone):.0f}s)', flush=True)
    print(f'[{phase}] 끝 {time.time() - t0:.0f}s', flush=True)


def best_cell(rows, keyf):
    """고르기 시드 행들 → keyf(row) 칸별 (평균 뒤집힘 최대, 동률이면 P0 작고 원 밖 작은 쪽)"""
    cells = {}
    for r in rows:
        cells.setdefault(keyf(r), []).append(r)
    def score(v):
        m = sum(x['flipped'] for x in v) / len(v)
        p0 = sum(x['zero'] for x in v) / len(v)
        o = sum(x['out'] for x in v) / len(v)
        return (m, -p0, -o)
    best = max(cells, key=lambda c: score(cells[c]))
    return best, score(cells[best]), {c: score(v) for c, v in cells.items()}


def parse_tag(t):
    return t.split('|')


# phase → lines
def plan(phase):
    L = []
    if phase == 'core_sel':
        for arm, ns in (('puff_q1', [10, 20, 30, 40, 50, 60]), ('pueok_q1', [20, 30, 40])):
            for n in ns:
                for s in SEL:
                    for k in kgrid(n):
                        tag = f'core|{arm}|{n}|{s}|{k}'
                        L.append((tag, line(n, s, arm, h_of(n, s, k), 0.0, tag)))
    elif phase == 'core_rep':
        sel = load('core_sel')
        for arm, ns in (('puff_q1', [10, 20, 30, 40, 50, 60]), ('pueok_q1', [20, 30, 40])):
            for n in ns:
                rows = [r for r in sel if parse_tag(r['tag'])[1] == arm and r['n'] == n]
                k, _, _ = best_cell(rows, lambda r: float(parse_tag(r['tag'])[4]))
                for s in REP:
                    tag = f'core|{arm}|{n}|{s}|{k}'
                    L.append((tag, line(n, s, arm, h_of(n, s, k), 0.0, tag)))
    elif phase == 's6_sel':
        for n in (30, 38, 46):
            for s in SEL:
                for qs in (0.85, 1.0):
                    for k in kgrid(n):
                        h, lat, z3 = human(n, s, h_of(n, s, k), 'S6')
                        q = min(1.0, max(0.2, qs * (1 + LEARN['q_rel_sd'] * z3)))
                        tag = f's6|s6_q{qs}|{n}|{s}|{k}'
                        L.append((tag, line(n, s, f's6_q{qs}', h, lat, tag, q=q)))
    elif phase == 's6_rep':
        sel = load('s6_sel')
        for n in (30, 38, 46):
            rows = [r for r in sel if r['n'] == n]
            (arm, k), _, _ = best_cell(rows, lambda r: (parse_tag(r['tag'])[1], float(parse_tag(r['tag'])[4])))
            qs = float(arm.split('_')[1][1:])
            for s in REP:
                h, lat, z3 = human(n, s, h_of(n, s, k), 'S6')
                q = min(1.0, max(0.2, qs * (1 + LEARN['q_rel_sd'] * z3)))
                tag = f's6|{arm}|{n}|{s}|{k}'
                L.append((tag, line(n, s, arm, h, lat, tag, q=q)))
                # 민감도: v1 학습자 그대로 (높이 0.82·top ± 0.12, 당김 0.89 ± 0.15 → q, q ≤ 1)
                z1, z2, z3b = noise('S6', n, s)
                t = top_est(n, s)
                hv = min(1.0, max(0.03, V1_LEARNER['h_mean'] + LEARN['h_sd'] * z1)) * t
                qv = min(1.0, max(0.2, V1_LEARNER['p_mean'] + 0.15 * z3b))
                tagv = f's6v1|s6_q{V1_LEARNER["p_mean"]}|{n}|{s}|v1'
                L.append((tagv, line(n, s, 's6_q1.0', hv, min(0.9, max(-0.9, LEARN['lat_sd'] * z2)), tagv, q=qv)))
    elif phase == 's4':
        for n in (4, 6, 8, 12, 16):
            for inset in (0.5, 0.0, -0.15, -0.30, -0.45):
                for s in range(1, 33):
                    nom = nominal(n, s)
                    for q in (0.6, 0.8, 1.0):
                        for f in (0.0, 0.3, 0.6):
                            tag = f's4|{n}|{inset}|{s}|{q}|{f}'
                            L.append((tag, f'n={n} seed={s} pose=under breath=puff q={q} inset={inset} h={max(0.0, nom * f):.5f} lat=0 tag={tag}'))
    elif phase == 's2_sel':
        for n in (30, 40):
            for arm in s2_arms():
                for s in SEL:
                    for k in kgrid(n):
                        tag = f's2|{arm}|{n}|{s}|{k}'
                        L.append((tag, line(n, s, arm, h_of(n, s, k), 0.0, tag)))
    elif phase == 's2_rep':
        sel = load('s2_sel')
        for n in (30, 40):
            for arm in s2_arms():
                rows = [r for r in sel if parse_tag(r['tag'])[1] == arm and r['n'] == n]
                k, _, _ = best_cell(rows, lambda r: float(parse_tag(r['tag'])[4]))
                for s in REP:
                    tag = f's2|{arm}|{n}|{s}|{k}'
                    L.append((tag, line(n, s, arm, h_of(n, s, k), 0.0, tag)))
    elif phase in ('s3_sel', 's3ab_sel'):
        arms = s3_arms() if phase == 's3_sel' else s3ab_arms()
        for n in (40, 20):
            for arm in arms:
                for s in SEL:
                    for k in kgrid(n):
                        h, lat, _ = human(n, s, h_of(n, s, k), 'S3')
                        tag = f's3|{arm}|{n}|{s}|{k}'
                        L.append((tag, line(n, s, arm, h, lat, tag)))
    elif phase in ('s3_rep', 's3ab_rep'):
        sel = load('s3_sel') + (load('s3ab_sel') if phase == 's3ab_rep' else [])
        arms = s3_arms() if phase == 's3_rep' else s3ab_arms()
        for n in (40, 20):
            for arm in arms:
                rows = [r for r in sel if parse_tag(r['tag'])[1] == arm and r['n'] == n]
                k, _, _ = best_cell(rows, lambda r: float(parse_tag(r['tag'])[4]))
                for s in REP:
                    h, lat, _ = human(n, s, h_of(n, s, k), 'S3')
                    tag = f's3|{arm}|{n}|{s}|{k}'
                    L.append((tag, line(n, s, arm, h, lat, tag)))
    elif phase == 's5x_sel':
        for n in (10, 50, 60):
            for s in SEL:
                for k in kgrid(n):
                    tag = f'core|pueok_q1|{n}|{s}|{k}'
                    L.append((tag, line(n, s, 'pueok_q1', h_of(n, s, k), 0.0, tag)))
    elif phase == 's5x_rep':
        sel = load('s5x_sel')
        for n in (10, 50, 60):
            rows = [r for r in sel if r['n'] == n]
            k, _, _ = best_cell(rows, lambda r: float(parse_tag(r['tag'])[4]))
            for s in REP:
                tag = f'core|pueok_q1|{n}|{s}|{k}'
                L.append((tag, line(n, s, 'pueok_q1', h_of(n, s, k), 0.0, tag)))
    else:
        raise SystemExit(f'모르는 phase {phase}')
    return L


def s2_arms():
    a = []
    for q, d in S2_COMBOS:
        for sw in ((0.0, 9.0) if d >= 1.4 else (0.0,)):
            a.append(f's2_q{q}_d{d}_sw{sw:g}')
    return a


def s3_arms():
    return ['s3p_c_0'] + [f's3p_c_{r:g}' for r in S3_RATES] + ['s3f_0', 's3f_9']


def s3_best_rate():
    """고르기 시드에서 (c) 쓸기 속도별 최선 칸 평균 → 가장 좋은 속도 (N 합침)"""
    sel = load('s3_sel')
    tot = {}
    for r in S3_RATES:
        arm = f's3p_c_{r:g}'
        s = 0.0
        for n in (40, 20):
            rows = [x for x in sel if parse_tag(x['tag'])[1] == arm and x['n'] == n]
            if rows:
                _, sc, _ = best_cell(rows, lambda x: float(parse_tag(x['tag'])[4]))
                s += sc[0]
        tot[r] = s
    return max(S3_RATES, key=lambda r: (tot[r], -r)), tot


def s3ab_arms():
    r, _ = s3_best_rate()
    return [f's3p_a_{r:g}', f's3p_b_{r:g}']



# ───────── 판정 ─────────
import numpy as np

BOOT = 2000


def _rng():
    return np.random.default_rng(20261013)


def ratio_of_means(a, b):
    sa, sb = float(np.sum(a)), float(np.sum(b))
    if sa > 0:
        return sb / sa
    return math.inf if sb > 0 else 1.0


def paired_ratio(a, b):
    """짝 (a_i, b_i) → b/a 평균비, 부트스트랩 95% (둘 다 0 → None)"""
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) == 0 or (a.sum() == 0 and b.sum() == 0):
        return None
    rng = _rng()
    idx = rng.integers(0, len(a), size=(BOOT, len(a)))
    sa, sb = a[idx].sum(1), b[idx].sum(1)
    with np.errstate(divide='ignore', invalid='ignore'):
        rs = np.where(sa > 0, sb / np.where(sa > 0, sa, 1), np.where(sb > 0, np.inf, 1.0))
    lo, hi = np.quantile(rs, [0.025, 0.975], method='inverted_cdf')  # inf 사이 보간(nan) 방지
    return dict(ratio=ratio_of_means(a, b), lo=float(lo), hi=float(hi), n=len(a))


def paired_diff(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) == 0:
        return None
    rng = _rng()
    idx = rng.integers(0, len(a), size=(BOOT, len(a)))
    d = b[idx].mean(1) - a[idx].mean(1)
    lo, hi = np.percentile(d, [2.5, 97.5])
    return dict(diff=float(b.mean() - a.mean()), lo=float(lo), hi=float(hi), n=len(a))


def boot_stat(x, f):
    x = np.asarray(x, float)
    rng = _rng()
    idx = rng.integers(0, len(x), size=(BOOT, len(x)))
    v = np.array([f(x[i]) for i in idx])
    lo, hi = np.percentile(v, [2.5, 97.5])
    return dict(value=float(f(x)), lo=float(lo), hi=float(hi), n=len(x))


def unpaired_diff(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    rng = _rng()
    ia = rng.integers(0, len(a), size=(BOOT, len(a)))
    ib = rng.integers(0, len(b), size=(BOOT, len(b)))
    d = b[ib].mean(1) - a[ia].mean(1)
    lo, hi = np.percentile(d, [2.5, 97.5])
    return dict(diff=float(b.mean() - a.mean()), lo=float(lo), hi=float(hi))


def r3(x):
    if x is None:
        return None
    if isinstance(x, float):
        if math.isinf(x):
            return 'inf'
        return round(x, 3)
    if isinstance(x, dict):
        return {k: r3(v) for k, v in x.items()}
    if isinstance(x, list):
        return [r3(v) for v in x]
    return x


def rep_of(rows, arm, n):
    """보고 시드 행 → {seed: row}"""
    out = {}
    for r in rows:
        t = parse_tag(r['tag'])
        if t[1] == arm and r['n'] == n and r['seed'] in REP:
            out[r['seed']] = r
    return out


def arm_stats(rep):
    v = list(rep.values())
    if not v:
        return None
    fl = [x['flipped'] for x in v]
    return dict(shots=len(v), K=parse_tag(v[0]['tag'])[4], mean_flipped=float(np.mean(fl)), p0=float(np.mean([x['zero'] for x in v])),
                mean_out=float(np.mean([x['out'] for x in v])), mean_flipped_out=float(np.mean([x['flipped_out'] for x in v])),
                p_ge10=float(np.mean([f >= 10 for f in fl])), max_flipped=int(max(fl)),
                jet_deg0_mean=float(np.mean([x['jet_deg0'] for x in v])), jet_up_frac=float(np.mean([x['jet_deg0'] > 0 for x in v])),
                audit_shots=int(sum(1 for x in v if sum(x['aud']) > 0)))


def pairs(repa, repb):
    ss = sorted(set(repa) & set(repb))
    return [repa[s]['flipped'] for s in ss], [repb[s]['flipped'] for s in ss], [repa[s]['zero'] for s in ss], [repb[s]['zero'] for s in ss]


def sel_table(rows, arm, n):
    """고르기 시드 격자 평균 (K → 평균 뒤집힘, 평균 원 밖)"""
    cells = {}
    for r in rows:
        t = parse_tag(r['tag'])
        if t[1] == arm and r['n'] == n and r['seed'] in SEL:
            cells.setdefault(t[4], []).append(r)
    return {k: dict(mean=round(float(np.mean([x['flipped'] for x in v])), 3), out=round(float(np.mean([x['out'] for x in v])), 2),
                    fout=round(float(np.mean([x['flipped_out'] for x in v])), 2), shots=len(v))
            for k, v in sorted(cells.items(), key=lambda kv: float(kv[0]) if kv[0] != 'v1' else 99)}


def audit_sum(rows):
    a = np.zeros(6, int)
    bad = 0
    for r in rows:
        a += np.asarray(r['aud'])
        bad += sum(r['aud']) > 0
    return dict(shots=len(rows), shots_with_violation=int(bad), h1=int(a[0]), h1_cavity=int(a[1]), h2=int(a[2]), h2c=int(a[3]), h3=int(a[4]), h4_nan=int(a[5]),
                cpu_s=round(sum(r['cpu_ms'] for r in rows) / 1000, 1))


def verdict_cmp(pr, need=1.15):
    if pr is None:
        return 'FAIL', '두 팔 모두 0장 → 비 정의 안 됨 (실패로 봄)'
    ok = pr['ratio'] >= need and pr['lo'] > 1.0
    return ('PASS' if ok else 'FAIL'), ''


def analyze():
    S = {}
    core = load('core_sel') + load('core_rep') + load('s5x_sel') + load('s5x_rep')
    # S1
    if load('core_rep'):
        s1 = dict(per_n={}, arms={})
        A, B = [], []
        for n in (20, 30, 40):
            ra, rb = rep_of(core, 'puff_q1', n), rep_of(core, 'pueok_q1', n)
            a, b, _, _ = pairs(ra, rb)
            A += a
            B += b
            s1['arms'][n] = dict(puff_q1=arm_stats(ra), pueok_q1=arm_stats(rb), sel_puff=sel_table(core, 'puff_q1', n), sel_pueok=sel_table(core, 'pueok_q1', n))
            s1['per_n'][n] = dict(ratio=paired_ratio(a, b), diff=paired_diff(a, b))
        pr = paired_ratio(A, B)
        v, why = verdict_cmp(pr)
        s1['pooled'] = dict(ratio=pr, diff=paired_diff(A, B), mean_puff=float(np.mean(A)), mean_pueok=float(np.mean(B)))
        s1['verdict'], s1['why'] = v, why
        S['S1'] = s1
    # S5
    if load('core_rep'):
        s5 = dict(curve={})
        for arm in ('puff_q1', 'pueok_q1'):
            for n in (10, 20, 30, 40, 50, 60):
                st = arm_stats(rep_of(core, arm, n))
                if st:
                    s5['curve'].setdefault(arm, {})[n] = st
        a20 = [r['flipped'] for r in rep_of(core, 'puff_q1', 20).values()]
        a40 = [r['flipped'] for r in rep_of(core, 'puff_q1', 40).values()]
        d = unpaired_diff(a20, a40)
        s5['n40_vs_n20_puff'] = d
        s5['n40_ge_n20'] = d['diff'] >= 0
        b20 = [r['flipped'] for r in rep_of(core, 'pueok_q1', 20).values()]
        b40 = [r['flipped'] for r in rep_of(core, 'pueok_q1', 40).values()]
        s5['n40_vs_n20_pueok'] = unpaired_diff(b20, b40)
        s5['kmax_ref'] = '설계서에 kmax(j, 쐐기) 식이 없음. 참고선: §2.5 문턱 0.93·kW(퍽)·0.57·kW(받쳐 밀기) → j 14.3 에서 k ≤ 15(퍽)·25(푸어억 시작) — 쐐기 효율 미정'
        s5['verdict'] = 'FAIL' if not s5['n40_ge_n20'] else 'INCONCLUSIVE'
        S['S5'] = s5
    # S6
    s6r = load('s6_rep')
    if s6r:
        main = [r for r in s6r if r['tag'].startswith('s6|') and r['seed'] in REP]
        v1 = [r for r in s6r if r['tag'].startswith('s6v1|')]
        fl = [r['flipped'] for r in main]
        med = boot_stat(fl, lambda x: float(np.median(x)))
        p10 = boot_stat(fl, lambda x: float(np.mean(x >= 10)))
        mean = boot_stat(fl, lambda x: float(np.mean(x)))
        ok = med['value'] >= 4 and p10['value'] >= 0.15
        P = 46 if (ok and med['value'] >= 6) else 40 if ok else 30
        intents = {}
        s6sel = load('s6_sel')
        for n in (30, 38, 46):
            rr = [r for r in main if r['n'] == n]
            intents[n] = dict(arm=parse_tag(rr[0]['tag'])[1], K=parse_tag(rr[0]['tag'])[4], mean=float(np.mean([r['flipped'] for r in rr])),
                              median=float(np.median([r['flipped'] for r in rr])), p_ge10=float(np.mean([r['flipped'] >= 10 for r in rr])),
                              mean_out=float(np.mean([r['out'] for r in rr])), sel={a: sel_table(s6sel, a, n) for a in ('s6_q0.85', 's6_q1.0')})
        fv = [r['flipped'] for r in v1]
        S['S6'] = dict(shots=len(fl), median=med, p_ge10=p10, mean=mean, verdict='PASS' if ok else 'FAIL', P=P, per_n=intents,
                       hist=np.bincount(np.asarray(fl, int)).tolist(),
                       v1_literal=dict(shots=len(fv), median=float(np.median(fv)) if fv else None, p_ge10=float(np.mean(np.asarray(fv) >= 10)) if fv else None,
                                       mean=float(np.mean(fv)) if fv else None))
    # S4
    s4 = load('s4')
    if s4:
        rows = {}
        u1_viol = 0
        u1_hidden = 0
        for r in s4:
            n, inset = r['n'], float(parse_tag(r['tag'])[2])
            rows.setdefault((n, inset), []).append(r)
            if inset * 0.89 > nominal(n, r['seed']):
                u1_hidden += 1
                u1_viol += r['flipped'] > 0
        tab = {}
        for (n, inset), v in sorted(rows.items()):
            wh = [x for x in v if x['whole']]
            tab[f'{n}|{inset}'] = dict(shots=len(v), available=float(np.mean([x['available'] for x in v])), mean_flipped=float(np.mean([x['flipped'] for x in v])),
                                      p_whole=float(np.mean([x['whole'] for x in v])), whole=len(wh),
                                      apex_ge08=float(np.mean([x['apex_rise'] >= 0.8 for x in wh])) if wh else None,
                                      mean_out=float(np.mean([x['out'] for x in v])), hidden=inset * 0.89 > nominal(n, 1))
        g = [x for x in s4 if float(parse_tag(x['tag'])[2]) == -0.30 and x['n'] in (4, 6, 8)]
        wh = [x for x in g if x['whole']]
        apex = float(np.mean([x['apex_rise'] >= 0.8 for x in wh])) if wh else 0.0
        pw = boot_stat([x['whole'] for x in g], lambda x: float(np.mean(x)))
        # 시드 단위 (더미 하나가 통째로 넘어가는 조건이 있는가)
        by_q = {}
        for x in g:
            by_q.setdefault(f"q{x['q']}|f{parse_tag(x['tag'])[5]}", []).append(x['whole'])
        ok = len(wh) > 0 and apex >= 0.5 and u1_viol == 0
        S['S4'] = dict(table=tab, o030_n4_8=dict(shots=len(g), whole=len(wh), p_whole=pw, apex_ge08_frac=apex,
                                                 p_whole_by_breath_aim={k: round(float(np.mean(v)), 3) for k, v in sorted(by_q.items())}),
                       u1=dict(hidden_shots=u1_hidden, violations=u1_viol), verdict='PASS' if ok else 'FAIL')
    # S2
    s2s, s2r = load('s2_sel'), load('s2_rep')
    if s2r and load('core_rep'):
        s2 = dict(per_n={}, combos=[dict(q=q, dur=d, cost=round(cost_pueok(q, d), 3)) for q, d in S2_COMBOS], cost_maxpuff=round(cost_puff(1.0), 3))
        A, B, A0, B0 = [], [], [], []
        for n in (30, 40):
            # 고르기 시드에서 가장 좋은 푸어억 팔 (+쓸기)
            sc = {}
            for arm in s2_arms():
                rows = [r for r in s2s if parse_tag(r['tag'])[1] == arm and r['n'] == n]
                _, s, _ = best_cell(rows, lambda r: float(parse_tag(r['tag'])[4]))
                sc[arm] = s
            best = max(sc, key=lambda a: sc[a])
            ra, rb = rep_of(core, 'puff_q1', n), rep_of(s2r, best, n)
            a, b, a0, b0 = pairs(ra, rb)
            A += a; B += b; A0 += a0; B0 += b0
            s2['per_n'][n] = dict(best_arm=best, sel_scores={k: r3(list(v)) for k, v in sc.items()}, maxpuff=arm_stats(ra), pueok=arm_stats(rb),
                                  all_arms={arm: arm_stats(rep_of(s2r, arm, n)) for arm in s2_arms()},
                                  ratio=paired_ratio(a, b), p0_ratio=paired_ratio(a0, b0), diff=paired_diff(a, b),
                                  sel={arm: sel_table(s2s, arm, n) for arm in s2_arms()})
        pr, p0r = paired_ratio(A, B), paired_ratio(A0, B0)
        okm = pr is not None and pr['ratio'] >= 1.15 and pr['lo'] > 1.0
        okp = p0r is not None and p0r['ratio'] <= 0.5 and p0r['hi'] < 1.0
        s2['pooled'] = dict(ratio=pr, p0_ratio=p0r, diff=paired_diff(A, B), p0_maxpuff=float(np.mean(A0)), p0_pueok=float(np.mean(B0)),
                            mean_maxpuff=float(np.mean(A)), mean_pueok=float(np.mean(B)))
        s2['verdict'] = 'PASS' if (okm or okp) else 'FAIL'
        # 실패 분기 '조준 관용 도구' 근거: 고르기 격자(오라클, 잡음 없음)에서 최선의 50% 이상인 칸 수
        band = {}
        for n in (30, 40):
            t1 = sel_table(core, 'puff_q1', n)
            t2 = sel_table(s2s, s2['per_n'][n]['best_arm'], n)
            def w(t):
                m = max(v['mean'] for v in t.values())
                return sum(1 for v in t.values() if m > 0 and v['mean'] >= 0.5 * m), m
            band[n] = dict(maxpuff=w(t1), pueok=w(t2))
        s2['aim_band_cells'] = band
        S['S2'] = s2
    # S3
    s3s, s3r = load('s3_sel') + load('s3ab_sel'), load('s3_rep') + load('s3ab_rep')
    if s3r:
        rstar, tot = s3_best_rate()
        fast = min(S3_RATES, key=lambda r: (abs(r - 2 * rstar), -r))
        s3 = dict(best_rate=rstar, sel_rate_scores=tot, too_fast_rate=fast, per_n={})
        A, B, F, P0, P9 = [], [], [], [], []
        for n in (40, 20):
            fx = rep_of(s3r, 's3p_c_0', n)
            arms = {}
            for arm in ['s3p_c_0'] + [f's3p_c_{r:g}' for r in S3_RATES] + [f's3p_a_{rstar:g}', f's3p_b_{rstar:g}', 's3f_0', 's3f_9']:
                rp = rep_of(s3r, arm, n)
                if not rp:
                    continue
                st = arm_stats(rp)
                if arm.startswith('s3p') and arm != 's3p_c_0':
                    a, b, _, _ = pairs(fx, rp)
                    st['vs_fixed'] = paired_ratio(a, b)
                    st['vs_fixed_diff'] = paired_diff(a, b)
                st['sel'] = sel_table(s3s, arm, n)
                arms[arm] = st
            a, b, _, _ = pairs(fx, rep_of(s3r, f's3p_c_{rstar:g}', n))
            A += a; B += b
            F += [r['flipped'] for r in rep_of(s3r, f's3p_c_{fast:g}', n).values()]
            p0, p9, _, _ = pairs(rep_of(s3r, 's3f_0', n), rep_of(s3r, 's3f_9', n))
            P0 += p0; P9 += p9
            s3['per_n'][n] = arms
        pr = paired_ratio(A, B)
        fast_ok = float(np.mean(F)) <= float(np.mean(A)) + 1e-12
        pp = paired_ratio(P0, P9)
        puff_ok = pp is None or (math.isfinite(pp['ratio']) and abs(pp['ratio'] - 1) <= 0.05)
        best_ok = pr is not None and pr['ratio'] >= 1.15 and pr['lo'] > 1.0
        s3['pooled'] = dict(best_vs_fixed=pr, diff=paired_diff(A, B), mean_fixed=float(np.mean(A)), mean_best=float(np.mean(B)), mean_too_fast=float(np.mean(F)),
                            too_fast_le_fixed=fast_ok, puff_sweep=pp, puff_effect_le_5pct=puff_ok, best_ok=best_ok)
        s3['verdict'] = 'PASS' if (best_ok and fast_ok and puff_ok) else 'FAIL'
        S['S3'] = s3
    # 감사
    S['audit'] = {ph: audit_sum(load(ph)) for ph in ('core_sel', 'core_rep', 's6_sel', 's6_rep', 's4', 's2_sel', 's2_rep', 's3_sel', 's3_rep', 's3ab_sel', 's3ab_rep', 's5x_sel', 's5x_rep') if load(ph)}
    S['protocol'] = dict(sel_seeds=[SEL[0], SEL[-1]], rep_seeds=[REP[0], REP[-1]], kgrid=KGRID, learner_noise=LEARN, s3_rates=S3_RATES, s2_combos=S2_COMBOS,
                         boot=BOOT, bin=os.path.relpath(BIN, REPO))
    with open(os.path.join(OUT, 'summary.json'), 'w') as f:
        json.dump(r3(S), f, ensure_ascii=False, indent=1)
    return S


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'run':
        for ph in sys.argv[2:]:
            run_lines(ph, plan(ph))
    elif len(sys.argv) >= 2 and sys.argv[1] == 'plan':
        for ph in sys.argv[2:]:
            L = plan(ph)
            print(ph, len(L))
    elif len(sys.argv) >= 2 and sys.argv[1] == 'analyze':
        S = analyze()
        print(json.dumps(r3({k: v.get('verdict') if isinstance(v, dict) else v for k, v in S.items() if k.startswith('S')}), ensure_ascii=False))
    elif len(sys.argv) >= 2 and sys.argv[1] == 'costs':
        cr = cost_puff(1.0)
        print('max puff', round(cr, 3), 'band', round(0.9 * cr, 3), round(1.1 * cr, 3))
        for q, d in S2_COMBOS:
            print(q, d, round(cost_pueok(q, d), 3))
    else:
        print(__doc__)
