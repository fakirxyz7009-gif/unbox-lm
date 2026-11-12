cmake_minimum_required(VERSION 3.25)

project(unbox_vst3_host_smoke VERSION 1.0.0 LANGUAGES C CXX)

if(NOT WIN32)
    message(FATAL_ERROR "The first Unbox VST3 host probe supports Windows only.")
endif()

set(VST3_SDK_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../third_party/vst3sdk" CACHE PATH
    "Path to the official Steinberg VST3 SDK checkout")
if(NOT EXISTS "${VST3_SDK_ROOT}/CMakeLists.txt")
    message(FATAL_ERROR "Set VST3_SDK_ROOT to the Steinberg VST3 SDK checkout.")
endif()

set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_CREATE_PLUGIN_LINK 0 CACHE BOOL "" FORCE)
set(SMTG_RUN_VST_VALIDATOR OFF CACHE BOOL "" FORCE)

add_subdirectory("${VST3_SDK_ROOT}" "${CMAKE_BINARY_DIR}/vst3sdk")

set(SDK_ROOT "${VST3_SDK_ROOT}")

set(unbox_test_delay_sources
    test_plugin/test_delay_factory.cpp
    test_plugin/test_delay_controller.h
    test_plugin/test_delay_processor.cpp
    test_plugin/test_delay_processor.h
)
smtg_add_vst3plugin(unbox-test-delay ${unbox_test_delay_sources})
target_compile_features(unbox-test-delay PRIVATE cxx_std_17)
target_include_directories(unbox-test-delay PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(unbox-test-delay PRIVATE sdk)
if(CMAKE_GENERATOR STREQUAL "Ninja")
    # The SDK's Windows bundle layout loops over configurations supplied by multi-config generators.
    set_target_properties(unbox-test-delay PROPERTIES
        LIBRARY_OUTPUT_DIRECTORY_RELEASE
            "${CMAKE_BINARY_DIR}/VST3/Release/unbox-test-delay.vst3/Contents/x86_64-win")
endif()

set(unbox_test_synth_sources
    test_plugin/test_synth_factory.cpp
    test_plugin/test_synth_controller.h
    test_plugin/test_synth_ids.h
    test_plugin/test_synth_processor.cpp
    test_plugin/test_synth_processor.h
)
smtg_add_vst3plugin(unbox-test-synth ${unbox_test_synth_sources})
target_compile_features(unbox-test-synth PRIVATE cxx_std_17)
target_include_directories(unbox-test-synth PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(unbox-test-synth PRIVATE sdk)
if(CMAKE_GENERATOR STREQUAL "Ninja")
    set_target_properties(unbox-test-synth PROPERTIES
        LIBRARY_OUTPUT_DIRECTORY_RELEASE
            "${CMAKE_BINARY_DIR}/VST3/Release/unbox-test-synth.vst3/Contents/x86_64-win")
endif()

add_executable(unbox-vst3-host-smoke
    host_smoke.cpp
    "${VST3_SDK_ROOT}/public.sdk/source/common/memorystream.cpp"
    "${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_win32.cpp"
)
target_compile_features(unbox-vst3-host-smoke PRIVATE cxx_std_17)
target_include_directories(unbox-vst3-host-smoke PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(unbox-vst3-host-smoke PRIVATE sdk_hosting)

add_executable(unbox-vst3-instrument-smoke
    instrument_host_smoke.cpp
    "${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_win32.cpp"
)
target_compile_features(unbox-vst3-instrument-smoke PRIVATE cxx_std_17)
target_include_directories(unbox-vst3-instrument-smoke PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(unbox-vst3-instrument-smoke PRIVATE sdk_hosting)

add_executable(unbox-vst3-process-stream-host
    process_stream_host.cpp
    "${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_win32.cpp"
)
target_compile_features(unbox-vst3-process-stream-host PRIVATE cxx_std_17)
target_include_directories(unbox-vst3-process-stream-host PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(unbox-vst3-process-stream-host PRIVATE sdk_hosting)

add_executable(unbox-vst3-midi-process-stream-host
    midi_process_stream_host.cpp
    "${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_win32.cpp"
)
target_compile_features(unbox-vst3-midi-process-stream-host PRIVATE cxx_std_17)
target_include_directories(unbox-vst3-midi-process-stream-host PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(unbox-vst3-midi-process-stream-host PRIVATE sdk_hosting)

add_executable(unbox-vst3-shared-memory-host
    shared_memory_stream_host.cpp
    "${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_win32.cpp"
)
target_compile_features(unbox-vst3-shared-memory-host PRIVATE cxx_std_17)
target_include_directories(unbox-vst3-shared-memory-host PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(unbox-vst3-shared-memory-host PRIVATE sdk_hosting)
