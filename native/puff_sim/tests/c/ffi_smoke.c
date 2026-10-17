/* ffi_smoke.c — C 헤더(include/puff_sim.h)와 .so 가 맞물리는지: 같은 시드 두 번 → 같은 해시, 판정·자세 버퍼.
 * 빌드·실행 (native/puff_sim 에서):
 *   cargo build --release && cc -O2 -std=c11 -Iinclude tests/c/ffi_smoke.c -Ltarget/release -lpuff_sim -o target/ffi_smoke \
 *     && LD_LIBRARY_PATH=target/release target/ffi_smoke
 */
#include <stdio.h>
#include <stdlib.h>
#include "puff_sim.h"

static uint64_t one_round(uint32_t seed, uint32_t n, PuffJudge* j, uint32_t* steps) {
  PuffSim* s = puff_new(seed);
  puff_add_pile(s, n, 0.07, 0, 0, 0);
  puff_settle(s, 600);
  PuffShotArgs a = {0};
  a.lat = 0.0; a.h = puff_layer_y(s, 2); a.breath = 0.9 * puff_sweet_hi_for(n); a.dir_x = 0; a.dir_z = -1; a.shake_seed = 3;
  PuffShotResult r;
  puff_shot(s, &a, &r);
  *steps = 0;
  while (!puff_step_judge(s)) (*steps)++;
  puff_judge(s, j);
  float buf[64 * PUFF_FLOATS_PER_DISC];
  uint32_t k = puff_transforms(s, buf, sizeof buf / sizeof buf[0]);
  uint32_t up = 0;
  for (uint32_t i = 0; i < k; i++) {
    uint32_t fl = (uint32_t)buf[i * 8 + 7];
    if ((fl & PUFF_FLAG_FACE_UP) && (fl & PUFF_FLAG_IN_CIRCLE)) up++;
  }
  if (up != j->flipped) { fprintf(stderr, "flags %u != judge %u\n", up, j->flipped); exit(1); }
  uint64_t h = puff_state_hash(s);
  puff_free(s);
  return h;
}

int main(void) {
  char ver[128];
  puff_version(ver, sizeof ver);
  printf("%s\n", ver);
  PuffJudge j1, j2;
  uint32_t s1, s2;
  uint64_t h1 = one_round(77, 16, &j1, &s1), h2 = one_round(77, 16, &j2, &s2);
  printf("hash %016llx steps %u flipped %u outs %u\n", (unsigned long long)h1, s1, j1.flipped, j1.outs);
  if (h1 != h2 || s1 != s2 || j1.flipped != j2.flipped) { fprintf(stderr, "비결정!\n"); return 1; }
  puts("ok: 같은 시드 → 같은 해시");
  return 0;
}
