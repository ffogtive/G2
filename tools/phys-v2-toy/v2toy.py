# v2 toy: 2D lumped pile + quasi-steady jet, real SI units (Froude-equivalent to the slow sim world)
# Purpose: sanity-check that the v2 spec's equations (with literature-range params) produce the intended
# causal structure (pose x breath x sweep x N) and no single dominant option. NOT the engine.
import math, random, sys

g = 9.81; R = 0.025; p = 0.0012; m = 1.18e-3; W = m * g; rho = 1.2
B = 5.8; CS = 0.10
MU_PP = 0.45; MU_PT = 0.38
A_C = 0.5 * math.pi * R * R; L_C = 1.4 * R
C_FACE = 0.8
A_LEAK = 0.25          # rad: cavity seal lost as front rim opens
DT = 5e-4

def jet_q(J, A0, x):
    """centerline dynamic pressure at slant distance x (momentum-conserving far field, core cap)"""
    U0 = math.sqrt(J / (rho * A0))
    d0 = math.sqrt(4 * A0 / math.pi)
    Uc = U0 * min(1.0, B * d0 / max(x, 1e-4))
    rh = max(d0 / 2, CS * x)
    return 0.5 * rho * Uc * Uc, rh

def warp_pile(N, rng, wedge_p=0.30):
    """eta per interface: front-open wedge / neutral / back-open"""
    etas = []
    for i in range(N):
        r = rng.random()
        if r < wedge_p: etas.append(rng.uniform(0.30, 0.60))
        elif r < wedge_p + 0.5: etas.append(rng.uniform(0.03, 0.12))
        else: etas.append(rng.uniform(0.0, 0.02))
    return etas

def breath(kind, t, jpk, T):
    """returns j(t) in disc weights"""
    if kind == 'puff':  # rise 30ms, hold 50ms, decay 50ms
        if t < 0.03: return jpk * t / 0.03
        if t < 0.08: return jpk
        if t < 0.13: return jpk * (0.13 - t) / 0.05
        return 0.0
    else:               # long: rise 80ms, decay to 0.6 at T, release 80ms
        if t < 0.08: return jpk * t / 0.08
        if t < T: return jpk * (1 - 0.4 * (t - 0.08) / max(T - 0.08, 1e-3))
        if t < T + 0.08: return jpk * 0.6 * (T + 0.08 - t) / 0.08
        return 0.0

def run(N, pose, kind, jpk, aim_k, sweep=0.0, T=0.6, seed=1, A0=1.2e-4, Tmax=1.2):
    """aim_k: target interface counted from top (1 = under top disc). returns (flipped, slid_out)"""
    rng = random.Random(seed)
    etas = warp_pile(N, rng)
    n = N                      # discs remaining in pile (interfaces 0..n-1, interface i under disc i, 0 = table)
    flipped = 0
    # pose geometry: mouth height ym, horizontal distance xd to pile face
    if pose == 'chin': ym, xd = 0.045, 0.075
    elif pose == 'eye':  ym, xd = None, 0.09
    aim_y0 = max(0.0, (N - aim_k) * p)  # height of target interface
    active = None              # (i, a, w)
    slid = 0.0; vslide = 0.0
    t = 0.0
    while t < Tmax:
        j = breath(kind, t, jpk, T)
        H = n * p
        if pose == 'eye': ym_now = N * p + 0.05
        else: ym_now = ym
        if kind == 'long' and sweep > 0: ym_now += 0.3 * sweep * max(0.0, t - 0.08)
        # sweep: aim point rises (chin: head pivots on chin -> aim rises at 'sweep' m/s)
        aim_y = aim_y0 + (sweep * max(0.0, t - 0.08) if kind == 'long' else 0.0)
        if j <= 0 and active is None:
            if t > (0.15 if kind == 'puff' else T + 0.1): break
        J = j * W
        dy = aim_y - ym_now
        th = math.atan2(dy, xd)            # + = upward jet
        x = math.hypot(xd, dy)
        if J > 0: qc, rh = jet_q(J, A0, x)
        else: qc, rh = 0.0, 0.01
        def q_at(y):
            return qc * math.exp(-2 * math.log(2) * ((y - aim_y) * math.cos(th) / rh) ** 2)
        # momentum per height slice (horizontal component), for face push and whole-pile slide
        def dJdy(y):
            return 2 * q_at(y) * rh * 1.505 * math.cos(th)
        # whole-pile slide on table
        Fh = 0.0
        ys = [k * p + p / 2 for k in range(n)]
        if J > 0:
            for y in ys: Fh += C_FACE * dJdy(y) * p * math.cos(th)
        press = 0.0
        if th < 0:  # descending jet: the part above the pile top lands on the top face and presses
            for k in range(30):
                y = H + (k + 0.5) * 0.002
                press += dJdy(y) * 0.002 * math.sin(-th) * 0.5
        cap = MU_PT * (n * W + press)
        if Fh > cap and active is None:
            vslide += (Fh - cap) / (n * m) * DT
        if vslide > 0:
            vslide -= MU_PT * g * DT if Fh <= cap else 0
            vslide = max(vslide, 0.0); slid += vslide * DT
        if active is None and J > 0:
            # per-layer face push (horizontal) and its moment about layer base, prefix from top
            fl = [C_FACE * dJdy(k_ * p + p / 2) * p * math.cos(th) for k_ in range(n)]
            # moment about interface i of layers above: sum fl[l]*(l-i+0.5)p
            S0 = [0.0] * (n + 1); S1 = [0.0] * (n + 1)
            for l in range(n - 1, -1, -1):
                S0[l] = S0[l + 1] + fl[l]; S1[l] = S1[l + 1] + fl[l] * (l + 0.5) * p
            for i in range(n):
                k = n - i
                yi = i * p
                pin = q_at(yi) * math.cos(th) ** 2
                tq = etas[i] * pin * A_C * L_C + (S1[i] - S0[i] * yi)
                if i == n - 1 and th >= -0.2:
                    qtop = q_at(H + 0.002)
                    tq += 0.6 * qtop * (math.pi * R * R / 3) * 1.6 * R
                if tq > k * W * R * 1.0:
                    fpush = S0[i]
                    lift = etas[i] * pin * A_C
                    if fpush > MU_PP * max(k * W - lift, 0.0) and k <= 3 and tq < 1.5 * k * W * R:
                        if rng.random() < 0.3: flipped += k
                        n -= k; break
                    active = [i, 0.0, 0.0]
                    break
        if active is not None:
            i, a, w = active; k = n - i; Mk = k * m; h = k * p
            I = Mk * (1.25 * R * R + h * h / 3)
            yb = i * p
            c = 1.0 / (1.0 + (a / A_LEAK) ** 2)
            tq = 0.0
            if J > 0:
                pin = q_at(yb) * math.cos(th) ** 2
                tq += c * etas[i] * pin * A_C * L_C
                # direct impingement on the exposed underside (slices between base and lifted rim)
                yrim = yb + 2 * R * math.sin(a)
                ny = 8
                for s in range(ny):
                    y = yb + (s + 0.5) * (yrim - yb) / ny
                    if yrim - yb < 1e-6: break
                    dj = dJdy(y) / math.cos(th) * (yrim - yb) / ny
                    lev = min(2 * R, max(0.3 * R, (y - yb) / max(math.sin(a), 1e-6)))
                    tq += (1 - c) * dj * abs(math.sin(a + th)) * lev
                # face push of block
                for kk in range(k):
                    y = yb + (kk + 0.5) * p * math.cos(a)
                    tq += C_FACE * dJdy(y) * p * math.cos(th) * (kk + 0.5) * p
            tq -= Mk * g * (R * math.cos(a) - h / 2 * math.sin(a))
            w += tq / I * DT; a += w * DT
            if a <= 0 and w < 0: a = 0.0; w = 0.0
            active = [i, a, w]
            ac = math.atan2(2 * R, h)
            if a >= ac:
                # flips over; if very fast, coin flip (multiple half-turns)
                if w > 35: flipped += k if rng.random() < 0.5 else 0
                else: flipped += k
                n = i; active = None
                if n == 0: break
            elif a == 0.0 and J <= 0:
                active = None
        t += DT
    out = slid > 0.055  # pile center moved > 5.5 cm -> discs out of circle (r=8cm)
    return flipped, out, slid

def stats(N, pose, kind, jpk, aim_k, sweep=0.0, T=0.6, seeds=60):
    fs = []; outs = 0; zero = 0
    for s in range(seeds):
        f, o, sl = run(N, pose, kind, jpk, aim_k, sweep, T, seed=1000 * N + s)
        if o: f = 0; outs += 1
        fs.append(f); zero += (f == 0)
    return sum(fs) / len(fs), zero / len(fs), outs / len(fs)

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'grid'
    if mode == 'grid':
        for N in (5, 10, 20, 40):
            print(f"=== N={N}")
            for pose in ('chin', 'eye'):
                for kind, jpk, sw in (('puff', 6, 0), ('puff', 12, 0), ('puff', 20, 0), ('long', 9, 0.0), ('long', 9, 0.03), ('long', 9, 0.06), ('long', 9, 0.12)):
                    best = None
                    rows = []
                    for aim_k in sorted(set([1, 2, 3, 4, 6, 8, 12, 16, 24, 32, N])):
                        if aim_k > N: continue
                        mu, z, o = stats(N, pose, kind, jpk, aim_k, sw, seeds=40)
                        rows.append((aim_k, mu, z, o))
                        if best is None or mu > best[1]: best = (aim_k, mu, z, o)
                    print(f"{pose:4s} {kind:4s} j={jpk:2d} sw={sw:.2f}  best aim k={best[0]:2d}: mean {best[1]:5.2f} zero {best[2]:.2f} out {best[3]:.2f} | " + ' '.join(f"{r[0]}:{r[1]:.1f}" for r in rows))
