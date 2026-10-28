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
#include <cmath>
#include <filesystem>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace {

using Steinberg::FUnknownPtr;
using Steinberg::IPluginBase;
using Steinberg::IPtr;
using Steinberg::kResultOk;
using Steinberg::kResultTrue;
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

constexpr int32_t kBlockSize = 32;
constexpr int32_t kNoteOnOffset = 5;
constexpr int32_t kNoteOffOffset = 20;
constexpr float kVelocity = 0.8F;
constexpr float kTolerance = 1.0e-5F;

bool succeeded(Steinberg::tresult result)
{
    return result == kResultOk || result == kResultTrue;
}

int fail(const std::string& message)
{
    std::cerr << "VST3 instrument host smoke failed: " << message << '\n';
    return 1;
}

} // namespace

int main(int argc, char* argv[])
{
    if (argc != 2)
    {
        std::cerr << "Usage: unbox-vst3-instrument-smoke <source-built .vst3 bundle>\n";
        return 2;
    }

    std::string loadError;
    const auto module = Module::create(std::filesystem::absolute(argv[1]).string(), loadError);
    if (!module)
        return fail("could not load the supplied VST3 bundle: " + loadError);

    auto factory = module->getFactory();
    HostApplication hostContext;
    factory.setHostContext(&hostContext);
    const auto classInfos = factory.classInfos();
    const auto pluginClass = std::find_if(classInfos.begin(), classInfos.end(), [](const auto& info) {
        return info.category() == kVstAudioEffectClass &&
            info.name() == "Unbox Test MIDI Synth";
    });
    if (pluginClass == classInfos.end())
        return fail("the supplied bundle does not contain the project-owned MIDI synth fixture");

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
    if (component->getBusCount(kAudio, kInput) != 0 ||
        component->getBusCount(kAudio, kOutput) != 1 ||
        component->getBusCount(kEvent, kInput) != 1)
    {
        pluginBase->terminate();
        return fail("the fixture must expose one MIDI input and one stereo audio output");
    }

    auto arrangement = Steinberg::Vst::SpeakerArr::kStereo;
    if (!succeeded(processor->setBusArrangements(nullptr, 0, &arrangement, 1)) ||
        !succeeded(component->activateBus(kEvent, kInput, 0, true)) ||
        !succeeded(component->activateBus(kAudio, kOutput, 0, true)))
    {
        pluginBase->terminate();
        return fail("the plugin rejected the MIDI input or stereo output bus");
    }

    ProcessSetup setup{};
    setup.processMode = kOffline;
    setup.symbolicSampleSize = kSample32;
    setup.maxSamplesPerBlock = kBlockSize;
    setup.sampleRate = 48000.0;
    if (!succeeded(processor->setupProcessing(setup)) ||
        !succeeded(component->setActive(true)) ||
        !succeeded(processor->setProcessing(true)))
    {
        component->setActive(false);
        pluginBase->terminate();
        return fail("plugin processing setup or activation failed");
    }

    std::vector<float> outputLeft(kBlockSize, 0.0F);
    std::vector<float> outputRight(kBlockSize, 0.0F);
    float* outputChannels[] = {outputLeft.data(), outputRight.data()};
    AudioBusBuffers outputBus{};
    outputBus.numChannels = 2;
    outputBus.channelBuffers32 = outputChannels;

    EventList events(2);
    Event noteOn{};
    noteOn.busIndex = 0;
    noteOn.sampleOffset = kNoteOnOffset;
    noteOn.type = Event::kNoteOnEvent;
    noteOn.noteOn.channel = 0;
    noteOn.noteOn.pitch = 69;
    noteOn.noteOn.tuning = 0.0F;
    noteOn.noteOn.velocity = kVelocity;
    noteOn.noteOn.noteId = 69;
    Event noteOff{};
    noteOff.busIndex = 0;
    noteOff.sampleOffset = kNoteOffOffset;
    noteOff.type = Event::kNoteOffEvent;
    noteOff.noteOff.channel = 0;
    noteOff.noteOff.pitch = 69;
    noteOff.noteOff.velocity = 0.0F;
    noteOff.noteOff.noteId = 69;
    if (!succeeded(events.addEvent(noteOn)) || !succeeded(events.addEvent(noteOff)))
    {
        processor->setProcessing(false);
        component->setActive(false);
        pluginBase->terminate();
        return fail("could not enqueue the MIDI note-on and note-off fixture events");
    }

    ProcessData data{};
    data.processMode = kOffline;
    data.symbolicSampleSize = kSample32;
    data.numSamples = kBlockSize;
    data.numInputs = 0;
    data.inputs = nullptr;
    data.numOutputs = 1;
    data.outputs = &outputBus;
    data.inputEvents = &events;
    if (!succeeded(processor->process(data)))
    {
        processor->setProcessing(false);
        component->setActive(false);
        pluginBase->terminate();
        return fail("plugin processing rejected the MIDI event block");
    }

    const auto expectedSecondSample = static_cast<float>(
        std::cos(2.0 * std::acos(-1.0) * 440.0 / setup.sampleRate) * kVelocity);
    for (int32_t frame = 0; frame < kBlockSize; ++frame)
    {
        const float expected = frame < kNoteOnOffset || frame >= kNoteOffOffset
            ? 0.0F
            : static_cast<float>(std::cos(2.0 * std::acos(-1.0) * 440.0 *
                static_cast<double>(frame - kNoteOnOffset) / setup.sampleRate) * kVelocity);
        if (std::abs(outputLeft[static_cast<size_t>(frame)] - expected) > kTolerance ||
            std::abs(outputRight[static_cast<size_t>(frame)] - expected) > kTolerance)
        {
            processor->setProcessing(false);
            component->setActive(false);
            pluginBase->terminate();
            return fail("note timing, pitch, velocity, stereo output, or note-off did not match the MIDI events");
        }
    }
    if (std::abs(outputLeft[kNoteOnOffset] - kVelocity) > kTolerance ||
        std::abs(outputLeft[kNoteOnOffset + 1] - expectedSecondSample) > kTolerance)
    {
        processor->setProcessing(false);
        component->setActive(false);
        pluginBase->terminate();
        return fail("the note-on sample offset or 440 Hz pitch did not match the MIDI event");
    }

    const auto stopped = processor->setProcessing(false);
    const auto deactivated = component->setActive(false);
    pluginBase->terminate();
    if (!succeeded(stopped) || !succeeded(deactivated))
        return fail("plugin processing teardown failed");

    std::cout << "{\"plugin\":\"" << pluginClass->name()
              << "\",\"sampleRate\":48000,\"blockSize\":" << kBlockSize
              << ",\"noteOnOffset\":" << kNoteOnOffset
              << ",\"noteOffOffset\":" << kNoteOffOffset
              << ",\"pitch\":69,\"velocity\":" << kVelocity << "}\n";
    return 0;
}
