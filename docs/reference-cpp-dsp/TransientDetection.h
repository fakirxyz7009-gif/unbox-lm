/**
 * @file TransientDetection.h
 * @brief Audio Transient Detection & Clip Slicing Algorithm
 * @details Analyzes raw PCM audio buffers using an adaptive envelope follower and first-order
 *          derivative energy deviation thresholds to output sample-accurate transient slice markers.
 */

#pragma once

#include <vector>
#include <cmath>
#include <algorithm>

namespace UnboxedDSP {

class TransientDetectorEngine {
public:
    /**
     * @brief Detects percussive attack transients and generates sample-accurate slice markers.
     * @param audioBuffer Pointer to raw PCM float audio samples.
     * @param numSamples Total number of audio samples in buffer.
     * @param sampleRate Audio sample rate (e.g., 44100 or 48000 Hz).
     * @param sensitivity Threshold sensitivity ranging from 0.0 (less sensitive) to 1.0 (highly sensitive).
     * @return std::vector<size_t> Array of absolute sample indices representing transient slice markers.
     */
    static std::vector<size_t> detectTransients(
        const float* audioBuffer,
        size_t numSamples,
        double sampleRate,
        double sensitivity
    ) {
        std::vector<size_t> sliceMarkers;
        if (!audioBuffer || numSamples == 0) return sliceMarkers;

        // Window size for envelope follower (approx 2.5ms window)
        const size_t windowSize = std::max(size_t(1), size_t(sampleRate * 0.0025));
        
        // Adaptive threshold scaling based on sensitivity [0.0, 1.0]
        // Higher sensitivity = lower threshold multiplier
        const double thresholdMultiplier = 1.5 - (std::clamp(sensitivity, 0.0, 1.0) * 0.8);
        const size_t minSamplesBetweenSlices = size_t(sampleRate * 0.05); // Minimum 50ms between slices

        std::vector<double> envelope(numSamples, 0.0);
        std::vector<double> flux(numSamples, 0.0);

        // Step 1: Calculate absolute envelope follower (RMS / Rectified moving average)
        double runningSum = 0.0;
        for (size_t i = 0; i < numSamples; ++i) {
            double sampleVal = std::abs(audioBuffer[i]);
            runningSum += sampleVal * sampleVal;
            if (i >= windowSize) {
                double oldVal = std::abs(audioBuffer[i - windowSize]);
                runningSum -= oldVal * oldVal;
            }
            envelope[i] = std::sqrt(std::max(0.0, runningSum / double(windowSize)));
        }

        // Step 2: Calculate first-order positive energy deviation (Spectral/Envelope Flux)
        for (size_t i = 1; i < numSamples; ++i) {
            double diff = envelope[i] - envelope[i - 1];
            flux[i] = (diff > 0.0) ? diff : 0.0;
        }

        // Step 3: Calculate local adaptive mean of flux
        const size_t localWindow = std::max(size_t(10), size_t(sampleRate * 0.05)); // 50ms local window
        double localSum = 0.0;
        for (size_t i = 0; i < std::min(numSamples, localWindow); ++i) {
            localSum += flux[i];
        }

        size_t lastSliceIndex = 0;
        for (size_t i = localWindow; i < numSamples - localWindow; ++i) {
            localSum += flux[i] - flux[i - localWindow];
            double adaptiveMean = localSum / double(localWindow);

            // Check if flux exceeds adaptive threshold
            if (flux[i] > adaptiveMean * thresholdMultiplier && flux[i] > 0.005) {
                if (i - lastSliceIndex >= minSamplesBetweenSlices) {
                    sliceMarkers.push_back(i);
                    lastSliceIndex = i;
                }
            }
        }

        return sliceMarkers;
    }
};

} // namespace UnboxedDSP
