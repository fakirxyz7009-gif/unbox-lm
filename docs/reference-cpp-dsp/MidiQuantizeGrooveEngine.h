/**
 * @file MidiQuantizeGrooveEngine.h
 * @brief MIDI Quantization, Swing/Shuffle Groove & Humanization Processing Engine
 * @details Quantizes raw MIDI notes to grid intervals (1/4 to 1/256), applies swing offset
 *          to alternate sub-divisions, and introduces bell-curve randomized humanization.
 */

#pragma once

#include <vector>
#include <random>
#include <cmath>
#include <algorithm>

namespace UnboxedDSP {

enum class QuantizeGridResolution {
    QuarterNote = 960,       // 1/4
    EighthNote = 480,        // 1/8
    SixteenthNote = 240,     // 1/16
    ThirtySecondNote = 120,  // 1/32
    SixtyFourthNote = 60,    // 1/64
    OneTwentyEighth = 30,    // 1/128
    TwoFiftySixth = 15       // 1/256
};

struct MidiNoteRaw {
    int pitch;
    int velocity;
    int64_t startTick;
    int64_t durationTick;
};

struct QuantizeGrooveSettings {
    QuantizeGridResolution grid = QuantizeGridResolution::SixteenthNote;
    double quantizeAmount = 1.0;  // 0.0 to 1.0 (strength)
    double swingPercentage = 50.0; // 50% (none) to 75% (heavy swing)
    double humanizeTickOffset = 5.0; // Max tick jitter
    double humanizeVelocityOffset = 4.0; // Max velocity jitter
};

class MidiQuantizeGrooveEngine {
private:
    std::mt19937 rng_{42};

    double getNormalRandom(double mean, double stddev) {
        std::normal_distribution<double> dist(mean, stddev);
        return dist(rng_);
    }

public:
    MidiQuantizeGrooveEngine() = default;

    /**
     * @brief Applies grid quantization, swing groove, and bell-curve humanization to raw MIDI notes.
     * @param notes Input array of raw MIDI notes.
     * @param settings Quantization, swing, and humanization configuration settings.
     * @return std::vector<MidiNoteRaw> Processed MIDI notes.
     */
    std::vector<MidiNoteRaw> processMidiNotes(
        const std::vector<MidiNoteRaw>& notes,
        const QuantizeGrooveSettings& settings
    ) {
        std::vector<MidiNoteRaw> processedNotes = notes;
        int64_t gridSize = static_cast<int64_t>(settings.grid);

        for (auto& note : processedNotes) {
            // Step 1: Standard grid quantization
            int64_t remainder = note.startTick % gridSize;
            int64_t quantizedTick = (remainder < gridSize / 2) ? 
                (note.startTick - remainder) : 
                (note.startTick + (gridSize - remainder));

            // Step 2: Swing / Shuffle modification (shifts every alternate sub-division forward)
            // Swing applies to 16th/8th subdivisions where alternate grid points are delayed by swing percentage
            if (settings.swingPercentage > 50.0 && gridSize <= 480) {
                int64_t subdivisionIndex = quantizedTick / gridSize;
                if (subdivisionIndex % 2 != 0) {
                    double swingFactor = (settings.swingPercentage - 50.0) / 50.0; // 0.0 to 0.5
                    quantizedTick += static_cast<int64_t>(gridSize * swingFactor * 0.5);
                }
            }

            // Blend between original start tick and quantized/swung tick based on amount [0.0, 1.0]
            double blendedTick = static_cast<double>(note.startTick) * (1.0 - settings.quantizeAmount) +
                                 static_cast<double>(quantizedTick) * settings.quantizeAmount;

            int64_t finalTick = static_cast<int64_t>(std::round(blendedTick));

            // Step 3: Humanization factor (bell-curve randomized micro-tick offset & velocity jitter)
            if (settings.humanizeTickOffset > 0.0 || settings.humanizeVelocityOffset > 0.0) {
                double tickJitter = getNormalRandom(0.0, settings.humanizeTickOffset * 0.5);
                double velJitter = getNormalRandom(0.0, settings.humanizeVelocityOffset * 0.5);

                finalTick += static_cast<int64_t>(std::round(tickJitter));
                finalTick = std::max(int64_t(0), finalTick);

                int newVel = note.velocity + static_cast<int>(std::round(velJitter));
                note.velocity = std::clamp(newVel, 1, 127);
            }

            note.startTick = finalTick;
        }

        return processedNotes;
    }
};

} // namespace UnboxedDSP
