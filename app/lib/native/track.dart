// 궤적 재생기 — mockup/src/turn.js 의 13B 자세 코덱 + TrackPlayer 를 Dart 로 옮긴 것(렌더러 독립, 순수 Dart).
//
// 🧭 가설: 렌더러는 물리와 독립이다 → 웹 물리가 녹화한 30Hz 궤적(PvP 전송 형식 그대로)을 네이티브 장면이 그대로 재생할 수 있으면,
//   물리 엔진(웹 Rapier JS · Rust rapier3d)을 갈아끼워도 그리는 쪽은 안 바뀐다. 판가름: JS poseAt 표본과 수치 일치,
//   재생 끝 바이트 = post (test/native_track_test.dart).
//
// 좌표는 웹(three.js·Rapier) 오른손 그대로. 화면(flutter_scene, 왼손)으로 바꾸는 건 coords.dart.
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

const int kPoseBytes = 13; // 1B id(6비트)+최대 성분 자리(2비트) · 6B 위치 int16×3 (×1/1000) · 6B 사원수 smallest-three int16×3
const int kTrackHz = 30;
const double _qPos = 1000;
final double _qRot = 32767 / math.sqrt1_2;

/// 딱지 하나의 자세(오른손 좌표, double — JS 와 같은 정밀도로 비교하려고 vector_math(float32)를 쓰지 않는다)
class Pose {
  const Pose(this.px, this.py, this.pz, this.qx, this.qy, this.qz, this.qw);
  final double px, py, pz, qx, qy, qz, qw;

  /// 그림 면(+Y)이 위를 보는 정도: 회전된 (0,1,0) 의 y 성분(sim.js faceUp 과 같은 식)
  double get faceUp => 1 - 2 * (qx * qx + qz * qz);

  @override
  String toString() => 'Pose(p: ${px.toStringAsFixed(4)}, ${py.toStringAsFixed(4)}, ${pz.toStringAsFixed(4)})';
}

class PoseRow {
  PoseRow(this.id, this.pose, this.bytes);
  final int id;
  final Pose pose;
  final Uint8List bytes; // 받은 13B 원본(끝 상태를 다시 인코딩하지 않고 그대로 들고 있어 endBytes == post)
}

PoseRow decodePose(ByteData dv, int off) {
  final b = dv.getUint8(off), li = b & 3;
  final px = dv.getInt16(off + 1, Endian.little) / _qPos;
  final py = dv.getInt16(off + 3, Endian.little) / _qPos;
  final pz = dv.getInt16(off + 5, Endian.little) / _qPos;
  final c = [0.0, 0.0, 0.0, 0.0];
  var k = 0;
  var ss = 0.0;
  for (var i = 0; i < 4; i++) {
    if (i == li) continue;
    final v = dv.getInt16(off + 7 + 2 * k, Endian.little) / _qRot;
    c[i] = v;
    ss += v * v;
    k++;
  }
  c[li] = math.sqrt(math.max(0, 1 - ss));
  final bytes = Uint8List.fromList(dv.buffer.asUint8List(dv.offsetInBytes + off, kPoseBytes));
  return PoseRow(b >> 2, Pose(px, py, pz, c[0], c[1], c[2], c[3]), bytes);
}

List<PoseRow> decodeState(Uint8List u8) {
  final dv = ByteData.sublistView(u8);
  return [for (var off = 0; off + kPoseBytes <= u8.length; off += kPoseBytes) decodePose(dv, off)];
}

Pose nlerp(Pose a, Pose b, double k) {
  final s = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw < 0 ? -1 : 1;
  final x = a.qx + (b.qx * s - a.qx) * k, y = a.qy + (b.qy * s - a.qy) * k;
  final z = a.qz + (b.qz * s - a.qz) * k, w = a.qw + (b.qw * s - a.qw) * k;
  var l = math.sqrt(x * x + y * y + z * z + w * w);
  if (l == 0) l = 1;
  return Pose(
    a.px + (b.px - a.px) * k,
    a.py + (b.py - a.py) * k,
    a.pz + (b.pz - a.pz) * k,
    x / l,
    y / l,
    z / l,
    w / l,
  );
}

class _Cur {
  _Cur(this.pose, this.f);
  final Pose pose;
  final int f; // 이 자세가 된 프레임 시각
}

/// turn.js TrackPlayer 와 같은 동작: pre(13B×n) 에서 시작해 프레임을 차례로 적용, poseAt(tf) 는 프레임 사이를 보간.
/// tf = 재생 시각(프레임 단위, 경과 초 × 30). 120Hz 화면이면 프레임 하나 사이를 4번 보간해 그린다.
class TrackPlayer {
  TrackPlayer(Uint8List pre) {
    for (final r in decodeState(pre)) {
      _raw[r.id] = r.bytes;
      _cur[r.id] = _Cur(r.pose, 0);
    }
  }
  factory TrackPlayer.b64(String pre) => TrackPlayer(base64Decode(pre));

  final Map<int, Uint8List> _raw = {};
  final Map<int, _Cur> _cur = {};
  final Map<int, _Cur> _prev = {};
  final List<List<PoseRow>> frames = [];
  int applied = 0;

  Iterable<int> get ids => _cur.keys;
  int get received => frames.length;
  bool get done => applied >= frames.length;

  /// 조각(또는 통째 궤적) 받기. f = 첫 프레임 번호: 빈칸이면 false
  bool push(Uint8List u8, [int? f]) {
    if ((f ?? frames.length) != frames.length) return false;
    final dv = ByteData.sublistView(u8);
    var o = 0;
    while (o < u8.length) {
      final n = u8[o++];
      final rows = <PoseRow>[];
      for (var k = 0; k < n; k++, o += kPoseBytes) {
        rows.add(decodePose(dv, o));
      }
      frames.add(rows);
    }
    return true;
  }

  bool pushB64(String b, [int? f]) => push(base64Decode(b), f);

  int applyUntil(int k) {
    k = math.min(k, frames.length);
    for (; applied < k; applied++) {
      final i = applied;
      for (final r in frames[i]) {
        final c = _cur[r.id];
        if (c != null) _prev[r.id] = _Cur(c.pose, i); // 프레임 i 시각까지는 앞 자세 그대로였다
        _cur[r.id] = _Cur(r.pose, i + 1);
        _raw[r.id] = r.bytes;
      }
    }
    return applied;
  }

  /// pid → 자세(오른손). 되감기는 없다(새 TrackPlayer 를 만든다).
  Map<int, Pose> poseAt(double tf) {
    applyUntil(tf.ceil());
    final out = <int, Pose>{};
    for (final e in _cur.entries) {
      final c = e.value, pv = _prev[e.key];
      var p = c.pose;
      if (pv != null && tf < c.f && tf > pv.f) {
        p = nlerp(pv.pose, c.pose, (tf - pv.f) / (c.f - pv.f));
      } else if (pv != null && tf <= pv.f) {
        p = pv.pose;
      }
      out[e.key] = p;
    }
    return out;
  }

  /// 끝 상태 13B×n (pid 오름차순) — 쏜 사람의 post 와 바이트 단위로 같아야 한다
  Uint8List endBytes() {
    final ids = _raw.keys.toList()..sort();
    final u8 = Uint8List(ids.length * kPoseBytes);
    for (var i = 0; i < ids.length; i++) {
      u8.setAll(i * kPoseBytes, _raw[ids[i]]!);
    }
    return u8;
  }
}

/// 고정본(assets/native/track_fixture.json)의 샷 하나
class RecordedShot {
  RecordedShot({
    required this.name,
    required this.ratio,
    required this.top,
    required this.h,
    required this.lat,
    required this.pre,
    required this.post,
    required this.track,
    required this.frames,
    required this.flipped,
    required this.outs,
  });
  factory RecordedShot.fromJson(Map<String, dynamic> j) {
    final input = j['input'] as Map<String, dynamic>;
    final tr = j['track'] as Map<String, dynamic>;
    final res = j['res'] as Map<String, dynamic>;
    return RecordedShot(
      name: j['name'] as String,
      ratio: (j['ratio'] as num).toDouble(),
      top: (j['top'] as num).toDouble(),
      h: (input['h'] as num).toDouble(),
      lat: (input['lat'] as num? ?? 0).toDouble(),
      pre: j['pre'] as String,
      post: j['post'] as String,
      track: tr['b'] as String,
      frames: tr['frames'] as int,
      flipped: [for (final v in res['flipped'] as List) v as int],
      outs: [for (final v in res['outs'] as List) v as int],
    );
  }
  final String name;
  final double ratio, top, h, lat;
  final String pre, post, track;
  final int frames;
  final List<int> flipped, outs;

  TrackPlayer player() => TrackPlayer.b64(pre)..pushB64(track);
  double get seconds => frames / kTrackHz;
}

class CardInfo {
  const CardInfo(this.id, this.rarity, this.body, this.belly);
  final String id, rarity, body, belly;
}

class TrackFixture {
  TrackFixture(this.n, this.cards, this.shots);
  factory TrackFixture.parse(String json) {
    final j = jsonDecode(json) as Map<String, dynamic>;
    return TrackFixture(
      j['n'] as int,
      [
        for (final c in j['cards'] as List)
          CardInfo(c['id'] as String, c['rarity'] as String, c['body'] as String, c['belly'] as String),
      ],
      [for (final s in j['shots'] as List) RecordedShot.fromJson(s as Map<String, dynamic>)],
    );
  }
  final int n;
  final List<CardInfo> cards; // pid → 그림 카드
  final List<RecordedShot> shots;
  RecordedShot shot(String name) => shots.firstWhere((s) => s.name == name);
}
