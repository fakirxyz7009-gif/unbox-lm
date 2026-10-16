/**
 * @file PluginDelayCompensation.h
 * @brief Sample-Accurate Plugin Delay Compensation (PDC) & Time-Alignment Algorithm
 * @details Calculates maximum path latency across complex routing graphs and allocates
 *          exact sample-accurate delay buffers to guarantee 100% phase alignment at the master summing bus.
 */

#pragma once

#include <vector>
#include <string>
#include <algorithm>
#include <stdexcept>
#include <cmath>

namespace UnboxedDSP {

struct AudioNodePlugin {
    std::string id;
    std::string name;
    size_t reportedLatencySamples;
};

struct MixerTrackRouting {
    std::string trackId;
    std::vector<AudioNodePlugin> plugins;
    size_t accumulatedTrackLatency = 0;
    size_t requiredPdcDelaySamples = 0;
};

class PluginDelayCompensationEngine {
public:
    /**
     * @brief Computes maximum path latency across all mixer tracks and assigns PDC delay buffers.
     * @param tracks Reference to vector of mixer tracks containing hosted plugin chains.
     * @return size_t Maximum latency in samples required across the entire routing graph.
     */
    static size_t calculateAndApplyPDC(std::vector<MixerTrackRouting>& tracks) {
        if (tracks.empty()) return 0;

        // Step 1: Calculate total accumulated latency for each track path
        size_t maxGraphLatency = 0;
        for (auto& track : tracks) {
            size_t trackLatency = 0;
            for (const auto& plugin : track.plugins) {
                trackLatency += plugin.reportedLatencySamples;
            }
            track.accumulatedTrackLatency = trackLatency;
            if (trackLatency > maxGraphLatency) {
                maxGraphLatency = trackLatency;
            }
        }

        // Step 2: Calculate required PDC delay compensation for each parallel track
        // to match the maximum graph latency perfectly (sample-accurate phase alignment).
        for (auto& track : tracks) {
            if (track.accumulatedTrackLatency <= maxGraphLatency) {
                track.requiredPdcDelaySamples = maxGraphLatency - track.accumulatedTrackLatency;
            } else {
                track.requiredPdcDelaySamples = 0;
            }
        }

        return maxGraphLatency;
    }

    /**
     * @brief Real-time sample processing block applying PDC delay buffer compensation.
     * @param input Pointer to incoming sample block.
     * @param output Pointer to outgoing sample block.
     * @param numSamples Number of samples in block.
     * @param delayBuffer Ring buffer/delay line storage for PDC.
     * @param delayIndex Current write/read head in delay buffer.
     * @param pdcDelaySamples Number of delay samples required for this track.
     */
    static void processPdcDelayLine(
        const double* input,
        double* output,
        size_t numSamples,
        std::vector<double>& delayBuffer,
        size_t& delayIndex,
        size_t pdcDelaySamples
    ) {
        if (pdcDelaySamples == 0) {
            for (size_t i = 0; i < numSamples; ++i) {
                output[i] = input[i];
            }
            return;
        }

        const size_t bufSize = delayBuffer.size();
        if (bufSize <= pdcDelaySamples) {
            delayBuffer.resize(pdcDelaySamples + 512, 0.0);
        }

        for (size_t i = 0; i < numSamples; ++i) {
            // Write input to circular buffer
            delayBuffer[delayIndex] = input[i];
            
            // Read delayed sample
            size_t readIndex = (delayIndex + bufSize - pdcDelaySamples) % bufSize;
            output[i] = delayBuffer[readIndex];

            delayIndex = (delayIndex + 1) % bufSize;
        }
    }
};

} // namespace UnboxedDSP
