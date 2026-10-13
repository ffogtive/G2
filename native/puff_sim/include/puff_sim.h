/* puff_sim.h — PUFF! 딱지 물리 (Rust + rapier3d 0.36) C ABI.
 *
 * 한 핸들 = 한 판(책상 + 딱지 더미). 스레드 하나에서만 쓴다. null 핸들은 아무것도 안 하고 0 을 돌려준다.
 * 단위는 웹 sim.js 와 같다: 딱지 반지름 1(≈2.5cm), 두께 0.11, +Y 위, 분필 원 r = 3.2, 1스텝 = 1/120초.
 * 결정성: 같은 seed·같은 호출 순서 → 같은 puff_state_hash (x86_64·arm64·wasm32, enhanced-determinism).
 *
 * 전형적인 한 판:
 *   PuffSim* s = puff_new(seed);
 *   puff_add_pile(s, 12, 0.07, 0, 0, 0);  puff_settle(s, 600);
 *   PuffShotArgs a = { .lat = 0, .h = puff_layer_y(s, 2), .breath = 0.9 * puff_sweet_hi_for(12), .dir_x = 0, .dir_z = -1 };
 *   puff_shot(s, &a, &result);
 *   while (!puff_step_judge(s)) { puff_transforms(s, buf, cap); render(buf); }   // 120Hz 면 프레임당 1스텝
 *   puff_judge(s, &j);  puff_take_flipped(s);  puff_restack(s, 0, 0);
 *   puff_free(s);
 */
#ifndef PUFF_SIM_H
#define PUFF_SIM_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct PuffSim PuffSim;

typedef struct PuffBlowArgs {
  double aim_x, aim_y, aim_z; /* 맞힐 지점 */
  double dir_x, dir_z;        /* 부는 수평 방향 */
  double power;               /* 물리 세기 (rules 를 거친 값; 초록 = 0.95, 1장 = 0.75) */
  double blast;               /* 돌풍 0..1.4 */
  double dist;                /* 입~조준점 거리 (0 이면 2.6) */
  double pitch;               /* 내려 부는 각 (기본 0.1) */
  double mouth_y;             /* 입 높이(절대 y) — use_mouth_y != 0 일 때만 (9차 '책상 입' = 0.15) */
  uint32_t use_mouth_y;
} PuffBlowArgs;

typedef struct PuffShotArgs {
  double lat;        /* 좌우 조준 -0.95..0.95 */
  double h;          /* 노릴 높이 (절대 y; puff_layer_y 로 '위에서 k장째') */
  double breath;     /* 손가락 숨 (정답 = puff_sweet_hi_for(n), 초록 = 0.78~1.0 배) */
  double dir_x, dir_z;
  double mouth_y;
  uint32_t use_mouth_y;
  uint32_t shake_seed; /* 숨이 넘칠 때 조준 흔들림 난수 */
} PuffShotArgs;

typedef struct PuffShotResult {
  double ratio, power, blast, lat, h;
  uint32_t over;
  double aim_x, aim_y, aim_z;
} PuffShotResult;

typedef struct PuffJudge {
  uint32_t flipped;     /* 원 안에서 그림이 위 */
  uint32_t outs;        /* 원 밖(책상 밖 포함) */
  uint32_t live;
  uint32_t puff_active;
  double max_speed;
} PuffJudge;

#define PUFF_FLOATS_PER_DISC 8 /* px py pz qx qy qz qw flags */
#define PUFF_FLAG_REMOVED 1u
#define PUFF_FLAG_OFF 2u
#define PUFF_FLAG_FACE_UP 4u
#define PUFF_FLAG_IN_CIRCLE 8u
#define PUFF_FLAG_HEAVY 16u
#define PUFF_FLAG_WIND 32u

PuffSim* puff_new(uint32_t seed);
void puff_free(PuffSim* s);
uint32_t puff_set_tune(PuffSim* s, const char* key, double value);
uint32_t puff_add_pile(PuffSim* s, uint32_t n, double spread, double at_x, double at_z, uint64_t heavy_mask);
uint32_t puff_settle(PuffSim* s, uint32_t max_steps);
uint32_t puff_blow(PuffSim* s, const PuffBlowArgs* a);
uint32_t puff_shot(PuffSim* s, const PuffShotArgs* a, PuffShotResult* out);
uint32_t puff_step(PuffSim* s, uint32_t n);
uint32_t puff_step_judge(PuffSim* s);
uint32_t puff_run_until_settled(PuffSim* s, double max_sec);
uint32_t puff_disc_count(PuffSim* s);
uint32_t puff_transforms(PuffSim* s, float* out, uint32_t cap_floats);
uint32_t puff_judge(PuffSim* s, PuffJudge* out);
/* malloc 없이 쓰는 길 (dart:ffi): 프레임 버퍼는 라이브러리가 들고 있다 */
const float* puff_frame(PuffSim* s); /* puff_disc_count 장 × 8 f32, 다음 puff_frame 전까지 유효 */
double puff_shot_v(PuffSim* s, double lat, double h, double breath, double dir_x, double dir_z, double mouth_y, uint32_t use_mouth_y, uint32_t shake_seed);
uint32_t puff_flipped_count(PuffSim* s);
uint32_t puff_out_count(PuffSim* s);
uint32_t puff_take_flipped(PuffSim* s);
void puff_restack(PuffSim* s, double at_x, double at_z);
double puff_column_top(PuffSim* s);
double puff_layer_y(PuffSim* s, uint32_t k);
uint32_t puff_pile_center(PuffSim* s, double* out_xz);
uint64_t puff_state_hash(PuffSim* s);
double puff_sweet_hi_for(uint32_t n);
uint32_t puff_version(char* buf, uint32_t cap);

/* ── 앱(dart:ffi) 연결용: 구조체·malloc 없이. 결과 포인터는 핸들이 들고 있는 고정 버퍼(핸들이 살아 있는 동안 주소 고정) ── */
#define PUFF_INFO_LEN 12 /* top cx cz live flipped outs puff_active max_speed judge_n steps time 0 */
#define PUFF_RES_LEN 10  /* ratio power blast lat h over aim_x aim_y aim_z rng_state */
/* 숨 해석을 밖(Dart)에서 했을 때: 물리 세기·돌풍·조준점만 넘긴다. dist 2.6 · pitch 0.1(게임 기본) */
uint32_t puff_blow_v(PuffSim* s, double aim_x, double aim_y, double aim_z, double dir_x, double dir_z, double power, double blast, double mouth_y, uint32_t use_mouth_y);
/* 한 턴 쏘기(turn.js ShotRun.fire 순서: puff_seed 줄기로 숨 해석 → 같은 줄기를 판 난수로 → 조준 → blow) */
const double* puff_fire_v(PuffSim* s, double lat, double h, double breath, double dir_x, double dir_z, double mouth_y, uint32_t use_mouth_y, uint32_t puff_seed);
/* 숨 해석만(물리 안 건드림) — Dart 포팅과 비트 대조용 */
const double* puff_resolve_v(PuffSim* s, uint32_t n, double top, double lat, double h, double breath, uint32_t rng_state);
uint32_t puff_rng_state(PuffSim* s);
void puff_set_rng_state(PuffSim* s, uint32_t state);
const double* puff_info(PuffSim* s);
/* puff_settle 을 프레임마다 나눠서: begin 뒤 스텝마다 settle_step → 1 이면 끝 (puff_settle 과 같은 해시) */
void puff_settle_begin(PuffSim* s);
uint32_t puff_settle_step(PuffSim* s, uint32_t max_steps);
/* 검증용: 순수 Rust libm (0 log, 1 cos, 2 sin, 3 sqrt, 4 pow(x,2)) */
double puff_math_v(uint32_t f, double x);
/* 엔진 버전(NUL 끝 정적 문자열, 해제 금지) */
const char* puff_version_cstr(void);

#ifdef __cplusplus
}
#endif

#endif /* PUFF_SIM_H */
