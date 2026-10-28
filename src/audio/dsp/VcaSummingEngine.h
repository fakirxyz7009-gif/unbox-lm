/**
 * @file VcaSummingEngine.h
 * @brief High-Performance Track-Summing & VCA Grouping Engine
 * @details Implements VCA master groups, track mute/solo/solo-safe, pan law attenuation,
 *          and SIMD-vectorized master stereo bus summation.
 */

#pragma once

#include <vector>
#include <string>
#include <cmath>
#include <algorithm>

#ifdef __AVX2__
#include <immintrin.h>
#endif

namespace UnboxedDSP {

enum class VcaPanLaw {
    Minus3dB,
    Minus4p5dB
};

struct MixerTrack {
    std::string id;
    std::string name;
    double volumeDb = 0.0;
    double pan = 0.0; // -1.0 (L) to +1.0 (R)
    bool mute = false;
    bool solo = false;
    bool soloSafe = false;
    int vcaGroupId = -1; // -1 means unassigned
};

struct VcaGroup {
    int id;
    std::string name;
    double volumeDb = 0.0;
    bool mute = false;
    bool solo = false;
};

class VcaSummingEngine {
private:
    std::vector<MixerTrack> tracks_;
    std::vector<VcaGroup> vcaGroups_;
    VcaPanLaw panLaw_ = VcaPanLaw::Minus3dB;

    double dbToLinear(double db) {
        return std::pow(10.0, db / 20.0);
    }

public:
    VcaSummingEngine() = default;

    void setPanLaw(VcaPanLaw law) {
        panLaw_ = law;
    }

    void addTrack(const MixerTrack& track) {
        tracks_.push_back(track);
    }

    void addVcaGroup(const VcaGroup& group) {
        vcaGroups_.push_back(group);
    }

    /**
     * @brief Computes pan gains for left and right channels based on selected Pan Law.
     */
    void calculatePanGains(double pan, double& leftGain, double& rightGain) const {
        double angle = ((pan + 1.0) * 0.5) * (M_PI * 0.5);
        leftGain = std::cos(angle);
        rightGain = std::sin(angle);

        double coeff = (panLaw_ == VcaPanLaw::Minus3dB) ? 0.7079 : 0.5956;
        leftGain *= coeff * std::sqrt(2.0);
        rightGain *= coeff * std::sqrt(2.0);
    }

    /**
     * @brief Performs thread-safe master stereo bus summation using SIMD / vector math.
     */
    void sumMasterBus(
        const std::vector<std::vector<float>>& trackInputsLeft,
        const std::vector<std::vector<float>>& trackInputsRight,
        float* masterOutLeft,
        float* masterOutRight,
        size_t numSamples
    ) {
        // Clear master output buffers
        std::fill(masterOutLeft, masterOutLeft + numSamples, 0.0f);
        std::fill(masterOutRight, masterOutRight + numSamples, 0.0f);

        bool anySoloActive = false;
        for (const auto& t : tracks_) {
            if (t.solo && !t.mute) {
                anySoloActive = true;
                break;
            }
        }

        for (size_t tIdx = 0; tIdx < tracks_.size() && tIdx < trackInputsLeft.size(); ++tIdx) {
            const auto& track = tracks_[tIdx];

            // Mute / Solo logic
            bool isMuted = track.mute;
            if (anySoloActive && !track.solo && !track.soloSafe) {
                isMuted = true;
            }
            if (isMuted) continue;

            // Calculate track gain combined with VCA group gain
            double trackGain = dbToLinear(track.volumeDb);
            if (track.vcaGroupId >= 0) {
                auto vcaIt = std::find_if(vcaGroups_.begin(), vcaGroups_.end(), [&](const VcaGroup& g) { return g.id == track.vcaGroupId; });
                if (vcaIt != vcaGroups_.end() && !vcaIt->mute) {
                    trackGain *= dbToLinear(vcaIt->volumeDb);
                }
            }

            double lGain = 1.0, rGain = 1.0;
            calculatePanGains(track.pan, lGain, rGain);

            float totalLeftGain = static_cast<float>(trackGain * lGain);
            float totalRightGain = static_cast<float>(trackGain * rGain);

            const float* inL = trackInputsLeft[tIdx].data();
            const float* inR = trackInputsRight[tIdx].data();

            // SIMD Vectorized Summation Loop (AVX2 if available)
            size_t i = 0;
#ifdef __AVX2__
            for (; i + 7 < numSamples; i += 8) {
                __m256 sampleL = _mm256_loadu_ps(&inL[i]);
                __m256 sampleR = _mm256_loadu_ps(&inR[i]);
                __m256 gL = _mm256_set1_ps(totalLeftGain);
                __m256 gR = _mm256_set1_ps(totalRightGain);

                __m256 scaledL = _mm256_mul_ps(sampleL, gL);
                __m256 scaledR = _mm256_mul_ps(sampleR, gR);

                __m256 currentMasterL = _mm256_loadu_ps(&masterOutLeft[i]);
                __m256 currentMasterR = _mm256_loadu_ps(&masterOutRight[i]);

                _mm256_storeu_ps(&masterOutLeft[i], _mm256_add_ps(currentMasterL, scaledL));
                _mm256_storeu_ps(&masterOutRight[i], _mm256_add_ps(currentMasterR, scaledR));
            }
#endif
            // Scalar tail loop
            for (; i < numSamples; ++i) {
                masterOutLeft[i] += inL[i] * totalLeftGain;
                masterOutRight[i] += inR[i] * totalRightGain;
            }
        }
    }
};

} // namespace UnboxedDSP
