/**
 * @file Ara2HostSubsystem.h
 * @brief ARA2 Host-Side Subsystem & Direct Audio Region Editing Engine
 * @details Implements ARA2 host endpoints allowing external plugins (e.g., Melodyne, RX)
 *          to directly access raw audio file cache buffers and modify region pitch, timing, and spectrum.
 */

#pragma once

#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <algorithm>

namespace UnboxedDSP {

struct AraAudioRegionSource {
    std::string regionId;
    std::string filePath;
    int64_t sampleOffset;
    int64_t numSamples;
    double sampleRate;
    std::vector<float> audioBufferCache; // Raw audio file cache buffer
};

class Ara2HostSubsystem {
private:
    std::unordered_map<std::string, AraAudioRegionSource> regionSources_;

public:
    Ara2HostSubsystem() = default;

    /**
     * @brief Registers an audio region source so ARA plugins can access raw audio buffers directly.
     */
    void registerAudioRegion(const AraAudioRegionSource& source) {
        regionSources_[source.regionId] = source;
    }

    /**
     * @brief ARA2 Host Endpoint: Allows plugin to directly read raw audio file cache buffers from disk/RAM.
     */
    bool getAudioRegionData(const std::string& regionId, float* outBuffer, int64_t startSample, int64_t numSamples) {
        auto it = regionSources_.find(regionId);
        if (it == regionSources_.end()) return false;

        const auto& source = it->second;
        if (startSample >= source.numSamples) return false;

        int64_t copyLen = std::min(numSamples, source.numSamples - startSample);
        for (int64_t i = 0; i < copyLen; ++i) {
            outBuffer[i] = source.audioBufferCache[startSample + i];
        }
        return true;
    }

    /**
     * @brief ARA2 Host Endpoint: Receives pitch, timing, and spectral modifications from ARA plugin
     *        and updates the DAW's audio playback buffer arrays seamlessly.
     */
    bool updateRegionPlaybackBuffer(const std::string& regionId, const std::vector<float>& modifiedBuffer) {
        auto it = regionSources_.find(regionId);
        if (it == regionSources_.end()) return false;

        it->second.audioBufferCache = modifiedBuffer;
        it->second.numSamples = static_cast<int64_t>(modifiedBuffer.size());
        return true;
    }
};

} // namespace UnboxedDSP
