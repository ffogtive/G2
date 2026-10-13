# Under-desk toy: pile overhangs the near desk edge by o; mouth below desk, jet up at theta hits exposed underside.
# Rigid whole pile, 2D (x toward player, y up). Pivot = back rim on desk. Real SI (Froude-equivalent).
import math, random, sys
g = 9.81; R = 0.025; p = 0.0012; m = 1.18e-3; W = m * g; rho = 1.2
B = 5.8; CS = 0.10; RC = 0.08  # chalk circle radius (pile-centred)

def seg_area(o):
    if o <= 0: return 0.0
    c = R - o
    return R * R * math.acos(c / R) - c * math.sqrt(max(R * R - c * c, 0.0))

def capture(o, x):
    """fraction of jet momentum hitting the exposed segment (Gaussian footprint vs segment), crude"""
    rh = CS * x; sig = rh / 1.1774
    chord = 2 * math.sqrt(max(2 * R * o - o * o, 0.0))
    # footprint stretched 1/sin(theta) along depth; approximate independent Gaussians clipped to box chord x o/sin
    def frac(half, s):
        return math.erf(half / (s * math.sqrt(2)))
    return frac(chord / 2 * 0.8, sig) * frac(o / 2 / math.sin(math.radians(45)), sig)

def run(N, o, jpk, theta_deg=45, dist=0.065, dur=0.13, seed=0, warp=0.0):
    rng = random.Random(seed)
    th = math.radians(theta_deg)
    Mk = N * m; h = N * p
    I = Mk * (1.25 * R * R + h * h / 3)
    cap = capture(o, dist) * (1 + warp * rng.uniform(-0.3, 0.3))
    lever0 = 2 * R - 0.4 * o
    a = 0.0; w = 0.0; t = 0.0; dt = 2e-4
    # phase 1: pivot about back rim; check lift-off (vertical force > weight -> launch)
    x_c = 0.0; y_c = h / 2; vx = 0.0; vy = 0.0; airborne = False
    while t < 1.5:
        if t < 0.03: j = jpk * t / 0.03
        elif t < dur - 0.05: j = jpk
        elif t < dur: j = jpk * (dur - t) / 0.05
        else: j = 0.0
        J = j * W
        # underside normal tilts back as pile rotates: incidence sin(a+th)
        Fn = J * cap * abs(math.sin(a + th)) if a < math.pi / 2 else 0.0
        # direction of normal force: along body 'up' axis (rotated by a toward back)
        Fx = -Fn * math.sin(a); Fy = Fn * math.cos(a)
        if not airborne:
            if Fy > Mk * g * 1.0 and a < 0.3:
                airborne = True
                vx, vy = 0.0, 0.0
            else:
                tq = Fn * lever0 - Mk * g * (R * math.cos(a) - h / 2 * math.sin(a))
                w += tq / I * dt; a += w * dt
                if a < 0: a = 0.0; w = 0.0
                if a >= math.atan2(2 * R, h):
                    # tips over backward: lands flipped near pile (about 2R back); if fast spin -> may bounce/overturn
                    land = -(2 * R) - 0.5 * w * 0.05
                    if w > 35: return ('coin', rng.random() < 0.5, abs(land) + R > RC)
                    return ('pivot', True, False)
                if t > dur + 0.3 and w <= 0 and a == 0.0:
                    return ('fail', False, False)
        else:
            # free flight: torque about COM from offset force (force acts at segment centroid ~ (R - 0.4o) from centre)
            Icm = Mk * (0.25 * R * R + h * h / 12)
            tq = Fn * (R - 0.4 * o)
            w += tq / Icm * dt; a += w * dt
            vx += (Fx / Mk) * dt; vy += (Fy / Mk - g) * dt
            # drag (face-on-ish, Cd 1.17)
            v = math.hypot(vx, vy); A = math.pi * R * R
            if v > 0:
                D = 0.5 * rho * 1.17 * A * abs(math.cos(a)) * v * v + 0.5 * rho * 0.2 * A * v * v
                vx -= D * vx / v / Mk * dt; vy -= D * vy / v / Mk * dt
            x_c += vx * dt; y_c += vy * dt
            if y_c <= h / 2 and vy < 0 and t > 0.01:
                halfturns = round(a / math.pi)
                flipped = (halfturns % 2 == 1)
                # partial: lands on edge -> 50/50
                frac = abs(a / math.pi - round(a / math.pi))
                if frac > 0.3: flipped = rng.random() < 0.5
                out = abs(x_c) + 0 > RC - 0.0 or x_c > 0.5 * R  # falls off front (x>0 toward player beyond edge)
                return ('launch', flipped, out)
        t += dt
    return ('fail', False, False)

if __name__ == '__main__':
    for o_mm in (0, 5, 10):
        o = o_mm / 1000
        print(f"overhang {o_mm} mm: segment {seg_area(o)*1e4:.2f} cm2, capture@6.5cm {capture(o,0.065) if o>0 else 0:.2f}")
        for N in (2, 4, 6, 8, 10, 12, 15, 20):
            row = []
            for j in (6, 9, 12, 15, 20):
                res = [run(N, o, j, seed=s, warp=1.0) for s in range(40)] if o > 0 else [('fail', False, False)]
                kinds = {}
                for r in res: kinds[r[0]] = kinds.get(r[0], 0) + 1
                pf = sum(1 for r in res if r[1] and not r[2]) / len(res)
                po = sum(1 for r in res if r[2]) / len(res)
                k = max(kinds, key=kinds.get)
                row.append(f"j{j}:{k[:4]} win{pf:.2f} out{po:.2f}")
            print(f"  N={N:2d} " + ' | '.join(row))
