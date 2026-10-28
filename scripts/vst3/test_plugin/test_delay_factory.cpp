#include "test_delay_ids.h"
#include "test_delay_controller.h"
#include "test_delay_processor.h"

#include "public.sdk/source/main/pluginfactory_constexpr.h"

BEGIN_FACTORY_DEF("Unbox Studios", "", "", 2)

DEF_CLASS(
    Steinberg::Vst::kUnboxTestDelayProcessorUID,
    Steinberg::PClassInfo::kManyInstances,
    kVstAudioEffectClass,
    "Unbox Test Delay",
    Steinberg::Vst::kDistributable,
    "Fx|Delay",
    "1.0.0",
    kVstVersionString,
    Steinberg::Vst::UnboxTestDelayProcessor::createInstance,
    nullptr)

DEF_CLASS(
    Steinberg::Vst::kUnboxTestDelayControllerUID,
    Steinberg::PClassInfo::kManyInstances,
    kVstComponentControllerClass,
    "Unbox Test Delay Controller",
    0,
    "",
    "1.0.0",
    kVstVersionString,
    Steinberg::Vst::UnboxTestDelayController::createInstance,
    nullptr)

END_FACTORY
