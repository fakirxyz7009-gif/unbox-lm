#include "test_synth_ids.h"
#include "test_synth_controller.h"
#include "test_synth_processor.h"

#include "public.sdk/source/main/pluginfactory_constexpr.h"

BEGIN_FACTORY_DEF("Unbox Studios", "", "", 2)

DEF_CLASS(
    Steinberg::Vst::kUnboxTestSynthProcessorUID,
    Steinberg::PClassInfo::kManyInstances,
    kVstAudioEffectClass,
    "Unbox Test MIDI Synth",
    Steinberg::Vst::kDistributable,
    Steinberg::Vst::PlugType::kInstrumentSynth,
    "1.0.0",
    kVstVersionString,
    Steinberg::Vst::UnboxTestSynthProcessor::createInstance,
    nullptr)

DEF_CLASS(
    Steinberg::Vst::kUnboxTestSynthControllerUID,
    Steinberg::PClassInfo::kManyInstances,
    kVstComponentControllerClass,
    "Unbox Test MIDI Synth Controller",
    0,
    "",
    "1.0.0",
    kVstVersionString,
    Steinberg::Vst::UnboxTestSynthController::createInstance,
    nullptr)

END_FACTORY
