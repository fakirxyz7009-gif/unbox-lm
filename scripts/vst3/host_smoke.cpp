#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstpluginterfacesupport.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include "public.sdk/source/common/memorystream.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/utility/optional.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace {

using Steinberg::FUnknownPtr;
using Steinberg::MemoryStream;
using Steinberg::IPluginBase;
using Steinberg::IPtr;
using Steinberg::kResultOk;
using Steinberg::kResultTrue;
using Steinberg::Vst::AudioBusBuffers;
using Steinberg::Vst::HostApplication;
using Steinberg::Vst::IAudioProcessor;
using Steinberg::Vst::IComponent;
using Steinberg::Vst::kAudio;
using Steinberg::Vst::kInput;
using Steinberg::Vst::kOffline;
using Steinberg::Vst::kOutput;
using Steinberg::Vst::kSample32;
using Steinberg::Vst::ProcessData;
using Steinberg::Vst::ProcessSetup;
using VST3::Hosting::Module;

constexpr float kTolerance = 1.0e-5F;
constexpr std::size_t kTestDelayStateSize = 12;
constexpr std::size_t kTestDelayGainOffset = 8;

struct RenderCase {
    double sampleRate;
    int32_t blockSize;
};

struct Measurement {
    uint64_t peakFrame = 0;
    uint64_t peakRightFrame = 0;
    float peakLeft = 0.0F;
    float peakRight = 0.0F;
    uint32_t latencySamples = 0;
};

constexpr std::array<RenderCase, 4> kRenderCases{{
    {44100.0, 127},
    {48000.0, 256},
    {96000.0, 511},
    {192000.0, 1024},
}};

bool succeeded(Steinberg::tresult result)
{
    return result == kResultOk || result == kResultTrue;
}

int fail(const std::string& message)
{
    std::cerr << "VST3 host smoke failed: " << message << '\n';
    return 1;
}

bool processImpulse(
    IAudioProcessor& processor,
    IComponent& component,
    const RenderCase& renderCase,
    Measurement& measurement,
    std::string& error,
    float expectedGain = 1.0F)
{
    ProcessSetup setup{};
    setup.processMode = kOffline;
    setup.symbolicSampleSize = kSample32;
    setup.maxSamplesPerBlock = renderCase.blockSize;
    setup.sampleRate = renderCase.sampleRate;
    if (!succeeded(processor.setupProcessing(setup)))
    {
        error = "plugin processing setup failed at " + std::to_string(renderCase.sampleRate) + " Hz";
        return false;
    }
    if (!succeeded(component.setActive(true)))
    {
        error = "plugin activation failed at " + std::to_string(renderCase.sampleRate) + " Hz";
        return false;
    }
    if (!succeeded(processor.setProcessing(true)))
    {
        component.setActive(false);
        error = "plugin refused processing at " + std::to_string(renderCase.sampleRate) + " Hz";
        return false;
    }

    std::vector<float> inputLeft(static_cast<size_t>(renderCase.blockSize));
    std::vector<float> inputRight(static_cast<size_t>(renderCase.blockSize));
    std::vector<float> outputLeft(static_cast<size_t>(renderCase.blockSize));
    std::vector<float> outputRight(static_cast<size_t>(renderCase.blockSize));
    float* inputChannels[] = {inputLeft.data(), inputRight.data()};
    float* outputChannels[] = {outputLeft.data(), outputRight.data()};
    AudioBusBuffers inputBus{};
    inputBus.numChannels = 2;
    inputBus.channelBuffers32 = inputChannels;
    AudioBusBuffers outputBus{};
    outputBus.numChannels = 2;
    outputBus.channelBuffers32 = outputChannels;

    const auto expectedDelayFrames = static_cast<uint64_t>(std::llround(renderCase.sampleRate));
    const auto totalFrames = expectedDelayFrames + static_cast<uint64_t>(renderCase.blockSize);
    bool processSucceeded = true;
    for (uint64_t frameOffset = 0; frameOffset < totalFrames;
         frameOffset += static_cast<uint64_t>(renderCase.blockSize))
    {
        const auto sampleCount = static_cast<int32_t>(std::min(
            static_cast<uint64_t>(renderCase.blockSize), totalFrames - frameOffset));
        std::fill_n(inputLeft.begin(), sampleCount, 0.0F);
        std::fill_n(inputRight.begin(), sampleCount, 0.0F);
        std::fill_n(outputLeft.begin(), sampleCount, 0.0F);
        std::fill_n(outputRight.begin(), sampleCount, 0.0F);
        if (frameOffset == 0)
        {
            inputLeft[0] = 1.0F;
            inputRight[0] = 0.5F;
        }

        ProcessData data{};
        data.processMode = kOffline;
        data.symbolicSampleSize = kSample32;
        data.numSamples = sampleCount;
        data.numInputs = 1;
        data.inputs = &inputBus;
        data.numOutputs = 1;
        data.outputs = &outputBus;
        data.processContext = nullptr;

        if (!succeeded(processor.process(data)))
        {
            processSucceeded = false;
            break;
        }

        for (int32_t sample = 0; sample < sampleCount; ++sample)
        {
            const auto frame = frameOffset + static_cast<uint64_t>(sample);
            const float left = std::abs(outputLeft[static_cast<size_t>(sample)]);
            const float right = std::abs(outputRight[static_cast<size_t>(sample)]);
            if (left > measurement.peakLeft)
            {
                measurement.peakLeft = left;
                measurement.peakFrame = frame;
            }
            if (right > measurement.peakRight)
            {
                measurement.peakRight = right;
                measurement.peakRightFrame = frame;
            }
        }
    }

    const auto stopped = processor.setProcessing(false);
    const auto deactivated = component.setActive(false);
    measurement.latencySamples = processor.getLatencySamples();
    if (!processSucceeded || !succeeded(stopped) || !succeeded(deactivated))
    {
        error = "plugin processing or teardown failed at " + std::to_string(renderCase.sampleRate) + " Hz";
        return false;
    }
    if (measurement.peakFrame != expectedDelayFrames ||
        measurement.peakRightFrame != expectedDelayFrames ||
        std::abs(measurement.peakLeft - expectedGain) > kTolerance ||
        std::abs(measurement.peakRight - (0.5F * expectedGain)) > kTolerance)
    {
        error = "stereo impulse response did not match a one-second delay at " +
            std::to_string(renderCase.sampleRate) + " Hz";
        return false;
    }
    return true;
}

bool readComponentState(
    IComponent& component,
    std::array<uint8_t, kTestDelayStateSize>& bytes,
    std::string& error)
{
    MemoryStream stream;
    if (!succeeded(component.getState(&stream)) ||
        stream.getSize() != static_cast<Steinberg::TSize>(bytes.size()))
    {
        error = "plugin component state did not serialize to the expected fixed-size fixture format";
        return false;
    }
    std::memcpy(bytes.data(), stream.getData(), bytes.size());
    return true;
}

bool restoreComponentState(
    IComponent& component,
    const std::array<uint8_t, kTestDelayStateSize>& bytes)
{
    auto mutableBytes = bytes;
    MemoryStream stream(mutableBytes.data(), static_cast<Steinberg::TSize>(mutableBytes.size()));
    return succeeded(component.setState(&stream));
}

void writeU32LE(uint8_t* destination, uint32_t value)
{
    for (std::size_t index = 0; index < 4; ++index)
        destination[index] = static_cast<uint8_t>((value >> (index * 8U)) & 0xffU);
}

bool rejectStateWithoutMutation(
    IComponent& component,
    const std::array<uint8_t, kTestDelayStateSize>& invalidState,
    const std::array<uint8_t, kTestDelayStateSize>& expectedState,
    const std::string& description,
    std::string& error)
{
    if (restoreComponentState(component, invalidState))
    {
        error = "component accepted " + description;
        return false;
    }

    std::array<uint8_t, kTestDelayStateSize> currentState{};
    if (!readComponentState(component, currentState, error))
        return false;
    if (currentState != expectedState)
    {
        error = "rejected " + description + " changed the active component state";
        return false;
    }
    return true;
}

bool verifyStateRecall(
    IComponent& component,
    IAudioProcessor& processor,
    Measurement& measurement,
    std::string& error)
{
    std::array<uint8_t, kTestDelayStateSize> defaultState{};
    if (!readComponentState(component, defaultState, error))
        return false;

    // This fixture has no editor; exercise persistence through the VST component API.
    auto editedState = defaultState;
    constexpr float editedGain = 0.5F;
    uint32_t gainBits = 0;
    std::memcpy(&gainBits, &editedGain, sizeof(gainBits));
    writeU32LE(editedState.data() + kTestDelayGainOffset, gainBits);
    if (!restoreComponentState(component, editedState))
    {
        error = "plugin rejected a valid edited component state";
        return false;
    }

    std::array<uint8_t, kTestDelayStateSize> savedState{};
    if (!readComponentState(component, savedState, error))
        return false;
    if (savedState != editedState)
    {
        error = "component getState did not preserve the edited gain state";
        return false;
    }

    if (!restoreComponentState(component, defaultState) || !restoreComponentState(component, savedState))
    {
        error = "component state could not be reset and restored from its saved snapshot";
        return false;
    }

    auto wrongVersion = savedState;
    writeU32LE(wrongVersion.data() + 4, 2);
    if (!rejectStateWithoutMutation(component, wrongVersion, savedState, "a wrong-version state", error))
        return false;

    auto nonFiniteGain = savedState;
    writeU32LE(nonFiniteGain.data() + kTestDelayGainOffset, 0x7fc00000U);
    if (!rejectStateWithoutMutation(component, nonFiniteGain, savedState, "a non-finite gain state", error))
        return false;

    auto outOfRangeGain = savedState;
    constexpr float invalidGain = 3.0F;
    uint32_t invalidGainBits = 0;
    std::memcpy(&invalidGainBits, &invalidGain, sizeof(invalidGainBits));
    writeU32LE(outOfRangeGain.data() + kTestDelayGainOffset, invalidGainBits);
    if (!rejectStateWithoutMutation(component, outOfRangeGain, savedState, "an out-of-range gain state", error))
        return false;

    std::array<uint8_t, 4> truncatedState{{'U', 'B', 'X', 'D'}};
    MemoryStream truncatedStream(
        truncatedState.data(), static_cast<Steinberg::TSize>(truncatedState.size()));
    if (succeeded(component.setState(&truncatedStream)))
    {
        error = "component accepted a truncated state stream";
        return false;
    }

    std::array<uint8_t, kTestDelayStateSize> stateAfterRejectedInput{};
    if (!readComponentState(component, stateAfterRejectedInput, error))
        return false;
    if (stateAfterRejectedInput != savedState)
    {
        error = "rejected malformed state changed the active component state";
        return false;
    }

    return processImpulse(processor, component, {48000.0, 256}, measurement, error, editedGain);
}

} // namespace

int main(int argc, char* argv[])
{
    if (argc != 2)
    {
        std::cerr << "Usage: unbox-vst3-host-smoke <source-built .vst3 bundle>\n";
        return 2;
    }

    const std::filesystem::path pluginPath = std::filesystem::absolute(argv[1]);
    std::string loadError;
    const auto module = Module::create(pluginPath.string(), loadError);
    if (!module)
        return fail("could not load the supplied VST3 bundle: " + loadError);

    auto factory = module->getFactory();
    HostApplication hostContext;
    factory.setHostContext(&hostContext);

    auto classInfos = factory.classInfos();
    const auto pluginClass = std::find_if(classInfos.begin(), classInfos.end(), [](const auto& info) {
        return info.category() == kVstAudioEffectClass;
    });
    if (pluginClass == classInfos.end())
        return fail("the supplied bundle has no VST3 audio-effect class");
    if (pluginClass->name() != "Unbox Test Delay")
        return fail("the smoke probe requires the project-owned Unbox Test Delay fixture");

    IPtr<IComponent> component = factory.createInstance<IComponent>(pluginClass->ID());
    if (!component)
        return fail("the plugin factory did not create an IComponent");

    FUnknownPtr<IPluginBase> pluginBase(component);
    if (!pluginBase || !succeeded(pluginBase->initialize(&hostContext)))
        return fail("plugin component initialization failed");

    FUnknownPtr<IAudioProcessor> processor(component);
    if (!processor)
    {
        pluginBase->terminate();
        return fail("the plugin component does not expose IAudioProcessor");
    }

    const auto inputBusCount = component->getBusCount(kAudio, kInput);
    const auto outputBusCount = component->getBusCount(kAudio, kOutput);
    if (inputBusCount != 1 || outputBusCount != 1)
    {
        pluginBase->terminate();
        return fail("the smoke probe expects exactly one audio input and one audio output bus");
    }

    auto arrangement = Steinberg::Vst::SpeakerArr::kStereo;
    if (!succeeded(processor->setBusArrangements(&arrangement, 1, &arrangement, 1)) ||
        !succeeded(component->activateBus(kAudio, kInput, 0, true)) ||
        !succeeded(component->activateBus(kAudio, kOutput, 0, true)))
    {
        pluginBase->terminate();
        return fail("the plugin rejected the stereo main-bus arrangement");
    }

    std::array<Measurement, kRenderCases.size()> measurements{};
    for (std::size_t index = 0; index < kRenderCases.size(); ++index)
    {
        std::string error;
        if (!processImpulse(*processor, *component, kRenderCases[index], measurements[index], error))
        {
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail(error);
        }
    }

    Measurement stateRecallMeasurement{};
    std::string stateError;
    if (!verifyStateRecall(*component, *processor, stateRecallMeasurement, stateError))
    {
        processor->setProcessing(false);
        component->setActive(false);
        pluginBase->terminate();
        return fail("component state recall failed: " + stateError);
    }

    pluginBase->terminate();

    std::cout << std::fixed << std::setprecision(6)
              << "{\"plugin\":\"" << pluginClass->name() << "\",\"cases\":[";
    for (std::size_t index = 0; index < kRenderCases.size(); ++index)
    {
        if (index != 0)
            std::cout << ',';
        const auto& renderCase = kRenderCases[index];
        const auto& measurement = measurements[index];
        std::cout << "{\"sampleRate\":" << static_cast<uint32_t>(renderCase.sampleRate) << ','
                  << "\"blockSize\":" << renderCase.blockSize << ','
                  << "\"latencySamples\":" << measurement.latencySamples << ','
                  << "\"peakFrame\":" << measurement.peakFrame << ','
                  << "\"peakRightFrame\":" << measurement.peakRightFrame << ','
                  << "\"peakLeft\":" << measurement.peakLeft << ','
                  << "\"peakRight\":" << measurement.peakRight << '}';
    }
    std::cout << "],\"stateRecall\":{\"sampleRate\":48000,\"blockSize\":256,"
              << "\"latencySamples\":" << stateRecallMeasurement.latencySamples << ','
              << "\"peakFrame\":" << stateRecallMeasurement.peakFrame << ','
              << "\"peakLeft\":" << stateRecallMeasurement.peakLeft << ','
              << "\"peakRight\":" << stateRecallMeasurement.peakRight << "}}\n";
    return 0;
}
