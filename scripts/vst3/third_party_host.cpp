// Generic out-of-process VST3 host used only by the third-party hosting probe.
//
// process_stream_host.cpp is deliberately locked to the project-owned Unbox Test Delay fixture, so it
// can never be talked into loading anything else. This host is the opposite: it loads whatever module
// the probe hands it, reports what the factory advertises, and streams blocks with the same wire
// protocol (planar stereo float32, 128 frames, 8-byte header). It is a development probe, not the
// shipping host: the packaged app never launches it.

#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/parameterchanges.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

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
using Steinberg::Vst::IEditController;
using Steinberg::Vst::kAudio;
using Steinberg::Vst::kInput;
using Steinberg::Vst::kOffline;
using Steinberg::Vst::kOutput;
using Steinberg::Vst::kSample32;
using Steinberg::Vst::ProcessData;
using Steinberg::Vst::ProcessSetup;
using VST3::Hosting::Module;
using VST3::Hosting::PluginFactory;

constexpr uint32_t kFrames = 128;
constexpr uint32_t kChannels = 2;
constexpr uint32_t kReadySequence = UINT32_MAX;
constexpr double kSampleRate = 48000.0;

struct BlockHeader {
    uint32_t sequence;
    uint32_t frames;
};

struct Parameter {
    Steinberg::Vst::ParamID id;
    double value;
};

bool succeeded(Steinberg::tresult result)
{
    return result == Steinberg::kResultOk || result == Steinberg::kResultTrue;
}

std::string jsonString(const std::string& value)
{
    std::string out;
    for (const char c : value)
    {
        switch (c)
        {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c;
        }
    }
    return out;
}

int fail(const std::string& message)
{
    std::cerr << "VST3 third-party host failed: " << message << '\n';
    return 1;
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

void listClasses(const PluginFactory& factory)
{
    for (const auto& info : factory.classInfos())
    {
        std::cerr << "class {\"name\":\"" << jsonString(info.name()) << "\",\"vendor\":\"" << jsonString(info.vendor())
                  << "\",\"version\":\"" << jsonString(info.version()) << "\",\"category\":\""
                  << jsonString(info.category()) << "\"}\n";
    }
}

} // namespace

int main(int argc, char* argv[])
{
    if (argc < 2)
        return fail("usage: unbox-vst3-third-party-host <plugin.vst3> [--list] [--class NAME] [--param ID=VALUE ...]");

#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    std::cin.tie(nullptr);
    std::cout.tie(nullptr);

    const std::filesystem::path pluginPath = std::filesystem::absolute(argv[1]);
    bool listOnly = false;
    std::string wantedClass;
    std::vector<Parameter> parameters;
    for (int index = 2; index < argc; index++)
    {
        const std::string argument = argv[index];
        if (argument == "--list")
            listOnly = true;
        else if (argument == "--class" && index + 1 < argc)
            wantedClass = argv[++index];
        else if (argument.rfind("--param", 0) == 0 && index + 1 < argc)
        {
            const std::string pair = argv[++index];
            const auto equals = pair.find('=');
            if (equals == std::string::npos)
                return fail("--param needs ID=VALUE");
            parameters.push_back({static_cast<Steinberg::Vst::ParamID>(std::stoul(pair.substr(0, equals))),
                                  std::stod(pair.substr(equals + 1))});
        }
        else
            return fail("unknown argument: " + argument);
    }

    std::string loadError;
    const auto module = Module::create(pluginPath.string(), loadError);
    if (!module)
        return fail("could not load " + pluginPath.string() + ": " + loadError);
    auto factory = module->getFactory();
    if (listOnly)
    {
        std::cerr << "module {\"path\":\"" << jsonString(pluginPath.string()) << "\"}\n";
        listClasses(factory);
        return 0;
    }

    HostApplication hostContext;
    factory.setHostContext(&hostContext);

    const auto classes = factory.classInfos();
    const auto chosen = std::find_if(classes.begin(), classes.end(), [&](const auto& info) {
        if (info.category() != kVstAudioEffectClass)
            return false;
        return wantedClass.empty() || info.name().find(wantedClass) != std::string::npos;
    });
    if (chosen == classes.end())
        return fail("no matching audio-effect class was advertised by the factory");

    // Metadata first, so the caller can record exactly which third-party plugin answered.
    std::cerr << "plugin {\"name\":\"" << jsonString(chosen->name()) << "\",\"vendor\":\"" << jsonString(chosen->vendor())
              << "\",\"version\":\"" << jsonString(chosen->version()) << "\",\"category\":\""
              << jsonString(chosen->category()) << "\"}\n";

    IPtr<IComponent> component = factory.createInstance<IComponent>(chosen->ID());
    if (!component)
        return fail("the factory advertises a class it cannot instantiate");
    FUnknownPtr<IPluginBase> pluginBase(component);
    if (!pluginBase || !succeeded(pluginBase->initialize(&hostContext)))
        return fail("plugin initialisation failed");

    // Parameters travel the way a host automates a plugin: as parameter changes on the first block's
    // ProcessData. Setting them on the component works only for single-component plugins, and split
    // plugins (a separate controller class, like ADelay) would reject it.
    Steinberg::Vst::ParameterChanges parameterChanges;
    for (const auto& parameter : parameters)
    {
        Steinberg::int32 queueIndex = 0;
        auto* queue = parameterChanges.addParameterData(parameter.id, queueIndex);
        if (!queue || !succeeded(queue->addPoint(0, parameter.value, queueIndex)))
            return fail("could not queue parameter " + std::to_string(parameter.id));
    }
    bool changesPending = !parameters.empty();

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
        return fail("plugin rejected its stereo input/output buses");
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

    std::cerr << "ready {\"latencyFrames\":" << processor->getLatencySamples() << ",\"tailFrames\":"
              << processor->getTailSamples() << "}\n";

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
            return fail("input pipe ended in the middle of a block header");
        }
        if (header.frames != kFrames)
            return fail("only fixed 128-frame blocks are accepted");
        const auto bytes = static_cast<std::size_t>(header.frames) * kChannels * sizeof(float);
        if (!readBytes(reinterpret_cast<char*>(input.data()), bytes, eof))
            return fail("input pipe ended in the middle of an audio block");

        std::fill(output.begin(), output.end(), 0.0f);
        ProcessData data{};
        data.processMode = kOffline;
        data.symbolicSampleSize = kSample32;
        data.numSamples = static_cast<int32_t>(header.frames);
        data.numInputs = 1;
        data.inputs = &inputBus;
        data.numOutputs = 1;
        data.outputs = &outputBus;
        if (changesPending)
        {
            data.inputParameterChanges = &parameterChanges;
            changesPending = false;
        }
        if (!succeeded(processor->process(data)) || !writeResponse(header.sequence, header.frames, output.data()))
            return fail("plugin processing or response write failed");
    }

    processor->setProcessing(false);
    component->setActive(false);
    pluginBase->terminate();
    return 0;
}
