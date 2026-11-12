/**
 * @file SidechainCompressor.h
 * @brief Professional Compressor/Limiter with Secondary Sidechain Input & Peak/RMS Detection
 * @details Implements adjustable Threshold, Ratio, Attack, Release, Peak/RMS detection modes,
 *          and sidechain-driven gain reduction applied to primary stereo audio channels.
 */

#pragma once

#include <cmath>
#include <algorithm>
#include <vector>

namespace UnboxedDSP {

enum class DetectionMode {
    Peak,
    RMS
};

struct CompressorSettings {
    double thresholdDb = -20.0;
    double ratio = 4.0; // 1.0 to infinity (limiter)
    double attackMs = 10.0; // 0.1 to 400.0 ms
    double releaseMs = 100.0; // 1.0 to 5000.0 ms
    double makeupGainDb = 0.0;
    DetectionMode mode = DetectionMode::Peak;
    double rmsWindowMs = 25.0;
};

class SidechainCompressor {
private:
    CompressorSettings settings_;
    double sampleRate_;
    double envelope_ = 0.0;
    std::vector<double> rmsBuffer_;
    size_t rmsIndex_ = 0;

    double dbToAmp(double db) {
        return std::pow(10.0, db / 20.0);
    }

    double ampToDb(double amp) {
        return 20.0 * std::log10(std::max(1e-12, amp));
    }

public:
    explicit SidechainCompressor(double sampleRate = 48000.0) : sampleRate_(sampleRate) {
        size_t rmsWindowSamples = std::max(size_t(1), size_t(sampleRate * 0.025));
        rmsBuffer_.resize(rmsWindowSamples, 0.0);
    }

    void setSettings(const CompressorSettings& settings) {
        settings_ = settings;
    }

    /**
     * @brief Processes a stereo audio block with sidechain-driven compression.
     * @param primaryLeft Primary left audio channel input/output.
     * @param primaryRight Primary right audio channel input/output.
     * @param sidechainInput Auxiliary sidechain input channel array controlling detection.
     * @param numSamples Number of samples in block.
     */
    void processBlock(
        double* primaryLeft,
        double* primaryRight,
        const double* sidechainInput,
        size_t numSamples
    ) {
        double attackCoeff = std::exp(-1.0 / (sampleRate_ * (settings_.attackMs * 0.001)));
        double releaseCoeff = std::exp(-1.0 / (sampleRate_ * (settings_.releaseMs * 0.001)));
        double thresholdAmp = dbToAmp(settings_.thresholdDb);
        double makeupAmp = dbToAmp(settings_.makeupGainDb);

        for (size_t i = 0; i < numSamples; ++i) {
            // Step 1: Extract sidechain detection amplitude
            double scSample = std::abs(sidechainInput[i]);
            double detectorInput = 0.0;

            if (settings_.mode == DetectionMode::Peak) {
                detectorInput = scSample;
            } else {
                // RMS Detection
                rmsBuffer_[rmsIndex_] = scSample * scSample;
                rmsIndex_ = (rmsIndex_ + 1) % rmsBuffer_.size();
                double sum = 0.0;
                for (double val : rmsBuffer_) sum += val;
                detectorInput = std::sqrt(sum / double(rmsBuffer_.size()));
            }

            // Step 2: Envelope follower (Attack / Release smoothing)
            if (detectorInput > envelope_) {
                envelope_ = attackCoeff * envelope_ + (1.0 - attackCoeff) * detectorInput;
            } else {
                envelope_ = releaseCoeff * envelope_ + (1.0 - releaseCoeff) * detectorInput;
            }

            // Step 3: Static characteristic / compression curve calculation (dB domain)
            double envDb = ampToDb(envelope_);
            double overDb = envDb - settings_.thresholdDb;
            double gainReductionDb = 0.0;

            if (overDb > 0.0) {
                // Ratio calculation (infinity = limiter)
                double effectiveRatio = (settings_.ratio >= 100.0) ? 1000.0 : settings_.ratio;
                gainReductionDb = overDb * (1.0 - (1.0 / effectiveRatio));
            }

            // Step 4: Convert gain reduction dB to linear amplitude multiplier
            double attenuationAmp = dbToAmp(-gainReductionDb) * makeupAmp;

            // Step 5: Apply attenuation curve to primary stereo audio channels
            primaryLeft[i] *= attenuationAmp;
            primaryRight[i] *= attenuationAmp;
        }
    }
};

} // namespace UnboxedDSP
