// dart:ffi 가 없는 플랫폼(웹 확인 빌드): Rust 물리 없음 → 데모는 녹화 궤적 재생으로 돈다.
import 'sim_core.dart';

(SimLibrary?, String?) openSimLibraryImpl(String? libPath) => (null, '이 플랫폼에는 dart:ffi 가 없음(웹) — 녹화 재생');
