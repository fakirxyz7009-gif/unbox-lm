#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstpluginterfacesupport.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include "public.sdk/source/vst/hosting/eventlist.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <iterator>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

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
using Steinberg::Vst::kRealtime;
using Steinberg::Vst::kSample32;
using Steinberg::Vst::ProcessData;
using Steinberg::Vst::ProcessSetup;
using VST3::Hosting::Module;

constexpr uint32_t kFrames = 128;
constexpr uint32_t kChannels = 2;
constexpr uint32_t kSlotCount = 4;
constexpr uint32_t kBlockSamples = kFrames * kChannels;
constexpr uint32_t kMaxMidiEvents = 8;
constexpr uint32_t kMagic = 0x55425853; // UBXS
constexpr uint32_t kVersion = 2;
constexpr uint32_t kBlockCount = 2400;
constexpr uint32_t kDeclaredLatencyFrames = 48000;
constexpr uint32_t kDelayBlocks = kDeclaredLatencyFrames / kFrames;
constexpr double kSampleRate = 48000.0;
constexpr double kPeriodMs = static_cast<double>(kFrames) * 1000.0 / kSampleRate;
constexpr LONG kSlotFree = 0;
constexpr LONG kSlotInputReady = 1;
constexpr LONG kSlotProcessing = 2;
constexpr LONG kSlotOutputReady = 3;
constexpr uint32_t kEffectPlugin = 0;
constexpr uint32_t kMidiInstrumentPlugin = 1;

struct MidiEventPacket {
    uint32_t sampleOffset;
    uint32_t type;
    int32_t pitch;
    int32_t noteId;
    float velocity;
    float tuning;
};

struct SharedSlot {
    volatile LONG state;
    uint32_t sequence;
    uint32_t frames;
    uint32_t eventCount;
    MidiEventPacket events[kMaxMidiEvents];
    LARGE_INTEGER completedAt;
    float samples[kBlockSamples];
};

struct SharedRegion {
    uint32_t magic;
    uint32_t version;
    uint32_t processMode;
    uint32_t pluginKind;
    volatile LONG ready;
    volatile LONG error;
    volatile LONG shutdown;
    SharedSlot slots[kSlotCount];
};

struct PendingBlock {
    uint32_t sequence;
    LARGE_INTEGER sentAt;
    LARGE_INTEGER deadline;
    bool deadlineMissed;
};

bool succeeded(Steinberg::tresult result)
{
    return result == Steinberg::kResultOk || result == Steinberg::kResultTrue;
}

LONG readLong(volatile LONG* value)
{
    return InterlockedCompareExchange(value, 0, 0);
}

void signalError(SharedRegion* region, HANDLE outputEvent, LONG errorCode)
{
    InterlockedExchange(&region->error, errorCode);
    InterlockedExchange(&region->ready, -1);
    if (outputEvent)
        SetEvent(outputEvent);
}

std::wstring quoteArgument(const std::wstring& value)
{
    std::wstring result = L"\"";
    size_t backslashes = 0;
    for (wchar_t character : value) {
        if (character == L'\\') {
            ++backslashes;
        } else if (character == L'\"') {
            result.append(backslashes * 2 + 1, L'\\');
            result.push_back(character);
            backslashes = 0;
        } else {
            result.append(backslashes, L'\\');
            backslashes = 0;
            result.push_back(character);
        }
    }
    result.append(backslashes * 2, L'\\');
    result.push_back(L'\"');
    return result;
}

void makeInput(uint32_t sequence, float* samples)
{
    for (uint32_t frame = 0; frame < kFrames; ++frame) {
        const auto globalFrame = static_cast<int64_t>(sequence) * kFrames + frame;
        const auto left = static_cast<float>((globalFrame % 97 - 48) / 64.0);
        samples[frame * 2] = left;
        samples[frame * 2 + 1] = -left / 2.0f;
    }
}

uint32_t midiPitch(uint32_t phrase)
{
    return 48 + (phrase * 7) % 36;
}

float midiVelocity(uint32_t phrase)
{
    return 0.2F + static_cast<float>((phrase * 37) % 60) / 100.0F;
}

uint32_t midiNoteOnOffset(uint32_t phrase)
{
    return 1 + (phrase * 17) % 64;
}

uint32_t midiNoteOffOffset(uint32_t phrase)
{
    return 64 + (phrase * 13) % 64;
}

void makeMidiEvents(uint32_t sequence, SharedSlot& slot)
{
    slot.eventCount = 0;
    const uint32_t phraseBlock = sequence % 8;
    if (phraseBlock != 0 && phraseBlock != 2)
        return;

    const uint32_t phrase = sequence / 8;
    auto& event = slot.events[0];
    event.sampleOffset = phraseBlock == 0 ? midiNoteOnOffset(phrase) : midiNoteOffOffset(phrase);
    event.type = phraseBlock == 0 ? 0 : 1;
    event.pitch = static_cast<int32_t>(midiPitch(phrase));
    event.noteId = static_cast<int32_t>(phrase);
    event.velocity = phraseBlock == 0 ? midiVelocity(phrase) : 0.5F;
    event.tuning = 0.0F;
    slot.eventCount = 1;
}

float expectedSynthSample(uint32_t sequence, uint32_t frame)
{
    const uint32_t phrase = sequence / 8;
    const uint32_t phraseBlock = sequence % 8;
    int64_t sampleFromNoteOn = -1;
    const auto noteOnOffset = midiNoteOnOffset(phrase);
    const auto noteOffOffset = midiNoteOffOffset(phrase);
    if (phraseBlock == 0 && frame >= noteOnOffset)
        sampleFromNoteOn = static_cast<int64_t>(frame - noteOnOffset);
    else if (phraseBlock == 1)
        sampleFromNoteOn = static_cast<int64_t>(kFrames - noteOnOffset) + frame;
    else if (phraseBlock == 2 && frame < noteOffOffset)
        sampleFromNoteOn = static_cast<int64_t>(2 * kFrames - noteOnOffset) + frame;
    if (sampleFromNoteOn < 0)
        return 0.0F;

    const double semitones = static_cast<double>(midiPitch(phrase)) - 69.0;
    const double frequency = 440.0 * std::pow(2.0, semitones / 12.0);
    const double phase = 6.283185307179586476925286766559 * frequency *
        static_cast<double>(sampleFromNoteOn) / kSampleRate;
    return static_cast<float>(std::cos(phase) * midiVelocity(phrase));
}

double qpcMilliseconds(LARGE_INTEGER start, LARGE_INTEGER end, LARGE_INTEGER frequency)
{
    return static_cast<double>(end.QuadPart - start.QuadPart) * 1000.0 / static_cast<double>(frequency.QuadPart);
}

void waitUntil(HANDLE timer, LARGE_INTEGER due, LARGE_INTEGER frequency, bool& timerLate)
{
    LARGE_INTEGER now{};
    QueryPerformanceCounter(&now);
    const auto remaining = due.QuadPart - now.QuadPart;
    if (remaining <= 0) {
        timerLate = true;
        return;
    }
    const auto ticks100ns = static_cast<LONGLONG>(static_cast<long double>(remaining) * 10'000'000.0L /
        static_cast<long double>(frequency.QuadPart));
    LARGE_INTEGER relative{};
    relative.QuadPart = -std::max<LONGLONG>(1, ticks100ns);
    if (!SetWaitableTimer(timer, &relative, 0, nullptr, nullptr, FALSE))
        throw std::runtime_error("SetWaitableTimer failed");
    if (WaitForSingleObject(timer, INFINITE) != WAIT_OBJECT_0)
        throw std::runtime_error("high-resolution block timer wait failed");
    QueryPerformanceCounter(&now);
    timerLate = now.QuadPart > due.QuadPart;
}

int workerMain(const wchar_t* pluginArgument, const wchar_t* mappingName,
    const wchar_t* workEventName, const wchar_t* outputEventName)
{
    const HANDLE mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, mappingName);
    if (!mapping)
        return 2;
    auto* region = static_cast<SharedRegion*>(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(SharedRegion)));
    if (!region) {
        CloseHandle(mapping);
        return 3;
    }
    const HANDLE workEvent = OpenEventW(SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE, workEventName);
    const HANDLE outputEvent = OpenEventW(SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE, outputEventName);
    if (!workEvent || !outputEvent) {
        if (workEvent) CloseHandle(workEvent);
        if (outputEvent) CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 4;
    }
    if (region->magic != kMagic || region->version != kVersion ||
        (region->pluginKind != kEffectPlugin && region->pluginKind != kMidiInstrumentPlugin)) {
        signalError(region, outputEvent, 5);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 5;
    }

    const auto pluginPath = std::filesystem::absolute(std::filesystem::path(pluginArgument)).u8string();
    std::string loadError;
    const auto module = Module::create(pluginPath, loadError);
    if (!module) {
        signalError(region, outputEvent, 6);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 6;
    }

    auto factory = module->getFactory();
    HostApplication hostContext;
    factory.setHostContext(&hostContext);
    const bool midiInstrument = region->pluginKind == kMidiInstrumentPlugin;
    const std::string expectedPluginName = midiInstrument ? "Unbox Test MIDI Synth" : "Unbox Test Delay";
    const auto classInfos = factory.classInfos();
    const auto pluginClass = std::find_if(classInfos.begin(), classInfos.end(), [&expectedPluginName](const auto& info) {
        return info.category() == kVstAudioEffectClass && info.name().compare(expectedPluginName) == 0;
    });
    if (pluginClass == classInfos.end()) {
        signalError(region, outputEvent, 7);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 7;
    }

    IPtr<IComponent> component = factory.createInstance<IComponent>(pluginClass->ID());
    if (!component) {
        signalError(region, outputEvent, 8);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 8;
    }
    FUnknownPtr<IPluginBase> pluginBase(component);
    if (!pluginBase || !succeeded(pluginBase->initialize(&hostContext))) {
        signalError(region, outputEvent, 9);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 9;
    }

    FUnknownPtr<IAudioProcessor> processor(component);
    if (!processor) {
        pluginBase->terminate();
        signalError(region, outputEvent, 10);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 10;
    }

    auto arrangement = Steinberg::Vst::SpeakerArr::kStereo;
    const auto audioInputCount = component->getBusCount(kAudio, kInput);
    const auto audioOutputCount = component->getBusCount(kAudio, kOutput);
    const auto eventInputCount = component->getBusCount(kEvent, kInput);
    const bool busCountsValid = midiInstrument
        ? audioInputCount == 0 && audioOutputCount == 1 && eventInputCount == 1
        : audioInputCount == 1 && audioOutputCount == 1 && eventInputCount == 0;
    const bool arrangementAccepted = midiInstrument
        ? succeeded(processor->setBusArrangements(nullptr, 0, &arrangement, 1))
        : succeeded(processor->setBusArrangements(&arrangement, 1, &arrangement, 1));
    const bool busesActivated = midiInstrument
        ? succeeded(component->activateBus(kEvent, kInput, 0, true)) &&
            succeeded(component->activateBus(kAudio, kOutput, 0, true))
        : succeeded(component->activateBus(kAudio, kInput, 0, true)) &&
            succeeded(component->activateBus(kAudio, kOutput, 0, true));
    if (!busCountsValid || !arrangementAccepted || !busesActivated) {
        pluginBase->terminate();
        signalError(region, outputEvent, 11);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 11;
    }

    ProcessSetup setup{};
    if (region->processMode != static_cast<uint32_t>(kOffline) &&
        region->processMode != static_cast<uint32_t>(kRealtime)) {
        pluginBase->terminate();
        signalError(region, outputEvent, 12);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 12;
    }
    setup.processMode = static_cast<Steinberg::Vst::ProcessModes>(region->processMode);
    setup.symbolicSampleSize = kSample32;
    setup.maxSamplesPerBlock = static_cast<int32_t>(kFrames);
    setup.sampleRate = kSampleRate;
    if (!succeeded(processor->setupProcessing(setup)) || !succeeded(component->setActive(true)) ||
        !succeeded(processor->setProcessing(true))) {
        component->setActive(false);
        pluginBase->terminate();
        signalError(region, outputEvent, 12);
        CloseHandle(workEvent);
        CloseHandle(outputEvent);
        UnmapViewOfFile(region);
        CloseHandle(mapping);
        return 12;
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
    // The event-list capacity is fixed by the shared block protocol. Constructing EventList
    // allocates its backing array, so keep one list for the worker lifetime and clear it per
    // block rather than allocating/freeing in the real-time processing loop.
    EventList events(static_cast<int32_t>(kMaxMidiEvents));
    InterlockedExchange(&region->ready, 1);
    SetEvent(outputEvent);

    uint32_t nextSequence = 0;
    while (readLong(&region->shutdown) == 0) {
        const DWORD waitResult = WaitForSingleObject(workEvent, 1000);
        if (waitResult == WAIT_FAILED) {
            signalError(region, outputEvent, 13);
            break;
        }
        if (readLong(&region->shutdown) != 0)
            break;

        while (nextSequence < kBlockCount) {
            auto& slot = region->slots[nextSequence % kSlotCount];
            if (InterlockedCompareExchange(&slot.state, kSlotProcessing, kSlotInputReady) != kSlotInputReady)
                break;
            if (slot.sequence != nextSequence || slot.frames != kFrames) {
                signalError(region, outputEvent, 14);
                break;
            }
            if (midiInstrument) {
                events.clear();
                if (slot.eventCount > kMaxMidiEvents) {
                    signalError(region, outputEvent, 15);
                    break;
                }
                for (uint32_t eventIndex = 0; eventIndex < slot.eventCount; ++eventIndex) {
                    const auto& packet = slot.events[eventIndex];
                    if (packet.sampleOffset >= kFrames || packet.pitch < 0 || packet.pitch > 127 ||
                        packet.noteId < 0 || packet.type > 1 || !std::isfinite(packet.velocity) ||
                        !std::isfinite(packet.tuning) || packet.velocity < 0.0F || packet.velocity > 1.0F) {
                        signalError(region, outputEvent, 16);
                        break;
                    }
                    Event event{};
                    event.busIndex = 0;
                    event.sampleOffset = static_cast<int32_t>(packet.sampleOffset);
                    if (packet.type == 0) {
                        event.type = Event::kNoteOnEvent;
                        event.noteOn.channel = 0;
                        event.noteOn.pitch = packet.pitch;
                        event.noteOn.noteId = packet.noteId;
                        event.noteOn.velocity = packet.velocity;
                        event.noteOn.tuning = packet.tuning;
                    } else {
                        event.type = Event::kNoteOffEvent;
                        event.noteOff.channel = 0;
                        event.noteOff.pitch = packet.pitch;
                        event.noteOff.noteId = packet.noteId;
                        event.noteOff.velocity = packet.velocity;
                    }
                    if (!succeeded(events.addEvent(event))) {
                        signalError(region, outputEvent, 17);
                        break;
                    }
                }
                if (readLong(&region->error) != 0)
                    break;
            } else {
                if (slot.eventCount != 0) {
                    signalError(region, outputEvent, 18);
                    break;
                }
                for (uint32_t frame = 0; frame < kFrames; ++frame) {
                    input[frame] = slot.samples[frame * 2];
                    input[kFrames + frame] = slot.samples[frame * 2 + 1];
                }
            }
            ProcessData data{};
            data.processMode = setup.processMode;
            data.symbolicSampleSize = kSample32;
            data.numSamples = static_cast<int32_t>(kFrames);
            data.numInputs = midiInstrument ? 0 : 1;
            data.inputs = midiInstrument ? nullptr : &inputBus;
            data.numOutputs = 1;
            data.outputs = &outputBus;
            data.inputEvents = midiInstrument ? &events : nullptr;
            if (!succeeded(processor->process(data))) {
                signalError(region, outputEvent, 19);
                break;
            }
            for (uint32_t frame = 0; frame < kFrames; ++frame) {
                slot.samples[frame * 2] = output[frame];
                slot.samples[frame * 2 + 1] = output[kFrames + frame];
            }
            QueryPerformanceCounter(&slot.completedAt);
            InterlockedExchange(&slot.state, kSlotOutputReady);
            ++nextSequence;
            SetEvent(outputEvent);
        }
        if (readLong(&region->error) != 0)
            break;
    }

    const LONG workerError = readLong(&region->error);
    processor->setProcessing(false);
    component->setActive(false);
    pluginBase->terminate();
    CloseHandle(workEvent);
    CloseHandle(outputEvent);
    UnmapViewOfFile(region);
    CloseHandle(mapping);
    return workerError == 0 ? 0 : 16;
}

int parentMain(const std::filesystem::path& pluginPath, bool paced, bool midiInstrument)
{
    SharedRegion* region = nullptr;
    HANDLE mapping = nullptr;
    HANDLE workEvent = nullptr;
    HANDLE outputEvent = nullptr;
    HANDLE timer = nullptr;
    PROCESS_INFORMATION process{};
    std::vector<PendingBlock> pending;
    std::vector<double> roundTripMs;
    std::vector<uint32_t> missedDeadlineSequences;
    bool processStarted = false;
    bool highResolutionTimer = false;
    uint32_t acknowledgements = 0;
    uint32_t deadlineMisses = 0;
    uint32_t lateSchedules = 0;
    uint32_t maxInFlight = 0;
    uint32_t ringBackpressureWaits = 0;
    double maxScheduleLateness = 0.0;
    double checksum = 0.0;

    LARGE_INTEGER frequency{};
    QueryPerformanceFrequency(&frequency);
    const auto suffix = std::to_wstring(GetCurrentProcessId()) + L"_" + std::to_wstring(GetTickCount64());
    const auto mappingName = L"Local\\UnboxVst3Ring_" + suffix;
    const auto workEventName = L"Local\\UnboxVst3Work_" + suffix;
    const auto outputEventName = L"Local\\UnboxVst3Output_" + suffix;
    int exitCode = 1;

    try {
      do {
        mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
            static_cast<DWORD>(sizeof(SharedRegion)), mappingName.c_str());
        if (!mapping) { std::cerr << "Could not create shared audio ring mapping.\n"; break; }
        region = static_cast<SharedRegion*>(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(SharedRegion)));
        if (!region) { std::cerr << "Could not map shared audio ring.\n"; break; }
        std::memset(region, 0, sizeof(SharedRegion));
        region->magic = kMagic;
        region->version = kVersion;
        region->processMode = static_cast<uint32_t>(paced ? kRealtime : kOffline);
        region->pluginKind = midiInstrument ? kMidiInstrumentPlugin : kEffectPlugin;
        workEvent = CreateEventW(nullptr, FALSE, FALSE, workEventName.c_str());
        outputEvent = CreateEventW(nullptr, FALSE, FALSE, outputEventName.c_str());
        if (!workEvent || !outputEvent) { std::cerr << "Could not create shared audio ring events.\n"; break; }

        std::array<wchar_t, 32768> executable{};
        const DWORD executableLength = GetModuleFileNameW(nullptr, executable.data(), static_cast<DWORD>(executable.size()));
        if (executableLength == 0 || executableLength >= executable.size()) {
            std::cerr << "Could not resolve native host executable path.\n";
            break;
        }
        const std::wstring commandLine = quoteArgument(executable.data()) + L" --worker " +
            quoteArgument(pluginPath.wstring()) + L" " + quoteArgument(mappingName) + L" " +
            quoteArgument(workEventName) + L" " + quoteArgument(outputEventName);
        std::vector<wchar_t> mutableCommand(commandLine.begin(), commandLine.end());
        mutableCommand.push_back(L'\0');
        STARTUPINFOW startup{};
        startup.cb = sizeof(startup);
        if (!CreateProcessW(executable.data(), mutableCommand.data(), nullptr, nullptr, FALSE,
            CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process)) {
            std::cerr << "Could not start isolated VST3 worker process.\n";
            break;
        }
        processStarted = true;
        if (WaitForSingleObject(outputEvent, 15'000) != WAIT_OBJECT_0 || readLong(&region->ready) != 1) {
            std::cerr << "VST3 worker startup failed (code=" << readLong(&region->error) << ").\n";
            break;
        }

        if (paced) {
            constexpr DWORD kHighResolutionFlag = 0x00000002;
            timer = CreateWaitableTimerExW(nullptr, nullptr, kHighResolutionFlag, TIMER_ALL_ACCESS);
            highResolutionTimer = timer != nullptr;
            if (!timer)
                timer = CreateWaitableTimerW(nullptr, FALSE, nullptr);
            if (!timer) { std::cerr << "Could not create block pacing timer.\n"; break; }
        }

        const double periodTicks = static_cast<double>(frequency.QuadPart) * static_cast<double>(kFrames) / kSampleRate;
        LARGE_INTEGER start{};
        QueryPerformanceCounter(&start);
        LARGE_INTEGER firstDue{};
        firstDue.QuadPart = start.QuadPart + static_cast<LONGLONG>(periodTicks);

        auto consumeCompleted = [&](LARGE_INTEGER now) {
            for (size_t index = 0; index < pending.size();) {
                auto& item = pending[index];
                auto& slot = region->slots[item.sequence % kSlotCount];
                if (readLong(&slot.state) == kSlotOutputReady && slot.sequence == item.sequence) {
                    const int64_t sourceSequence = static_cast<int64_t>(item.sequence) - kDelayBlocks;
                    std::array<float, kBlockSamples> source{};
                    if (!midiInstrument && sourceSequence >= 0)
                        makeInput(static_cast<uint32_t>(sourceSequence), source.data());
                    for (uint32_t sample = 0; sample < kBlockSamples; ++sample) {
                        double expected = 0.0;
                        if (midiInstrument) {
                            expected = expectedSynthSample(item.sequence, sample / kChannels);
                        } else if (sourceSequence >= 0) {
                            expected = source[sample];
                        }
                        const double actual = slot.samples[sample];
                        if (std::abs(actual - expected) > 1e-6)
                            throw std::runtime_error("VST3 shared-ring sample mismatch at block " +
                                std::to_string(item.sequence) + ", sample " + std::to_string(sample));
                        checksum += std::abs(actual);
                    }
                    roundTripMs.push_back(qpcMilliseconds(item.sentAt, slot.completedAt, frequency));
                    InterlockedExchange(&slot.state, kSlotFree);
                    pending.erase(pending.begin() + static_cast<std::ptrdiff_t>(index));
                    ++acknowledgements;
                } else {
                    if (paced && !item.deadlineMissed && now.QuadPart >= item.deadline.QuadPart) {
                        item.deadlineMissed = true;
                        ++deadlineMisses;
                        missedDeadlineSequences.push_back(item.sequence);
                    }
                    ++index;
                }
            }
        };

        for (uint32_t sequence = 0; sequence < kBlockCount; ++sequence) {
            LARGE_INTEGER due{};
            if (paced) {
                due.QuadPart = firstDue.QuadPart + static_cast<LONGLONG>(periodTicks * sequence);
                bool timerLate = false;
                waitUntil(timer, due, frequency, timerLate);
                LARGE_INTEGER now{};
                QueryPerformanceCounter(&now);
                const double lateness = std::max(0.0, qpcMilliseconds(due, now, frequency));
                maxScheduleLateness = std::max(maxScheduleLateness, lateness);
                if (timerLate && lateness > 1.0)
                    ++lateSchedules;
                consumeCompleted(now);
            } else {
                LARGE_INTEGER now{};
                QueryPerformanceCounter(&now);
                consumeCompleted(now);
            }

            if (readLong(&region->error) != 0)
                throw std::runtime_error("VST3 worker reported shared audio ring error " +
                    std::to_string(readLong(&region->error)));

            auto& slot = region->slots[sequence % kSlotCount];
            bool recordedBackpressure = false;
            while (readLong(&slot.state) != kSlotFree) {
                if (!recordedBackpressure) {
                    ++ringBackpressureWaits;
                    recordedBackpressure = true;
                }
                if (paced) {
                    std::cerr << "Shared audio ring slot was not free at the scheduled block boundary"
                              << " (sequence=" << sequence
                              << "; slot-state=" << readLong(&slot.state)
                              << "; pending=" << pending.size()
                              << "; maximum-schedule-lateness=" << maxScheduleLateness << " ms).\n";
                    throw std::runtime_error("shared audio ring capacity exhausted");
                }
                if (WaitForSingleObject(outputEvent, 5000) != WAIT_OBJECT_0)
                    throw std::runtime_error("timed out waiting for a free shared audio ring slot");
                LARGE_INTEGER now{};
                QueryPerformanceCounter(&now);
                consumeCompleted(now);
                if (readLong(&region->error) != 0)
                    throw std::runtime_error("VST3 worker reported shared audio ring error " + std::to_string(readLong(&region->error)));
            }

            slot.sequence = sequence;
            slot.frames = kFrames;
            if (midiInstrument) {
                std::fill(std::begin(slot.samples), std::end(slot.samples), 0.0F);
                makeMidiEvents(sequence, slot);
            } else {
                slot.eventCount = 0;
                makeInput(sequence, slot.samples);
            }
            LARGE_INTEGER sentAt{};
            QueryPerformanceCounter(&sentAt);
            LARGE_INTEGER deadline{};
            deadline.QuadPart = (paced ? due.QuadPart : sentAt.QuadPart) + static_cast<LONGLONG>(periodTicks);
            pending.push_back({sequence, sentAt, deadline, false});
            maxInFlight = std::max(maxInFlight, static_cast<uint32_t>(pending.size()));
            InterlockedExchange(&slot.state, kSlotInputReady);
            if (!SetEvent(workEvent))
                throw std::runtime_error("could not signal the VST3 worker process");
        }

        if (paced) {
            LARGE_INTEGER lastDeadline{};
            lastDeadline.QuadPart = firstDue.QuadPart + static_cast<LONGLONG>(periodTicks * kBlockCount);
            bool timerLate = false;
            waitUntil(timer, lastDeadline, frequency, timerLate);
            LARGE_INTEGER now{};
            QueryPerformanceCounter(&now);
            const double lateness = std::max(0.0, qpcMilliseconds(lastDeadline, now, frequency));
            maxScheduleLateness = std::max(maxScheduleLateness, lateness);
            if (timerLate && lateness > 1.0)
                ++lateSchedules;
            consumeCompleted(now);
        }

        if (paced && deadlineMisses != 0) {
            std::string sequences;
            for (size_t i = 0; i < missedDeadlineSequences.size(); ++i) {
                if (i != 0) sequences += ",";
                sequences += std::to_string(missedDeadlineSequences[i]);
            }
            throw std::runtime_error("one-block response deadline missed " +
                std::to_string(deadlineMisses) + " time(s); sequences=" + sequences);
        }

        while (!pending.empty()) {
            if (WaitForSingleObject(outputEvent, 5000) != WAIT_OBJECT_0)
                throw std::runtime_error("timed out while draining VST3 shared-ring output");
            LARGE_INTEGER now{};
            QueryPerformanceCounter(&now);
            consumeCompleted(now);
            if (readLong(&region->error) != 0)
                throw std::runtime_error("VST3 worker reported shared audio ring error " + std::to_string(readLong(&region->error)));
        }

        LARGE_INTEGER end{};
        QueryPerformanceCounter(&end);
        const double elapsedMs = qpcMilliseconds(start, end, frequency);
        std::sort(roundTripMs.begin(), roundTripMs.end());
        const auto percentile = [&](double fraction) {
            const auto index = static_cast<size_t>(std::ceil(roundTripMs.size() * fraction));
            return roundTripMs[std::min(roundTripMs.size() - 1, index ? index - 1 : 0)];
        };
        const double throughput = static_cast<double>(acknowledgements) * 1000.0 / elapsedMs;
        std::cout << "PASS: " << (paced ? "high-resolution paced" : "offline-burst")
                  << " VST3 shared-memory transport probe\n";
        const uint32_t eventPackets = midiInstrument ? (kBlockCount / 8) * 2 : 0;
        std::cout << "  plugin=" << (midiInstrument ? "Unbox Test MIDI Synth" : "Unbox Test Delay")
                  << "; mode=" << (paced ? "realtime" : "offline")
                  << "; blocks=" << acknowledgements
                  << "; format=48000 Hz / 128 frames / stereo; ring=" << kSlotCount << " slots\n";
        if (midiInstrument)
            std::cout << "  timestamped MIDI note events=" << eventPackets / 2 << " note-on + "
                      << eventPackets / 2 << " note-off; sample offsets vary by phrase\n";
        std::cout << "  latency ms p50=" << percentile(0.50) << " p95=" << percentile(0.95)
                  << " p99=" << percentile(0.99) << " max=" << roundTripMs.back() << "\n";
        std::cout << "  throughput=" << throughput << " blocks/s ("
                  << throughput / (1000.0 / kPeriodMs) << "x nominal); checksum=" << checksum << "\n";
        if (paced)
            std::cout << "  timer=" << (highResolutionTimer ? "high-resolution" : "standard fallback")
                      << "; one-block response deadline misses=" << deadlineMisses
                      << "; producer late >1ms=" << lateSchedules << "/" << kBlockCount
                      << "; maximum schedule lateness=" << maxScheduleLateness << " ms\n";
        std::cout << "  peak outstanding=" << maxInFlight << "/" << kSlotCount
                  << "; ring backpressure waits=" << ringBackpressureWaits
                  << "; scope=project-owned VST3 in an isolated native process; no audio device, Electron or DAW callback\n";
        exitCode = 0;
      } while (false);
    } catch (const std::exception& error) {
        std::cerr << "VST3 shared-memory transport probe failed: " << error.what() << '\n';
        exitCode = 1;
    }

    if (region) {
        InterlockedExchange(&region->shutdown, 1);
        if (workEvent) SetEvent(workEvent);
    }
    if (processStarted) {
        const DWORD workerExit = WaitForSingleObject(process.hProcess, 10'000);
        if (workerExit != WAIT_OBJECT_0) {
            TerminateProcess(process.hProcess, 17);
            WaitForSingleObject(process.hProcess, 5000);
            if (exitCode == 0) exitCode = 1;
        }
        DWORD childCode = 0;
        if (GetExitCodeProcess(process.hProcess, &childCode) && childCode != 0 && exitCode == 0)
            exitCode = 1;
        CloseHandle(process.hThread);
        CloseHandle(process.hProcess);
    }
    if (timer) CloseHandle(timer);
    if (workEvent) CloseHandle(workEvent);
    if (outputEvent) CloseHandle(outputEvent);
    if (region) UnmapViewOfFile(region);
    if (mapping) CloseHandle(mapping);
    return exitCode;
}

} // namespace

int wmain(int argc, wchar_t* argv[])
{
    if (argc == 6 && std::wstring(argv[1]) == L"--worker")
        return workerMain(argv[2], argv[3], argv[4], argv[5]);
    if (argc != 3) {
        std::cerr << "Usage: unbox-vst3-shared-memory-host <project-owned .vst3 bundle> "
            "--paced|--burst|--midi-paced|--midi-burst\n";
        return 2;
    }
    const std::wstring mode = argv[2];
    const bool midiInstrument = mode == L"--midi-paced" || mode == L"--midi-burst";
    const bool paced = mode == L"--paced" || mode == L"--midi-paced";
    if (!paced && mode != L"--burst" && mode != L"--midi-burst") {
        std::cerr << "Unknown shared-memory transport mode.\n";
        return 2;
    }
    try {
        return parentMain(std::filesystem::path(argv[1]), paced, midiInstrument);
    } catch (const std::exception& error) {
        std::cerr << "VST3 shared-memory transport probe failed: " << error.what() << '\n';
        return 1;
    }
}
