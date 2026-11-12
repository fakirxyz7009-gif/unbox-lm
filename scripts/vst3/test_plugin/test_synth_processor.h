#pragma once

#include "public.sdk/source/vst/vstaudioeffect.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "test_synth_ids.h"

namespace Steinberg::Vst {

class UnboxTestSynthProcessor final : public AudioEffect {
public:
    UnboxTestSynthProcessor();

    tresult PLUGIN_API initialize(FUnknown* context) SMTG_OVERRIDE;
    tresult PLUGIN_API setBusArrangements(
        SpeakerArrangement* inputs,
        int32 numInputs,
        SpeakerArrangement* outputs,
        int32 numOutputs) SMTG_OVERRIDE;
    tresult PLUGIN_API setupProcessing(ProcessSetup& setup) SMTG_OVERRIDE;
    tresult PLUGIN_API setActive(TBool state) SMTG_OVERRIDE;
    tresult PLUGIN_API setProcessing(TBool state) SMTG_OVERRIDE;
    tresult PLUGIN_API process(ProcessData& data) SMTG_OVERRIDE;

    static FUnknown* createInstance(void*)
    {
        return static_cast<IAudioProcessor*>(new UnboxTestSynthProcessor());
    }

private:
    double sampleRate = 0.0;
    double phase = 0.0;
    double frequency = 0.0;
    float velocity = 0.0F;
    int32 noteId = -1;
    bool noteActive = false;
};

} // namespace Steinberg::Vst
