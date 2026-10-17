# zig c++ 로 aarch64-linux-musl 정적 교차 빌드 (qemu-aarch64-static 으로 실행). ZIG_WRAP_DIR = zigcc/zigcxx 가 있는 폴더
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_C_COMPILER ${ZIG_WRAP_DIR}/zigcc)
set(CMAKE_CXX_COMPILER ${ZIG_WRAP_DIR}/zigcxx)
set(CMAKE_AR ${ZIG_WRAP_DIR}/zigar CACHE FILEPATH "")
set(CMAKE_RANLIB ${ZIG_WRAP_DIR}/zigranlib CACHE FILEPATH "")
set(CMAKE_EXE_LINKER_FLAGS "-static" CACHE STRING "")
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
