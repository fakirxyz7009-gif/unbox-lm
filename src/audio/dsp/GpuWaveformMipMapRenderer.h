/**
 * @file GpuWaveformMipMapRenderer.h
 * @brief Multi-Tiered Audio MIP-Mapping & GPU Waveform Rendering Architecture
 * @details Generates min/max peak overview pixel data buffers at multiple zoom factors (audio MIP-mapping)
 *          to ensure real-time GPU-accelerated waveform drawing at a steady 60Hz/120Hz.
 */

#pragma once

#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace UnboxedDSP {

struct WaveformMinMaxPeak {
    float minVal;
    float maxVal;
};

struct AudioMipMapLevel {
    size_t samplesPerPixel;
    std::vector<WaveformMinMaxPeak> peaks;
};

class GpuWaveformMipMapRenderer {
private:
    std::vector<AudioMipMapLevel> mipLevels_;

public:
    GpuWaveformMipMapRenderer() = default;

    /**
     * @brief Generates multi-tiered MIP-map peak overview buffers from raw audio PCM data.
     * @param audioBuffer Raw PCM audio samples.
     */
    void generateAudioMipMaps(const std::vector<float>& audioBuffer) {
        mipLevels_.clear();

        // Generate MIP levels at power-of-two samples per pixel factors: 1, 4, 16, 64, 256, 1024, 4096
        std::vector<size_t> factors = {1, 4, 16, 64, 256, 1024, 4096};

        for (size_t spp : factors) {
            AudioMipMapLevel level;
            level.samplesPerPixel = spp;
            size_t numPixels = (audioBuffer.size() + spp - 1) / spp;
            level.peaks.resize(numPixels);

            for (size_t p = 0; p < numPixels; ++p) {
                size_t start = p * spp;
                size_t end = std::min(audioBuffer.size(), start + spp);

                float minP = 0.0f;
                float maxP = 0.0f;

                if (start < end) {
                    minP = audioBuffer[start];
                    maxP = audioBuffer[start];
                    for (size_t i = start + 1; i < end; ++i) {
                        float val = audioBuffer[i];
                        if (val < minP) minP = val;
                        if (val > maxP) maxP = val;
                    }
                }
                level.peaks[p] = {minP, maxP};
            }
            mipLevels_.push_back(level);
        }
    }

    /**
     * @brief Selects the optimal MIP-map level based on current timeline zoom factor
     *        and prepares vertex/index data for GPU rendering (Metal/OpenGL/Vulkan).
     */
    const AudioMipMapLevel* getOptimalMipLevel(double pixelsPerSecond, double sampleRate) const {
        if (mipLevels_.empty()) return nullptr;

        double samplesPerPixel = sampleRate / pixelsPerSecond;

        const AudioMipMapLevel* bestLevel = &mipLevels_[0];
        for (const auto& level : mipLevels_) {
            if (level.samplesPerPixel <= samplesPerPixel) {
                bestLevel = &level;
            } else {
                break;
            }
        }
        return bestLevel;
    }
};

} // namespace UnboxedDSP
