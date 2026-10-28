#pragma once

#include "public.sdk/source/vst/vstaudioeffect.h"
#include "test_delay_ids.h"

#include <array>
#include <atomic>
#include <cstdint>
#include <cstddef>
#include <vector>

namespace Steinberg::Vst {

class UnboxTestDelayProcessor final : public AudioEffect {
public:
    static constexpr uint32_t kDelayFrames = 48000;

    UnboxTestDelayProcessor();
    tresult PLUGIN_API initialize(FUnknown* context) SMTG_OVERRIDE;
    tresult PLUGIN_API setBusArrangements(
        SpeakerArrangement* inputs,
        int32 numInputs,
        SpeakerArrangement* outputs,
        int32 numOutputs) SMTG_OVERRIDE;
    tresult PLUGIN_API setupProcessing(ProcessSetup& setup) SMTG_OVERRIDE;
    tresult PLUGIN_API setActive(TBool state) SMTG_OVERRIDE;
    tresult PLUGIN_API setProcessing(TBool state) SMTG_OVERRIDE;
    tresult PLUGIN_API setState(IBStream* state) SMTG_OVERRIDE;
    tresult PLUGIN_API getState(IBStream* state) SMTG_OVERRIDE;
    tresult PLUGIN_API process(ProcessData& data) SMTG_OVERRIDE;

    static FUnknown* createInstance(void*)
    {
        return static_cast<IAudioProcessor*>(new UnboxTestDelayProcessor());
    }

private:
    std::vector<std::array<float, 2>> delayBuffer;
    std::size_t writeFrame = 0;
    std::atomic<float> outputGain{1.0F};
};

} // namespace Steinberg::Vst
