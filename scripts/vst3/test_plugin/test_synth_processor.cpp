#include "test_synth_processor.h"

#include <algorithm>
#include <cmath>

namespace Steinberg::Vst {
namespace {

constexpr double kTwoPi = 6.283185307179586476925286766559;

} // namespace

UnboxTestSynthProcessor::UnboxTestSynthProcessor()
{
    setControllerClass(FUID::fromTUID(kUnboxTestSynthControllerUID));
}

tresult PLUGIN_API UnboxTestSynthProcessor::initialize(FUnknown* context)
{
    const auto result = AudioEffect::initialize(context);
    if (result == kResultTrue || result == kResultOk)
    {
        addEventInput(STR16("MIDI Input"), 16);
        addAudioOutput(STR16("Stereo Output"), SpeakerArr::kStereo);
    }
    return result;
}

tresult PLUGIN_API UnboxTestSynthProcessor::setBusArrangements(
    SpeakerArrangement* inputs,
    int32 numInputs,
    SpeakerArrangement* outputs,
    int32 numOutputs)
{
    if (numInputs != 0 || numOutputs != 1 || outputs == nullptr ||
        outputs[0] != SpeakerArr::kStereo)
        return kResultFalse;

    (void)inputs;
    return AudioEffect::setBusArrangements(inputs, numInputs, outputs, numOutputs);
}

tresult PLUGIN_API UnboxTestSynthProcessor::setupProcessing(ProcessSetup& setup)
{
    if (!std::isfinite(setup.sampleRate) || setup.sampleRate < 1.0 ||
        setup.sampleRate > 10000000.0 || setup.symbolicSampleSize != kSample32)
        return kResultFalse;

    const auto result = AudioEffect::setupProcessing(setup);
    if (result == kResultOk || result == kResultTrue)
        sampleRate = setup.sampleRate;
    return result;
}

tresult PLUGIN_API UnboxTestSynthProcessor::setActive(TBool state)
{
    if (state)
    {
        phase = 0.0;
        frequency = 0.0;
        velocity = 0.0F;
        noteId = -1;
        noteActive = false;
    }
    return AudioEffect::setActive(state);
}

tresult PLUGIN_API UnboxTestSynthProcessor::setProcessing(TBool state)
{
    (void)state;
    return kResultOk;
}

tresult PLUGIN_API UnboxTestSynthProcessor::process(ProcessData& data)
{
    if (data.numSamples <= 0)
        return kResultTrue;
    if (data.symbolicSampleSize != kSample32 || data.numInputs != 0 ||
        data.numOutputs != 1 || data.inputs != nullptr || data.outputs == nullptr ||
        data.outputs[0].numChannels != 2 || data.outputs[0].channelBuffers32 == nullptr ||
        data.outputs[0].channelBuffers32[0] == nullptr ||
        data.outputs[0].channelBuffers32[1] == nullptr || sampleRate <= 0.0)
        return kResultFalse;

    auto* left = data.outputs[0].channelBuffers32[0];
    auto* right = data.outputs[0].channelBuffers32[1];
    auto* events = data.inputEvents;
    int32 eventIndex = 0;
    const auto eventCount = events ? events->getEventCount() : 0;

    for (int32 sample = 0; sample < data.numSamples; ++sample)
    {
        while (eventIndex < eventCount)
        {
            Event event{};
            if (events->getEvent(eventIndex, event) != kResultOk)
                return kResultFalse;
            if (event.sampleOffset > sample)
                break;
            ++eventIndex;

            if (event.sampleOffset < 0 || event.sampleOffset >= data.numSamples)
                continue;

            if (event.type == Event::kNoteOnEvent && event.noteOn.pitch >= 0 &&
                event.noteOn.pitch <= 127 && std::isfinite(event.noteOn.velocity))
            {
                frequency = 440.0 * std::pow(2.0,
                    (static_cast<double>(event.noteOn.pitch) - 69.0 + event.noteOn.tuning / 100.0) / 12.0);
                velocity = std::clamp(event.noteOn.velocity, 0.0F, 1.0F);
                noteId = event.noteOn.noteId >= 0 ? event.noteOn.noteId : event.noteOn.pitch;
                phase = 0.0;
                noteActive = velocity > 0.0F;
            }
            else if (event.type == Event::kNoteOffEvent)
            {
                const auto releasedId = event.noteOff.noteId >= 0
                    ? event.noteOff.noteId
                    : event.noteOff.pitch;
                if (noteActive && releasedId == noteId)
                {
                    noteActive = false;
                    velocity = 0.0F;
                }
            }
        }

        const auto value = noteActive
            ? static_cast<float>(std::cos(phase) * static_cast<double>(velocity))
            : 0.0F;
        left[sample] = value;
        right[sample] = value;
        if (noteActive)
        {
            phase += kTwoPi * frequency / sampleRate;
            if (phase >= kTwoPi)
                phase = std::fmod(phase, kTwoPi);
        }
    }

    return kResultTrue;
}

} // namespace Steinberg::Vst
