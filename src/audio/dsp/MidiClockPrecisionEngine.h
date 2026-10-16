/**
 * @file MidiClockPrecisionEngine.h
 * @brief Ultra-Precise 960 PPQN Sequencer MIDI Clock & Sub-Sample Event Evaluator
 * @details Translates 960 PPQN ticks and fractional BPM tempos into exact sub-sample offsets
 *          for jitter-free VST/Instrument event triggering inside audio buffer slices.
 */

#pragma once

#include <vector>
#include <cstdint>
#include <algorithm>
#include <cmath>

namespace UnboxedDSP {

constexpr double kPPQN = 960.0;

struct TimedMidiEvent {
    int64_t tickPosition; // Absolute 960 PPQN tick
    int noteNumber;
    int velocity;
    bool isNoteOn;
};

struct ScheduledSampleEvent {
    size_t sampleOffset; // Sub-sample offset within current audio block [0 to blockSize-1]
    int noteNumber;
    int velocity;
    bool isNoteOn;
};

class MidiClockPrecisionEngine {
private:
    double bpm_ = 124.0;
    double sampleRate_ = 48000.0;
    double currentTickPosition_ = 0.0;

public:
    MidiClockPrecisionEngine(double bpm = 124.0, double sampleRate = 48000.0)
        : bpm_(std::clamp(bpm, 1.00, 999.99)), sampleRate_(sampleRate) {}

    void setBpm(double bpm) {
        bpm_ = std::clamp(bpm, 1.00, 999.99);
    }

    void setSampleRate(double sampleRate) {
        sampleRate_ = sampleRate;
    }

    /**
     * @brief Converts PPQN ticks to exact time in seconds relative to current BPM.
     */
    double ticksToSeconds(double ticks) const {
        // 60 seconds / (BPM * PPQN) = seconds per tick
        return ticks * (60.0 / (bpm_ * kPPQN));
    }

    /**
     * @brief Evaluates incoming MIDI events and extracts those falling within the current audio block frame slice.
     * @param events List of all project MIDI events sorted by tick position.
     * @param startTick Start tick of the current audio buffer slice.
     * @param endTick End tick of the current audio buffer slice.
     * @return std::vector<ScheduledSampleEvent> Events mapped with exact sub-sample offsets.
     */
    std::vector<ScheduledSampleEvent> evaluateBufferSliceEvents(
        const std::vector<TimedMidiEvent>& events,
        double startTick,
        double endTick,
        size_t blockSize
    ) {
        std::vector<ScheduledSampleEvent> scheduledEvents;
        if (events.empty() || blockSize == 0) return scheduledEvents;

        double blockStartTimeSec = ticksToSeconds(startTick);

        for (const auto& ev : events) {
            if (ev.tickPosition >= startTick && ev.tickPosition < endTick) {
                double eventTimeSec = ticksToSeconds(static_cast<double>(ev.tickPosition));
                double timeOffsetSec = eventTimeSec - blockStartTimeSec;
                
                // Convert time offset to exact sub-sample offset
                double exactSampleOffset = timeOffsetSec * sampleRate_;
                size_t clampedSampleOffset = std::min(blockSize - 1, static_cast<size_t>(std::max(0.0, std::round(exactSampleOffset))));

                scheduledEvents.push_back({
                    clampedSampleOffset,
                    ev.noteNumber,
                    ev.velocity,
                    ev.isNoteOn
                });
            }
        }

        return scheduledEvents;
    }
};

} // namespace UnboxedDSP
