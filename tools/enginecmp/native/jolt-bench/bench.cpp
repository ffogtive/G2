// bench.cpp — Jolt 네이티브 벤치 (JS 어댑터 adapters/jolt.mjs 와 같은 순서·같은 값으로 같은 판을 돌려 해시를 찍는다)
//
//   joltbench <pile.txt> key=value ...
//     pile.txt: 첫 줄 n, 그 뒤 줄마다 px py pz qx qy qz qw 의 float32 비트(hex)  (adapters/common.mjs pileToText)
//     키(기본값 = adapters/index.mjs JOLT_FAIR + 게임 v1): dt substeps gravity hh(반두께) r vs ps baumgarte slop spec maxpen
//       lct lcmp mtol minrest cachepos preserve crfrac crmax split sleep sleepvel sleeptime maxang maxlin ccd
//       friction restitution floorF floorR linDamp angDamp density combine(material|average|native)
//       steps shotStart shotSteps lo hi lift push mx my mz shield hashEvery threads
//   출력: JSON 한 줄 { hashes:[...], final, msPerStep, cpd, ... }
//
// 값 변환 규칙(비트 대조용): JS 는 double 을 WASM 경계에서 float 로 내린다 → 여기서도 double 로 읽고 (float) 로 내린다.
#include <Jolt/Jolt.h>
#include <Jolt/RegisterTypes.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Core/JobSystemThreadPool.h>
#include <Jolt/Physics/PhysicsSettings.h>
#include <Jolt/Physics/PhysicsSystem.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/Collision/Shape/CylinderShape.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Body/BodyFilter.h>
#include <Jolt/Physics/Collision/BroadPhase/BroadPhaseLayerInterfaceTable.h>
#include <Jolt/Physics/Collision/BroadPhase/ObjectVsBroadPhaseLayerFilterTable.h>
#include <Jolt/Physics/Collision/ObjectLayerPairFilterTable.h>
#include <Jolt/Physics/Collision/RayCast.h>
#include <Jolt/Physics/Collision/CastResult.h>
#include <Jolt/Physics/Collision/CollisionCollectorImpl.h>
#include <Jolt/Physics/Collision/ShapeFilter.h>

#include <array>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>
#include <set>

using namespace JPH;

static std::map<std::string, std::string> A;
static double num(const char *k, double def) { auto it = A.find(k); return it == A.end() ? def : atof(it->second.c_str()); }
static std::string str(const char *k, const char *def) { auto it = A.find(k); return it == A.end() ? def : it->second; }
static float F(const char *k, double def) { return (float)num(k, def); }

// ── 해시: adapters/common.mjs Hasher 와 같음 ──
struct Hasher {
  uint32_t h = 0x811c9dc5u;
  void u32(uint32_t w) { for (int k = 0; k < 4; k++) { h ^= (w >> (8 * k)) & 0xffu; h *= 0x01000193u; } }
  void f32(float x) { uint32_t u; memcpy(&u, &x, 4); u32(u); }
  uint32_t fin() const { uint32_t x = h; x ^= x >> 16; x *= 0x85ebca6bu; x ^= x >> 13; x *= 0xc2b2ae35u; x ^= x >> 16; return x; }
};

static float bitsF(uint32_t u) { float f; memcpy(&f, &u, 4); return f; }

static constexpr ObjectLayer L_STATIC = 0, L_MOVING = 1;

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: joltbench pile.txt key=value...\n"); return 2; }
  for (int i = 2; i < argc; i++) { const char *e = strchr(argv[i], '='); if (e) A[std::string(argv[i], e - argv[i])] = e + 1; }

  FILE *fp = fopen(argv[1], "r");
  if (!fp) { perror("pile"); return 2; }
  int n = 0; if (fscanf(fp, "%d", &n) != 1) return 2;
  std::vector<std::array<uint32_t, 7>> pile(n);
  for (int i = 0; i < n; i++) for (int k = 0; k < 7; k++) { unsigned int u; if (fscanf(fp, "%x", &u) != 1) return 2; pile[i][k] = u; }
  fclose(fp);

  RegisterDefaultAllocator();
  Factory::sInstance = new Factory();
  RegisterTypes();
  TempAllocatorImpl temp(10 * 1024 * 1024);
  int threads = (int)num("threads", 0);
  JobSystemThreadPool jobs(cMaxPhysicsJobs, cMaxPhysicsBarriers, threads);

  ObjectLayerPairFilterTable olp(2);
  olp.EnableCollision(L_STATIC, L_MOVING);
  olp.EnableCollision(L_MOVING, L_MOVING);
  BroadPhaseLayerInterfaceTable bpi(2, 2);
  bpi.MapObjectToBroadPhaseLayer(L_STATIC, BroadPhaseLayer(0));
  bpi.MapObjectToBroadPhaseLayer(L_MOVING, BroadPhaseLayer(1));
  ObjectVsBroadPhaseLayerFilterTable ovb(bpi, 2, olp, 2);

  PhysicsSystem ps;
  ps.Init(4096, 0, 65536, 16384, bpi, ovb, olp);

  const bool sleep = num("sleep", 1) != 0;
  PhysicsSettings s = ps.GetPhysicsSettings();
  s.mBaumgarte = F("baumgarte", 0.2);
  s.mPenetrationSlop = F("slop", 0.002);
  s.mSpeculativeContactDistance = F("spec", 0.01);
  s.mMaxPenetrationDistance = F("maxpen", 0.05);
  s.mLinearCastThreshold = F("lct", 0.75);
  s.mLinearCastMaxPenetration = F("lcmp", 0.25);
  s.mManifoldTolerance = F("mtol", 1e-3);
  s.mNumVelocitySteps = (uint)num("vs", 10);
  s.mNumPositionSteps = (uint)num("ps", 2);
  s.mMinVelocityForRestitution = F("minrest", 0.5);
  { double c = num("cachepos", 0.001); s.mBodyPairCacheMaxDeltaPositionSq = (float)(c * c); }
  { double c = num("preserve", 0.01); s.mContactPointPreserveLambdaMaxDistSq = (float)(c * c); }
  s.mAllowSleeping = sleep;
  s.mTimeBeforeSleep = F("sleeptime", 0.5);
  s.mPointVelocitySleepThreshold = F("sleepvel", 0.03);
  s.mDeterministicSimulation = true;
  s.mUseLargeIslandSplitter = num("split", 1) != 0;
  ps.SetPhysicsSettings(s);
  ps.SetGravity(Vec3(0, -F("gravity", 38), 0));

  const std::string combine = str("combine", "material");
  if (combine == "average") {
    ps.SetCombineFriction([](const Body &a, const SubShapeID &, const Body &b, const SubShapeID &) { return (a.GetFriction() + b.GetFriction()) * 0.5f; });
    ps.SetCombineRestitution([](const Body &a, const SubShapeID &, const Body &b, const SubShapeID &) { return (a.GetRestitution() + b.GetRestitution()) * 0.5f; });
  }

  BodyInterface &bi = ps.GetBodyInterface();

  // 책상 (JS addFloor 와 같은 순서)
  const float floorF = F("floorF", 0.9), floorR = F("floorR", 0.0);
  RefConst<Shape> box = new BoxShape(Vec3(F("deskHx", 11), F("deskHy", 0.5), F("deskHz", 8)), (float)std::min(0.05, num("deskHy", 0.5) * 0.5));
  BodyCreationSettings fb(box, RVec3(0, (float)(-num("deskHy", 0.5)), 0), Quat::sIdentity(), EMotionType::Static, L_STATIC);
  fb.mFriction = floorF;
  fb.mRestitution = floorR;
  Body *floor = bi.CreateBody(fb);
  bi.AddBody(floor->GetID(), EActivation::DontActivate);

  // 딱지
  const double r = num("r", 1.0), hh = num("hh", 0.055), density = num("density", 1.0);
  const double cr = std::min(std::min(num("crmax", 0.05), hh * num("crfrac", 0.5)), r * 0.5);
  CylinderShapeSettings cs((float)hh, (float)r, (float)cr);
  cs.mDensity = (float)density;
  RefConst<Shape> cyl = cs.Create().Get();
  const float fd = F("friction", 0.75), rd = F("restitution", 0.0);
  std::vector<Body *> bodies(n);
  std::vector<BodyID> ids(n);
  for (int i = 0; i < n; i++) {
    RVec3 p(bitsF(pile[i][0]), bitsF(pile[i][1]), bitsF(pile[i][2]));
    Quat q(bitsF(pile[i][3]), bitsF(pile[i][4]), bitsF(pile[i][5]), bitsF(pile[i][6]));
    BodyCreationSettings b(cyl, p, q, EMotionType::Dynamic, L_MOVING);
    b.mFriction = fd;
    b.mRestitution = rd;
    b.mLinearDamping = F("linDamp", 0.35);
    b.mAngularDamping = F("angDamp", 1.0);
    b.mMotionQuality = num("ccd", 1) != 0 ? EMotionQuality::LinearCast : EMotionQuality::Discrete;
    b.mAllowSleeping = sleep;
    b.mMaxAngularVelocity = F("maxang", 1000);
    b.mMaxLinearVelocity = F("maxlin", 1000);
    bodies[i] = bi.CreateBody(b);
    ids[i] = bodies[i]->GetID();
    bi.AddBody(ids[i], EActivation::Activate);
  }
  // 결합 'material' (JS _resolveCombine 와 같은 식·같은 float 연산 순서)
  if (combine == "material") {
    float fAvg = (fd + floorF) * 0.5f, rAvg = (rd + floorR) * 0.5f;
    if (fd > 0 && floorR >= rd) { bi.SetFriction(floor->GetID(), (fAvg * fAvg) / fd); bi.SetRestitution(floor->GetID(), rAvg); }
    else { fprintf(stderr, "material 결합 불가 → combine=average 쓰기\n"); return 3; }
  }

  // 샷 (adapters/common.mjs applyShotStep 과 같은 식)
  const int shotStart = (int)num("shotStart", 360), shotSteps = (int)num("shotSteps", 16);
  const int lo = (int)num("lo", (int)std::floor(n * 0.4)), hi = (int)num("hi", n - 1);
  const float lift = F("lift", 0.2), push = F("push", 0.02), shield = F("shield", 0.35);
  const Vec3 M(F("mx", 0), F("my", 0), F("mz", 3.2));
  const int steps = (int)num("steps", 976), hashEvery = (int)num("hashEvery", 60);
  const float dt = F("dt", 1.0 / 120.0);
  const int substeps = (int)num("substeps", 1);

  RayCastSettings rs;
  DefaultBroadPhaseLayerFilter bpf(ovb, L_MOVING);
  SpecifiedObjectLayerFilter olDiscs(L_MOVING);
  ShapeFilter shf;
  const NarrowPhaseQuery &npq = ps.GetNarrowPhaseQuery();
  std::set<int> off;

  auto hashState = [&]() {
    Hasher H;
    for (int i = 0; i < n; i++) {
      Body *b = bodies[i];
      RVec3 t = b->GetPosition(); H.f32(t.GetX()); H.f32(t.GetY()); H.f32(t.GetZ());
      Quat q = b->GetRotation(); H.f32(q.GetX()); H.f32(q.GetY()); H.f32(q.GetZ()); H.f32(q.GetW());
      Vec3 v = b->GetLinearVelocity(); H.f32(v.GetX()); H.f32(v.GetY()); H.f32(v.GetZ());
      Vec3 w = b->GetAngularVelocity(); H.f32(w.GetX()); H.f32(w.GetY()); H.f32(w.GetZ());
    }
    return H.fin();
  };

  std::vector<uint32_t> hashes;
  int shieldedTotal = 0;
  auto t0 = std::chrono::steady_clock::now();
  for (int st = 0; st < steps; st++) {
    if (st >= shotStart && st < shotStart + shotSteps) {
      for (int i = lo; i <= hi; i++) {
        RVec3 c = bi.GetPosition(ids[i]);
        Vec3 P(c.GetX(), c.GetY(), c.GetZ() + 1.0f);
        float dx = P.GetX() - M.GetX(), dy = P.GetY() - M.GetY(), dz = P.GetZ() - M.GetZ();
        float L = std::sqrt(((dx * dx) + (dy * dy)) + (dz * dz));
        float k = 1.0f;
        if ((double)L > 0.08) {
          float ux = dx / L, uy = dy / L, uz = dz / L;
          float mx = (float)((double)L - 0.08);
          RRayCast ray(RVec3(M), Vec3(ux * mx, uy * mx, uz * mx));
          ClosestHitCollisionCollector<CastRayCollector> col;
          IgnoreSingleBodyFilter ig(ids[i]);
          npq.CastRay(ray, rs, col, bpf, olDiscs, ig, shf);
          if (col.HadHit()) { k = shield; shieldedTotal++; }
        }
        bi.AddImpulse(ids[i], Vec3(0, lift * k, -(push * k)), RVec3(P));
      }
    }
    ps.Update(dt, substeps, &temp, &jobs);
    // 책상 밖 (common.mjs handleOffDesk)
    for (int i = 0; i < n; i++) {
      if (off.count(i)) continue;
      RVec3 p = bodies[i]->GetPosition();
      if ((double)p.GetY() < -3) {
        off.insert(i);
        bi.SetGravityFactor(ids[i], 0);
        bi.SetLinearAndAngularVelocity(ids[i], Vec3::sZero(), Vec3::sZero());
        bi.SetPositionAndRotation(ids[i], RVec3(p.GetX(), -4.0f, p.GetZ()), bodies[i]->GetRotation(), EActivation::DontActivate);
      }
    }
    if ((st + 1) % hashEvery == 0) hashes.push_back(hashState());
  }
  double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  int sleeping = 0; for (int i = 0; i < n; i++) if (!bodies[i]->IsActive()) sleeping++;

  printf("{\"engine\":\"jolt-native\",\"cpd\":%s,\"n\":%d,\"steps\":%d,\"msPerStep\":%.4f,\"shielded\":%d,\"sleeping\":%d,\"off\":%zu,\"final\":\"%08x\",\"hashes\":[",
#ifdef JPH_CROSS_PLATFORM_DETERMINISTIC
         "true",
#else
         "false",
#endif
         n, steps, ms / steps, shieldedTotal, sleeping, off.size(), hashState());
  for (size_t i = 0; i < hashes.size(); i++) printf("%s\"%08x\"", i ? "," : "", hashes[i]);
  printf("]}\n");

  for (int i = 0; i < n; i++) { bi.RemoveBody(ids[i]); bi.DestroyBody(ids[i]); }
  bi.RemoveBody(floor->GetID()); bi.DestroyBody(floor->GetID());
  UnregisterTypes();
  delete Factory::sInstance;
  Factory::sInstance = nullptr;
  return 0;
}
