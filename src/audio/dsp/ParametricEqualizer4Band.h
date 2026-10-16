/**
 * @file ParametricEqualizer4Band.h
 * @brief 4-Band Parametric Equalizer Using Digital Biquad Filter Direct Form II Equations
 * @details Implements Low Shelf, High Shelf, and two Peak/Notch Mid Bands with dynamic real-time
 *          coefficient calculation and 1-pole smoothing interpolation (lambda = 0.999) to prevent clicking.
 */

#pragma once

#include <cmath>
#include <algorithm>

namespace UnboxedDSP {

enum class FilterType {
    LowShelf,
    PeakMid1,
    PeakMid2,
    HighShelf
};

struct EqBandParameters {
    FilterType type;
    double frequency; // 20.0 to 20000.0 Hz
    double qFactor;   // 0.1 to 18.0
    double gainDb;    // -18.0 to +18.0 dB
};

class BiquadDirectFormII {
private:
    double b0_ = 1.0, b1_ = 0.0, b2_ = 0.0;
    double a1_ = 0.0, a2_ = 0.0;
    double s1_ = 0.0, s2_ = 0.0; // Delay states

    // Smoothed parameters
    double currentFreq_ = 1000.0;
    double currentQ_ = 1.0;
    double currentGainDb_ = 0.0;
    const double lambda_ = 0.999; // Smoothing coefficient

public:
    BiquadDirectFormII() = default;

    void updateCoefficients(const EqBandParameters& params, double sampleRate) {
        // Smooth parameters to prevent clicking artifacts (1-pole smoothing filter)
        currentFreq_ = currentFreq_ * lambda_ + params.frequency * (1.0 - lambda_);
        currentQ_ = currentQ_ * lambda_ + params.qFactor * (1.0 - lambda_);
        currentGainDb_ = currentGainDb_ * lambda_ + params.gainDb * (1.0 - lambda_);

        double omega = 2.0 * M_PI * currentFreq_ / sampleRate;
        double sn = std::sin(omega);
        double cs = std::cos(omega);
        double alpha = sn / (2.0 * std::max(0.1, currentQ_));
        double A = std::pow(10.0, currentGainDb_ / 40.0);

        double b0 = 1.0, b1 = 0.0, b2 = 0.0, a0 = 1.0, a1 = 0.0, a2 = 0.0;

        switch (params.type) {
            case FilterType::LowShelf: {
                double rootA = std::sqrt(A);
                b0 = A * ((A + 1.0) - (A - 1.0) * cs + 2.0 * rootA * alpha);
                b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cs);
                b2 = A * ((A + 1.0) - (A - 1.0) * cs - 2.0 * rootA * alpha);
                a0 = (A + 1.0) + (A - 1.0) * cs + 2.0 * rootA * alpha;
                a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cs);
                a2 = (A + 1.0) + (A - 1.0) * cs - 2.0 * rootA * alpha;
                break;
            }
            case FilterType::PeakMid1:
            case FilterType::PeakMid2: {
                b0 = 1.0 + alpha * A;
                b1 = -2.0 * cs;
                b2 = 1.0 - alpha * A;
                a0 = 1.0 + alpha / A;
                a1 = -2.0 * cs;
                a2 = 1.0 - alpha / A;
                break;
            }
            case FilterType::HighShelf: {
                double rootA = std::sqrt(A);
                b0 = A * ((A + 1.0) + (A - 1.0) * cs + 2.0 * rootA * alpha);
                b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cs);
                b2 = A * ((A + 1.0) + (A - 1.0) * cs - 2.0 * rootA * alpha);
                a0 = (A + 1.0) - (A - 1.0) * cs + 2.0 * rootA * alpha;
                a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cs);
                a2 = (A + 1.0) - (A - 1.0) * cs - 2.0 * rootA * alpha;
                break;
            }
        }

        // Normalize biquad coefficients by a0
        b0_ = b0 / a0;
        b1_ = b1 / a0;
        b2_ = b2 / a0;
        a1_ = a1 / a0;
        a2_ = a2 / a0;
    }

    /**
     * @brief Processes a single audio sample using Direct Form II biquad difference equations.
     */
    double processSample(double input) {
        // Direct Form II realization
        double w = input - a1_ * s1_ - a2_ * s2_;
        double output = b0_ * w + b1_ * s1_ + b2_ * s2_;

        // Update delay states
        s2_ = s1_;
        s1_ = w;

        return output;
    }
};

class ParametricEqualizer4Band {
private:
    std::array<BiquadDirectFormII, 4> bands_;
    double sampleRate_;

public:
    explicit ParametricEqualizer4Band(double sampleRate = 48000.0) : sampleRate_(sampleRate) {
        bands_[0].updateCoefficients({FilterType::LowShelf, 100.0, 0.707, 0.0}, sampleRate_);
        bands_[1].updateCoefficients({FilterType::PeakMid1, 800.0, 1.4, 0.0}, sampleRate_);
        bands_[2].updateCoefficients({FilterType::PeakMid2, 3500.0, 1.4, 0.0}, sampleRate_);
        bands_[3].updateCoefficients({FilterType::HighShelf, 10000.0, 0.707, 0.0}, sampleRate_);
    }

    void setBandParameters(size_t bandIndex, const EqBandParameters& params) {
        if (bandIndex < 4) {
            bands_[bandIndex].updateCoefficients(params, sampleRate_);
        }
    }

    void processBlock(const double* input, double* output, size_t numSamples) {
        for (size_t i = 0; i < numSamples; ++i) {
            double sample = input[i];
            for (auto& band : bands_) {
                sample = band.processSample(sample);
            }
            output[i] = sample;
        }
    }
};

} // namespace UnboxedDSP
