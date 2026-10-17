//! TUNE — sim.js 의 TUNE 값(바람 모델) + Rapier 0.36 솔버 손잡이.
//!
//! 바람 모델 값은 sim.js 와 이름·값이 같다(snake_case). 솔버 손잡이는 Rapier JS 0.12(= rapier 0.18, PGS 작은 스텝)
//! 설정을 0.36(soft-TGS) 의 가장 가까운 짝으로 옮긴 것:
//!   JS ip.erp = 0.2, damping_ratio = 1.0(기본), numSolverIterations = 8, numInternalPgsIterations = 1
//!   0.18 은 서브스텝마다 dt/8, damping_ratio/8 을 썼다 → 0.36 contact_softness(ω, ζ) 를 같은 erp·cfm 이 나오게 역산
//!   (erp_sub = dtω/(dtω+2ζ) = 0.2, ζ = 1/8 → ω = 2ζ·erp/((1−erp)·dt_sub) = 60 rad/s ≈ 9.55 Hz)

#[derive(Clone, Debug, PartialEq)]
pub struct Tune {
    // ── 물리 기본 (sim.js) ──
    pub gravity: f64,
    pub dt: f64,
    pub density: f64,
    pub friction: f64,
    pub restitution: f64,
    pub lin_damp: f64,
    pub ang_damp: f64,
    pub erp: f64,
    // ── 바람(puff) 모델 (sim.js, 이름 같음) ──
    pub puff_duration: f64,
    pub jet_r0: f64,
    pub jet_spread: f64,
    pub jet_falloff: f64,
    pub lift: f64,
    pub push: f64,
    pub gap_ref: f64,
    pub min_lift: f64,
    pub shield: f64,
    pub push_exp: f64,
    pub sweet: f64,
    pub tumble: f64,
    pub jitter: f64,
    pub blast_lift: f64,
    pub blast_push: f64,
    pub blast_shove: f64,
    pub circle_r: f64,
    pub rim_hit: f64,
    pub side_lift_loss: f64,
    pub deflect: f64,
    pub spin: f64,
    pub protrude_p: f64,
    pub prot_min: f64,
    pub prot_max: f64,
    pub pitch0: f64,
    pub tilt_spread: f64,
    // 9차 입술 높이 경로(blow mouthY) — 게임이 실제로 쓰는 '책상 입'
    pub lip_back: f64,
    pub lip_min_y: f64,
    pub lip_gap: f64,
    pub lip_air_ref: f64,
    pub lip_rise: f64,
    pub lip_carry: f64,
    pub lip_push_up: f64,
    pub lip_press: f64,
    pub lip_press_blast: f64,
    pub lip_split: f64,
    pub lip_split_w: f64,
    // ── Rapier 0.36 솔버 손잡이 (Rust 전용) ──
    /// JS numSolverIterations (0.18 에선 = 서브스텝 수)
    pub substeps: f64,
    pub pgs_iters: f64,
    /// 0.36 의 '편향 없는 이완' 반복 (0.18 은 서브스텝마다 1번 solve_wo_bias)
    pub stab_iters: f64,
    /// 0.18 damping_ratio (서브스텝 수로 나눠 씀)
    pub damping_ratio: f64,
    /// erp → ω 역산 대신 직접 줄 때(>0 이면 우선): contact natural frequency(Hz)
    pub contact_hz: f64,
    /// 직접 줄 때의 ζ (contact_hz > 0 일 때만)
    pub contact_zeta: f64,
    /// 책상(고정 몸체)과의 접촉 erp. 0 이면 erp 와 같음 (0.36 은 고정 몸체 접촉을 따로 둔다)
    pub static_erp: f64,
    pub allowed_err: f64,
    pub prediction: f64,
    /// 0 = 무한(0.18 은 max_penetration_correction = MAX)
    pub max_corrective: f64,
    /// 1 = Coulomb(0.18 과 같음), 0 = Simplified(0.36 기본)
    pub coulomb: f64,
    pub recycle: f64,
    pub friction_bias: f64,
    pub gyro: f64,
    /// 잠들기 임계(0.36 point-drift 기준). 0.18 은 |v|<0.4·|ω|<0.5 를 2초
    pub sleep_lin: f64,
    pub sleep_time: f64,
    pub ground_friction: f64,
    pub ccd: f64,
    pub warmstart: f64,
}

impl Default for Tune {
    fn default() -> Self {
        Self {
            gravity: 38.0,
            dt: 1.0 / 120.0,
            density: 1.0,
            friction: 0.42, // JS 0.75. 0.18 은 마찰을 무른 편향 단계 법선 충격량에 묶어 풀어 실효 마찰이 약했다
            restitution: 0.0,
            lin_damp: 0.35,
            ang_damp: 1.0,
            // 엔진 손잡이 — JS 값 그대로면 0.36 에서 더미가 25% 더 눌리고 돌풍에 덜 날아간다 → parity 로 다시 맞춤(README '엔진 매핑')
            erp: 0.26, // JS 0.2. 0.18 (erp, ζ/서브스텝) → 0.36 스프링 역산식에 넣는 값
            puff_duration: 0.131,
            jet_r0: 0.471,
            jet_spread: 0.14,
            jet_falloff: 6.5,
            lift: 519.59,
            push: 21.993,
            gap_ref: 0.293,
            min_lift: 0.151,
            shield: 0.35,
            push_exp: 2.934,
            sweet: 0.938,
            tumble: 9.931,
            jitter: 0.12,
            blast_lift: 0.6,
            blast_push: 18.2, // JS 15. 엔진 차이로 약해진 돌풍(원 밖 날림)을 맞춤 — 바람 모델에서 바꾼 값은 이 둘뿐
            blast_shove: 1.92, // JS 3
            circle_r: 3.2,
            rim_hit: 1.0,
            side_lift_loss: 0.5,
            deflect: 0.6,
            spin: 8.0,
            protrude_p: 0.0,
            prot_min: 0.14,
            prot_max: 0.26,
            pitch0: 0.1,
            tilt_spread: 1.0,
            lip_back: 2.6,
            lip_min_y: 0.15,
            lip_gap: 0.15,
            lip_air_ref: 0.02,
            lip_rise: 0.25,
            lip_carry: 0.4,
            lip_push_up: 1.0,
            lip_press: 0.5,
            lip_press_blast: 1.1,
            lip_split: 1.0,
            lip_split_w: 0.1,
            // 솔버: 0.18 등가 출발점 (src/table.rs apply_solver 참고)
            substeps: 9.0, // JS numSolverIterations 8
            pgs_iters: 1.0,
            stab_iters: 1.0,
            damping_ratio: 1.0,
            contact_hz: 0.0,
            contact_zeta: 0.0,
            static_erp: 0.16, // 책상 접촉만 더 무르게(JS 더미 바닥이 책상에 0.06~0.08 파묻힌 것)
            allowed_err: 0.001,
            prediction: 0.002,
            max_corrective: 0.0,
            coulomb: 1.0,
            recycle: 0.0,
            friction_bias: 1.0,
            gyro: 0.0,
            sleep_lin: 0.45,
            sleep_time: 2.0,
            ground_friction: 0.47, // JS 0.9 (같은 이유)
            ccd: 1.0,
            warmstart: 1.0,
        }
    }
}

impl Tune {
    /// sim.js 값을 글자 그대로 + 0.18 → 0.36 수식 매핑만 (다시 맞추기 전 출발점 — parity 비교용 `PRESET=web`)
    pub fn web_literal() -> Self {
        Self {
            erp: 0.2,
            friction: 0.75,
            blast_push: 15.0,
            blast_shove: 3.0,
            substeps: 8.0,
            static_erp: 0.0,
            ground_friction: 0.9,
            ..Self::default()
        }
    }
}

macro_rules! tune_keys {
    ($($name:ident => $js:literal),* $(,)?) => {
        impl Tune {
            /// 이름(snake_case 또는 sim.js camelCase)으로 값 바꾸기. 모르는 이름이면 false
            #[allow(unreachable_patterns)]
            pub fn set(&mut self, key: &str, v: f64) -> bool {
                match key {
                    $(stringify!($name) | $js => { self.$name = v; true })*
                    _ => false,
                }
            }
            #[allow(unreachable_patterns)]
            pub fn get(&self, key: &str) -> Option<f64> {
                match key {
                    $(stringify!($name) | $js => Some(self.$name),)*
                    _ => None,
                }
            }
            /// 정렬된 (이름, 값) — 해시·출력용
            pub fn entries(&self) -> Vec<(&'static str, f64)> {
                vec![$((stringify!($name), self.$name)),*]
            }
        }
    };
}

tune_keys! {
    gravity => "gravity", dt => "dt", density => "density", friction => "friction", restitution => "restitution",
    lin_damp => "linDamp", ang_damp => "angDamp", erp => "erp",
    puff_duration => "puffDuration", jet_r0 => "jetR0", jet_spread => "jetSpread", jet_falloff => "jetFalloff",
    lift => "lift", push => "push", gap_ref => "gapRef", min_lift => "minLift", shield => "shield", push_exp => "pushExp",
    sweet => "sweet", tumble => "tumble", jitter => "jitter", blast_lift => "blastLift", blast_push => "blastPush",
    blast_shove => "blastShove", circle_r => "circleR", rim_hit => "rimHit", side_lift_loss => "sideLiftLoss",
    deflect => "deflect", spin => "spin", protrude_p => "protrudeP", prot_min => "protMin", prot_max => "protMax",
    pitch0 => "pitch0", tilt_spread => "tiltSpread",
    lip_back => "lipBack", lip_min_y => "lipMinY", lip_gap => "lipGap", lip_air_ref => "lipAirRef", lip_rise => "lipRise",
    lip_carry => "lipCarry", lip_push_up => "lipPushUp", lip_press => "lipPress", lip_press_blast => "lipPressBlast",
    lip_split => "lipSplit", lip_split_w => "lipSplitW",
    substeps => "substeps", pgs_iters => "pgsIters", stab_iters => "stabIters", damping_ratio => "dampingRatio",
    contact_hz => "contactHz", contact_zeta => "contactZeta", static_erp => "staticErp", allowed_err => "allowedErr", prediction => "prediction",
    max_corrective => "maxCorrective", coulomb => "coulomb", recycle => "recycle", friction_bias => "frictionBias",
    gyro => "gyro", sleep_lin => "sleepLin", sleep_time => "sleepTime", ground_friction => "groundFriction",
    ccd => "ccd", warmstart => "warmstart",
}

impl Tune {
    /// "push=22,lift=500" 형식 덮어쓰기 (CLI·FFI 공용). 모르는 이름은 Err
    pub fn apply_overrides(&mut self, spec: &str) -> Result<(), String> {
        for part in spec.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            let (k, v) = part.split_once('=').ok_or_else(|| format!("'{part}' 는 key=value 가 아님"))?;
            let v: f64 = v.trim().parse().map_err(|_| format!("'{part}' 값이 숫자가 아님"))?;
            if !self.set(k.trim(), v) {
                return Err(format!("모르는 TUNE 이름 '{k}'"));
            }
        }
        Ok(())
    }

    /// 0.18 등가 접촉 스프링: (natural_frequency Hz, damping_ratio)
    pub fn contact_spring(&self) -> (f64, f64) {
        if self.contact_hz > 0.0 {
            return (self.contact_hz, self.contact_zeta.max(0.0));
        }
        self.spring_for_erp(self.erp)
    }

    /// 책상 접촉 스프링 (static_erp > 0 이면 따로)
    pub fn static_spring(&self) -> (f64, f64) {
        if self.static_erp > 0.0 {
            self.spring_for_erp(self.static_erp)
        } else {
            self.contact_spring()
        }
    }

    /// 0.18 의 (erp, damping_ratio / 서브스텝) → 0.36 의 (Hz, ζ): erp_sub = dtω/(dtω + 2ζ) 를 풀어서
    pub fn spring_for_erp(&self, erp: f64) -> (f64, f64) {
        let n = self.substeps.max(1.0);
        let dt_sub = self.dt / n;
        let zeta = self.damping_ratio / n;
        let erp = erp.clamp(1e-4, 0.9999);
        let omega = 2.0 * zeta * erp / ((1.0 - erp) * dt_sub);
        (omega / (2.0 * core::f64::consts::PI), zeta)
    }

    /// TUNE 전체의 32비트 지문 (sim.js simVersion 과 같은 용도: 같은 엔진·같은 규칙인지)
    pub fn fingerprint(&self) -> u64 {
        let mut h = crate::Fnv64::new();
        for (k, v) in self.entries() {
            h.bytes(k.as_bytes());
            h.u64(v.to_bits());
        }
        h.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn spring_matches_018_erp() {
        let t = Tune::web_literal();
        let (hz, zeta) = t.contact_spring();
        let omega = hz * 2.0 * core::f64::consts::PI;
        let dt = t.dt / 8.0;
        let erp = dt * omega / (dt * omega + 2.0 * zeta);
        assert!((erp - 0.2).abs() < 1e-12, "erp {erp}");
        assert!((omega - 60.0).abs() < 1e-9, "omega {omega}");
    }
    #[test]
    fn set_by_js_name() {
        let mut t = Tune::default();
        assert!(t.set("pushExp", 3.0));
        assert_eq!(t.push_exp, 3.0);
        assert!(t.apply_overrides("lift=500, lip_gap=0.2").is_ok());
        assert_eq!(t.lift, 500.0);
        assert!(t.apply_overrides("nope=1").is_err());
    }
}
