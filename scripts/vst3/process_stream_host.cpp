#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstpluginterfacesupport.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"

#include <array>
#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <iostream>
#include <string>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

namespace {

using Steinberg::FUnknownPtr;
using Steinberg::IPluginBase;
using Steinberg::IPtr;
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

constexpr uint32_t kFrames = 128;
constexpr uint32_t kChannels = 2;
constexpr uint32_t kReadySequence = UINT32_MAX;
constexpr double kSampleRate = 48000.0;

struct BlockHeader {
    uint32_t sequence;
    uint32_t frames;
};

bool succeeded(Steinberg::tresult result)
{
    return result == Steinberg::kResultOk || result == Steinberg::kResultTrue;
}

bool readBytes(char* destination, std::size_t length, bool& eof)
{
    std::cin.read(destination, static_cast<std::streamsize>(length));
    const auto count = static_cast<std::size_t>(std::cin.gcount());
    if (count == length)
        return true;
    eof = count == 0 && std::cin.eof();
    return false;
}

bool writeResponse(uint32_t sequence, uint32_t frames, const float* samples)
{
    const BlockHeader header{sequence, frames};
    std::cout.write(reinterpret_cast<const char*>(&header), sizeof(header));
    if (frames > 0)
        std::cout.write(reinterpret_cast<const char*>(samples), static_cast<std::streamsize>(frames * kChannels * sizeof(float)));
    std::cout.flush();
    return static_cast<bool>(std::cout);
}

int fail(const std::string& message)
{
    std::cerr << "VST3 process stream host failed: " << message << '\n';
    return 1;
}

} // namespace

int main(int argc, char* argv[])
{
    if (argc != 2)
        return fail("usage: unbox-vst3-process-stream-host <project-owned .vst3 bundle>");

#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    std::cin.tie(nullptr);
    std::cout.tie(nullptr);

    const std::filesystem::path pluginPath = std::filesystem::absolute(argv[1]);
    std::string loadError;
    const auto module = Module::create(pluginPath.string(), loadError);
    if (!module)
        return fail("could not load supplied VST3: " + loadError);

    auto factory = module->getFactory();
    HostApplication hostContext;
    factory.setHostContext(&hostContext);
    const auto classInfos = factory.classInfos();
    const auto pluginClass = std::find_if(classInfos.begin(), classInfos.end(), [](const auto& info) {
        return info.category() == kVstAudioEffectClass;
    });
    if (pluginClass == classInfos.end() || pluginClass->name() != "Unbox Test Delay")
        return fail("the stream probe accepts only the project-owned Unbox Test Delay fixture");

    IPtr<IComponent> component = factory.createInstance<IComponent>(pluginClass->ID());
    if (!component)
        return fail("plugin factory did not create an IComponent");
    FUnknownPtr<IPluginBase> pluginBase(component);
    if (!pluginBase || !succeeded(pluginBase->initialize(&hostContext)))
        return fail("plugin initialization failed");

    FUnknownPtr<IAudioProcessor> processor(component);
    if (!processor)
    {
        pluginBase->terminate();
        return fail("plugin does not expose IAudioProcessor");
    }
    const auto inputBusCount = component->getBusCount(kAudio, kInput);
    const auto outputBusCount = component->getBusCount(kAudio, kOutput);
    auto arrangement = Steinberg::Vst::SpeakerArr::kStereo;
    if (inputBusCount != 1 || outputBusCount != 1 ||
        !succeeded(processor->setBusArrangements(&arrangement, 1, &arrangement, 1)) ||
        !succeeded(component->activateBus(kAudio, kInput, 0, true)) ||
        !succeeded(component->activateBus(kAudio, kOutput, 0, true)))
    {
        pluginBase->terminate();
        return fail("plugin rejected its required stereo input/output buses");
    }

    ProcessSetup setup{};
    setup.processMode = kOffline;
    setup.symbolicSampleSize = kSample32;
    setup.maxSamplesPerBlock = static_cast<int32_t>(kFrames);
    setup.sampleRate = kSampleRate;
    if (!succeeded(processor->setupProcessing(setup)) || !succeeded(component->setActive(true)) ||
        !succeeded(processor->setProcessing(true)))
    {
        component->setActive(false);
        pluginBase->terminate();
        return fail("plugin could not enter 48 kHz / 128-frame processing");
    }

    std::array<float, kFrames * kChannels> input{};
    std::array<float, kFrames * kChannels> output{};
    float* inputChannels[] = {input.data(), input.data() + kFrames};
    float* outputChannels[] = {output.data(), output.data() + kFrames};
    AudioBusBuffers inputBus{};
    inputBus.numChannels = 2;
    inputBus.channelBuffers32 = inputChannels;
    AudioBusBuffers outputBus{};
    outputBus.numChannels = 2;
    outputBus.channelBuffers32 = outputChannels;

    if (!writeResponse(kReadySequence, 0, nullptr))
        return fail("could not write the stream-ready handshake");

    while (true)
    {
        BlockHeader header{};
        bool eof = false;
        if (!readBytes(reinterpret_cast<char*>(&header), sizeof(header), eof))
        {
            if (eof)
                break;
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("input pipe ended in the middle of a block header");
        }
        if (header.frames != kFrames)
        {
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("only fixed 128-frame blocks are accepted");
        }
        const auto bytes = static_cast<std::size_t>(header.frames) * kChannels * sizeof(float);
        if (!readBytes(reinterpret_cast<char*>(input.data()), bytes, eof))
        {
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("input pipe ended in the middle of an audio block");
        }

        ProcessData data{};
        data.processMode = kOffline;
        data.symbolicSampleSize = kSample32;
        data.numSamples = static_cast<int32_t>(header.frames);
        data.numInputs = 1;
        data.inputs = &inputBus;
        data.numOutputs = 1;
        data.outputs = &outputBus;
        if (!succeeded(processor->process(data)) || !writeResponse(header.sequence, header.frames, output.data()))
        {
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("plugin processing or response write failed");
        }
    }

    processor->setProcessing(false);
    component->setActive(false);
    pluginBase->terminate();
    return 0;
}
