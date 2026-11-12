#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstpluginterfacesupport.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include "public.sdk/source/vst/hosting/eventlist.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cmath>
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
using Steinberg::Vst::Event;
using Steinberg::Vst::EventList;
using Steinberg::Vst::HostApplication;
using Steinberg::Vst::IAudioProcessor;
using Steinberg::Vst::IComponent;
using Steinberg::Vst::kAudio;
using Steinberg::Vst::kEvent;
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
constexpr uint32_t kMaxEvents = 128;
constexpr double kSampleRate = 48000.0;

struct RequestHeader {
    uint32_t sequence;
    uint32_t frames;
    uint32_t eventCount;
};

struct MidiEventPacket {
    uint32_t sampleOffset;
    uint32_t type;
    int32_t pitch;
    int32_t noteId;
    float velocity;
    float tuning;
};

struct ResponseHeader {
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

bool writeResponse(uint32_t sequence, uint32_t frames,
    const std::array<float, kFrames * kChannels>& samples)
{
    const ResponseHeader header{sequence, frames};
    std::cout.write(reinterpret_cast<const char*>(&header), sizeof(header));
    if (frames > 0)
    {
        std::array<float, kFrames * kChannels> interleaved{};
        for (uint32_t frame = 0; frame < frames; ++frame)
        {
            interleaved[frame * kChannels] = samples[frame];
            interleaved[frame * kChannels + 1] = samples[kFrames + frame];
        }
        std::cout.write(reinterpret_cast<const char*>(interleaved.data()),
            static_cast<std::streamsize>(interleaved.size() * sizeof(float)));
    }
    std::cout.flush();
    return static_cast<bool>(std::cout);
}

int fail(const std::string& message)
{
    std::cerr << "VST3 MIDI process stream host failed: " << message << '\n';
    return 1;
}

} // namespace

int main(int argc, char* argv[])
{
    if (argc != 2)
        return fail("usage: unbox-vst3-midi-process-stream-host <project-owned .vst3 bundle>");

#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    std::cin.tie(nullptr);
    std::cout.tie(nullptr);

    std::string loadError;
    const auto module = Module::create(std::filesystem::absolute(argv[1]).string(), loadError);
    if (!module)
        return fail("could not load supplied VST3: " + loadError);

    auto factory = module->getFactory();
    HostApplication hostContext;
    factory.setHostContext(&hostContext);
    const auto classInfos = factory.classInfos();
    const auto pluginClass = std::find_if(classInfos.begin(), classInfos.end(), [](const auto& info) {
        return info.category() == kVstAudioEffectClass &&
            info.name() == "Unbox Test MIDI Synth";
    });
    if (pluginClass == classInfos.end())
        return fail("the host accepts only the project-owned Unbox Test MIDI Synth fixture");

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
    const auto outputCount = component->getBusCount(kAudio, kOutput);
    const auto eventInputCount = component->getBusCount(kEvent, kInput);
    auto arrangement = Steinberg::Vst::SpeakerArr::kStereo;
    if (component->getBusCount(kAudio, kInput) != 0 || outputCount != 1 || eventInputCount != 1 ||
        !succeeded(processor->setBusArrangements(nullptr, 0, &arrangement, 1)) ||
        !succeeded(component->activateBus(kEvent, kInput, 0, true)) ||
        !succeeded(component->activateBus(kAudio, kOutput, 0, true)))
    {
        pluginBase->terminate();
        return fail("plugin rejected its MIDI input or stereo audio output buses");
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

    std::array<float, kFrames * kChannels> output{};
    float* outputChannels[] = {output.data(), output.data() + kFrames};
    AudioBusBuffers outputBus{};
    outputBus.numChannels = kChannels;
    outputBus.channelBuffers32 = outputChannels;
    if (!writeResponse(kReadySequence, 0, output))
        return fail("could not write the stream-ready handshake");

    while (true)
    {
        RequestHeader header{};
        bool eof = false;
        if (!readBytes(reinterpret_cast<char*>(&header), sizeof(header), eof))
        {
            if (eof)
                break;
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("input pipe ended in the middle of a request header");
        }
        if (header.frames != kFrames || header.eventCount > kMaxEvents)
        {
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("request used an invalid frame count or exceeded the MIDI event limit");
        }

        EventList events(header.eventCount);
        for (uint32_t index = 0; index < header.eventCount; ++index)
        {
            MidiEventPacket packet{};
            if (!readBytes(reinterpret_cast<char*>(&packet), sizeof(packet), eof))
            {
                processor->setProcessing(false);
                component->setActive(false);
                pluginBase->terminate();
                return fail("input pipe ended in the middle of a MIDI event");
            }
            if (packet.sampleOffset >= kFrames || packet.pitch < 0 || packet.pitch > 127 ||
                packet.noteId < 0 || packet.type > 1 || !std::isfinite(packet.velocity) ||
                !std::isfinite(packet.tuning))
            {
                processor->setProcessing(false);
                component->setActive(false);
                pluginBase->terminate();
                return fail("request contained an invalid MIDI event");
            }

            Event event{};
            event.busIndex = 0;
            event.sampleOffset = static_cast<int32_t>(packet.sampleOffset);
            if (packet.type == 0)
            {
                event.type = Event::kNoteOnEvent;
                event.noteOn.channel = 0;
                event.noteOn.pitch = packet.pitch;
                event.noteOn.tuning = packet.tuning;
                event.noteOn.velocity = packet.velocity;
                event.noteOn.noteId = packet.noteId;
            }
            else
            {
                event.type = Event::kNoteOffEvent;
                event.noteOff.channel = 0;
                event.noteOff.pitch = packet.pitch;
                event.noteOff.velocity = packet.velocity;
                event.noteOff.noteId = packet.noteId;
            }
            if (!succeeded(events.addEvent(event)))
            {
                processor->setProcessing(false);
                component->setActive(false);
                pluginBase->terminate();
                return fail("could not enqueue a MIDI event for the plugin");
            }
        }

        ProcessData data{};
        data.processMode = kOffline;
        data.symbolicSampleSize = kSample32;
        data.numSamples = static_cast<int32_t>(header.frames);
        data.numInputs = 0;
        data.inputs = nullptr;
        data.numOutputs = 1;
        data.outputs = &outputBus;
        data.inputEvents = &events;
        if (!succeeded(processor->process(data)) || !writeResponse(header.sequence, kFrames, output))
        {
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("plugin processing or response write failed");
        }
    }

    const auto stopped = processor->setProcessing(false);
    const auto deactivated = component->setActive(false);
    pluginBase->terminate();
    if (!succeeded(stopped) || !succeeded(deactivated))
        return fail("plugin processing teardown failed");
    return 0;
}
