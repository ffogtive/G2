//! f64 기하: 벡터·쿼터니언·해석적 광선 판정(평평한 원기둥, 축 정렬 상자).
//! 설계서 §4.8: 핫패스에서 parry cast_ray 금지 → 모든 가림을 해석적으로. 초월함수는 libm.

use core::ops::{Add, AddAssign, Mul, Neg, Sub, SubAssign};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl V3 {
    pub const ZERO: V3 = V3 { x: 0.0, y: 0.0, z: 0.0 };
    pub const Y: V3 = V3 { x: 0.0, y: 1.0, z: 0.0 };
    #[inline]
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    #[inline]
    pub fn dot(self, o: V3) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    #[inline]
    pub fn cross(self, o: V3) -> V3 {
        V3::new(self.y * o.z - self.z * o.y, self.z * o.x - self.x * o.z, self.x * o.y - self.y * o.x)
    }
    #[inline]
    pub fn len2(self) -> f64 {
        self.dot(self)
    }
    #[inline]
    pub fn len(self) -> f64 {
        libm::sqrt(self.len2())
    }
    #[inline]
    pub fn norm(self) -> V3 {
        let l = self.len();
        if l > 0.0 {
            self * (1.0 / l)
        } else {
            V3::ZERO
        }
    }
    #[inline]
    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }
    #[inline]
    pub fn hlen(self) -> f64 {
        libm::sqrt(self.x * self.x + self.z * self.z)
    }
}

impl Add for V3 {
    type Output = V3;
    #[inline]
    fn add(self, o: V3) -> V3 {
        V3::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
}
impl AddAssign for V3 {
    #[inline]
    fn add_assign(&mut self, o: V3) {
        self.x += o.x;
        self.y += o.y;
        self.z += o.z;
    }
}
impl Sub for V3 {
    type Output = V3;
    #[inline]
    fn sub(self, o: V3) -> V3 {
        V3::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
}
impl SubAssign for V3 {
    #[inline]
    fn sub_assign(&mut self, o: V3) {
        self.x -= o.x;
        self.y -= o.y;
        self.z -= o.z;
    }
}
impl Mul<f64> for V3 {
    type Output = V3;
    #[inline]
    fn mul(self, s: f64) -> V3 {
        V3::new(self.x * s, self.y * s, self.z * s)
    }
}
impl Neg for V3 {
    type Output = V3;
    #[inline]
    fn neg(self) -> V3 {
        V3::new(-self.x, -self.y, -self.z)
    }
}

/// 단위 쿼터니언 (x, y, z, w)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Qt {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

impl Qt {
    pub const ID: Qt = Qt { x: 0.0, y: 0.0, z: 0.0, w: 1.0 };
    pub fn axis_angle(ax: V3, ang: f64) -> Qt {
        let s = libm::sin(ang * 0.5);
        Qt { x: ax.x * s, y: ax.y * s, z: ax.z * s, w: libm::cos(ang * 0.5) }
    }
    pub fn mul(self, b: Qt) -> Qt {
        let a = self;
        Qt {
            w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
            x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        }
    }
    pub fn conj(self) -> Qt {
        Qt { x: -self.x, y: -self.y, z: -self.z, w: self.w }
    }
    /// v' = q v q*
    #[inline]
    pub fn rotate(self, v: V3) -> V3 {
        let u = V3::new(self.x, self.y, self.z);
        let t = u.cross(v) * 2.0;
        v + t * self.w + u.cross(t)
    }
    #[inline]
    pub fn inv_rotate(self, v: V3) -> V3 {
        self.conj().rotate(v)
    }
    pub fn normalized(self) -> Qt {
        let l = libm::sqrt(self.x * self.x + self.y * self.y + self.z * self.z + self.w * self.w);
        Qt { x: self.x / l, y: self.y / l, z: self.z / l, w: self.w / l }
    }
}

/// x 축 회전 (오른손): (y, z) → (y cos θ − z sin θ, y sin θ + z cos θ). θ > 0 = 고개 듦(−z 로 향한 제트가 위로)
#[inline]
pub fn rot_x(v: V3, th: f64) -> V3 {
    let (s, c) = (libm::sin(th), libm::cos(th));
    V3::new(v.x, v.y * c - v.z * s, v.y * s + v.z * c)
}

/// 광선(로컬 좌표: 축 y, 반높이 hh, 반지름 r) vs 평평한 원기둥. 들어가는 t (≥ 0) 를 돌려준다. tmax 넘으면 None
#[inline]
pub fn ray_cyl_local(o: V3, d: V3, hh: f64, r: f64, tmax: f64) -> Option<f64> {
    let (mut t0, mut t1) = (0.0f64, tmax);
    if libm::fabs(d.y) < 1e-15 {
        if libm::fabs(o.y) > hh {
            return None;
        }
    } else {
        let inv = 1.0 / d.y;
        let mut a = (-hh - o.y) * inv;
        let mut b = (hh - o.y) * inv;
        if a > b {
            core::mem::swap(&mut a, &mut b);
        }
        if a > t0 {
            t0 = a;
        }
        if b < t1 {
            t1 = b;
        }
        if t0 > t1 {
            return None;
        }
    }
    let aa = d.x * d.x + d.z * d.z;
    let bb = 2.0 * (o.x * d.x + o.z * d.z);
    let cc = o.x * o.x + o.z * o.z - r * r;
    if aa < 1e-18 {
        if cc > 0.0 {
            return None;
        }
    } else {
        let disc = bb * bb - 4.0 * aa * cc;
        if disc < 0.0 {
            return None;
        }
        let s = libm::sqrt(disc);
        let c0 = (-bb - s) / (2.0 * aa);
        let c1 = (-bb + s) / (2.0 * aa);
        if c0 > t0 {
            t0 = c0;
        }
        if c1 < t1 {
            t1 = c1;
        }
        if t0 > t1 {
            return None;
        }
    }
    Some(t0)
}

/// 축 정렬 상자 [lo, hi] vs 광선. 들어가는 t (≥ 0)
#[inline]
pub fn ray_box(o: V3, d: V3, lo: V3, hi: V3, tmax: f64) -> Option<f64> {
    let (mut t0, mut t1) = (0.0f64, tmax);
    let oo = [o.x, o.y, o.z];
    let dd = [d.x, d.y, d.z];
    let l = [lo.x, lo.y, lo.z];
    let h = [hi.x, hi.y, hi.z];
    for k in 0..3 {
        if libm::fabs(dd[k]) < 1e-15 {
            if oo[k] < l[k] || oo[k] > h[k] {
                return None;
            }
        } else {
            let inv = 1.0 / dd[k];
            let mut a = (l[k] - oo[k]) * inv;
            let mut b = (h[k] - oo[k]) * inv;
            if a > b {
                core::mem::swap(&mut a, &mut b);
            }
            if a > t0 {
                t0 = a;
            }
            if b < t1 {
                t1 = b;
            }
            if t0 > t1 {
                return None;
            }
        }
    }
    Some(t0)
}

/// 황금각 해바라기(Vogel) 면 표본: 반지름 1 원판 위 N 점, 점마다 넓이 π/N. (r, φ)
pub fn vogel(n: usize) -> Vec<(f64, f64)> {
    let ga = core::f64::consts::PI * (3.0 - libm::sqrt(5.0));
    (0..n)
        .map(|m| {
            let r = libm::sqrt((m as f64 + 0.5) / n as f64);
            let mut ph = m as f64 * ga;
            ph -= libm::floor(ph / (2.0 * core::f64::consts::PI)) * 2.0 * core::f64::consts::PI;
            (r, ph)
        })
        .collect()
}

pub fn deg(r: f64) -> f64 {
    r * 180.0 / core::f64::consts::PI
}
pub fn rad(d: f64) -> f64 {
    d * core::f64::consts::PI / 180.0
}
