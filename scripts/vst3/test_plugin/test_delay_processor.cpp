#include "test_delay_processor.h"
#include "pluginterfaces/base/ibstream.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <limits>
#include <new>

namespace Steinberg::Vst {
namespace {

constexpr std::array<uint8_t, 4> kStateMagic{{'U', 'B', 'X', 'D'}};
constexpr uint32_t kStateVersion = 1;
constexpr std::size_t kStateSize = 12;
static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559,
              "The fixture state format requires IEEE-754 binary32.");

bool streamSucceeded(tresult result)
{
    return result == kResultOk || result == kResultTrue;
}

bool readExact(IBStream& stream, uint8_t* destination, std::size_t size)
{
    std::size_t offset = 0;
    while (offset < size)
    {
        int32 bytesRead = 0;
        const auto requested = static_cast<int32>(size - offset);
        if (!streamSucceeded(stream.read(destination + offset, requested, &bytesRead)) ||
            bytesRead <= 0 || bytesRead > requested)
            return false;
        offset += static_cast<std::size_t>(bytesRead);
    }
    return true;
}

bool writeExact(IBStream& stream, uint8_t* source, std::size_t size)
{
    std::size_t offset = 0;
    while (offset < size)
    {
        int32 bytesWritten = 0;
        const auto requested = static_cast<int32>(size - offset);
        if (!streamSucceeded(stream.write(source + offset, requested, &bytesWritten)) ||
            bytesWritten <= 0 || bytesWritten > requested)
            return false;
        offset += static_cast<std::size_t>(bytesWritten);
    }
    return true;
}

void writeU32LE(uint8_t* destination, uint32_t value)
{
    for (std::size_t index = 0; index < 4; ++index)
        destination[index] = static_cast<uint8_t>((value >> (index * 8U)) & 0xffU);
}

uint32_t readU32LE(const uint8_t* source)
{
    uint32_t value = 0;
    for (std::size_t index = 0; index < 4; ++index)
        value |= static_cast<uint32_t>(source[index]) << (index * 8U);
    return value;
}

} // namespace

UnboxTestDelayProcessor::UnboxTestDelayProcessor()
{
    setControllerClass(FUID::fromTUID(kUnboxTestDelayControllerUID));
}

tresult PLUGIN_API UnboxTestDelayProcessor::initialize(FUnknown* context)
{
    const auto result = AudioEffect::initialize(context);
    if (result == kResultTrue || result == kResultOk)
    {
        addAudioInput(STR16("Input"), SpeakerArr::kStereo);
        addAudioOutput(STR16("Output"), SpeakerArr::kStereo);
    }
    return result;
}

tresult PLUGIN_API UnboxTestDelayProcessor::setBusArrangements(
    SpeakerArrangement* inputs,
    int32 numInputs,
    SpeakerArrangement* outputs,
    int32 numOutputs)
{
    if (numInputs != 1 || numOutputs != 1 || inputs[0] != SpeakerArr::kStereo ||
        outputs[0] != SpeakerArr::kStereo)
        return kResultFalse;

    return AudioEffect::setBusArrangements(inputs, numInputs, outputs, numOutputs);
}

tresult PLUGIN_API UnboxTestDelayProcessor::setupProcessing(ProcessSetup& setup)
{
    if (!std::isfinite(setup.sampleRate) || setup.sampleRate < 1.0 || setup.sampleRate > 10000000.0)
        return kResultFalse;

    const auto frames = std::llround(setup.sampleRate);
    if (frames <= 0 || static_cast<unsigned long long>(frames) >
            static_cast<unsigned long long>(std::numeric_limits<std::size_t>::max()))
        return kResultFalse;

    const auto result = AudioEffect::setupProcessing(setup);
    if (result != kResultOk && result != kResultTrue)
        return result;

    try
    {
        delayBuffer.assign(static_cast<std::size_t>(frames), {0.0F, 0.0F});
    }
    catch (const std::bad_alloc&)
    {
        delayBuffer.clear();
        return kOutOfMemory;
    }
    writeFrame = 0;
    return result;
}

tresult PLUGIN_API UnboxTestDelayProcessor::setActive(TBool state)
{
    if (state)
    {
        std::fill(delayBuffer.begin(), delayBuffer.end(), std::array<float, 2>{0.0F, 0.0F});
        writeFrame = 0;
    }
    return AudioEffect::setActive(state);
}

tresult PLUGIN_API UnboxTestDelayProcessor::setProcessing(TBool state)
{
    (void)state;
    return kResultOk;
}

tresult PLUGIN_API UnboxTestDelayProcessor::setState(IBStream* state)
{
    if (state == nullptr)
        return kInvalidArgument;

    std::array<uint8_t, kStateSize> bytes{};
    if (!readExact(*state, bytes.data(), bytes.size()) ||
        !std::equal(kStateMagic.begin(), kStateMagic.end(), bytes.begin()) ||
        readU32LE(bytes.data() + 4) != kStateVersion)
        return kResultFalse;

    uint32_t gainBits = readU32LE(bytes.data() + 8);
    float gain = 0.0F;
    static_assert(sizeof(gain) == sizeof(gainBits));
    std::memcpy(&gain, &gainBits, sizeof(gain));
    if (!std::isfinite(gain) || gain < 0.0F || gain > 2.0F)
        return kResultFalse;

    outputGain.store(gain, std::memory_order_relaxed);
    return kResultOk;
}

tresult PLUGIN_API UnboxTestDelayProcessor::getState(IBStream* state)
{
    if (state == nullptr)
        return kInvalidArgument;

    const float gain = outputGain.load(std::memory_order_relaxed);
    if (!std::isfinite(gain) || gain < 0.0F || gain > 2.0F)
        return kResultFalse;

    std::array<uint8_t, kStateSize> bytes{};
    std::copy(kStateMagic.begin(), kStateMagic.end(), bytes.begin());
    writeU32LE(bytes.data() + 4, kStateVersion);
    uint32_t gainBits = 0;
    std::memcpy(&gainBits, &gain, sizeof(gainBits));
    writeU32LE(bytes.data() + 8, gainBits);
    return writeExact(*state, bytes.data(), bytes.size()) ? kResultOk : kResultFalse;
}

tresult PLUGIN_API UnboxTestDelayProcessor::process(ProcessData& data)
{
    if (data.numSamples <= 0)
        return kResultTrue;
    if (data.symbolicSampleSize != kSample32 || data.numInputs != 1 || data.numOutputs != 1 ||
        data.inputs == nullptr || data.outputs == nullptr ||
        data.inputs[0].channelBuffers32 == nullptr || data.outputs[0].channelBuffers32 == nullptr ||
        data.inputs[0].numChannels != 2 || data.outputs[0].numChannels != 2 ||
        data.inputs[0].channelBuffers32[0] == nullptr ||
        data.inputs[0].channelBuffers32[1] == nullptr ||
        data.outputs[0].channelBuffers32[0] == nullptr ||
        data.outputs[0].channelBuffers32[1] == nullptr || delayBuffer.empty())
        return kResultFalse;

    auto* inputLeft = data.inputs[0].channelBuffers32[0];
    auto* inputRight = data.inputs[0].channelBuffers32[1];
    auto* outputLeft = data.outputs[0].channelBuffers32[0];
    auto* outputRight = data.outputs[0].channelBuffers32[1];
    const float gain = outputGain.load(std::memory_order_relaxed);

    for (int32 sample = 0; sample < data.numSamples; ++sample)
    {
        outputLeft[sample] = delayBuffer[writeFrame][0] * gain;
        outputRight[sample] = delayBuffer[writeFrame][1] * gain;
        delayBuffer[writeFrame] = {inputLeft[sample], inputRight[sample]};
        writeFrame = (writeFrame + 1U) % delayBuffer.size();
    }

    return kResultTrue;
}

} // namespace Steinberg::Vst
