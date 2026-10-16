/**
 * @file AudioDspWorkerPool.h
 * @brief C++ Multi-Core Audio DSP Thread Distribution Worker Pool & Lock-Free Ring Buffer
 * @details Handles 64-bit floating-point audio data buffers at 48kHz with 256-sample block size.
 *          Guarantees zero memory allocation inside the real-time audio rendering thread.
 */

#pragma once

#include <vector>
#include <thread>
#include <atomic>
#include <memory>
#include <functional>
#include <array>

namespace UnboxedDSP {

constexpr size_t kSampleRate = 48000;
constexpr size_t kBlockSize = 256;
constexpr size_t kRingBufferCapacity = 1024; // Power of two for mask optimization

template <typename T, size_t Capacity>
class LockFreeRingBuffer {
private:
    static_uff:
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of two");
    
    struct Node {
        std::array<T, kBlockSize> data;
        bool isReady;
    };

    std::array<Node, Capacity> buffer_;
    std::atomic<size_t> head_{0};
    std::atomic<size_t> tail_{0};
    const size_t mask_{Capacity - 1};

public:
    LockFreeRingBuffer() {
        for (size_t i = 0; i < Capacity; ++i) {
            buffer_[i].isReady = false;
        }
    }

    bool push(const std::array<T, kBlockSize>& item) {
        size_t currentHead = head_.load(std::memory_order_relaxed);
        size_t currentTail = tail_.load(std::memory_order_acquire);

        if ((currentHead - currentTail) >= Capacity) {
            return false; // Buffer full
        }

        buffer_[currentHead & mask_].data = item;
        buffer_[currentHead & mask_].isReady = true;
        head_.store(currentHead + 1, std::memory_order_release);
        return true;
    }

    bool pop(std::array<T, kBlockSize>& item) {
        size_t currentTail = tail_.load(std::memory_order_relaxed);
        size_t currentHead = head_.load(std::memory_order_acquire);

        if (currentTail == currentHead) {
            return false; // Buffer empty
        }

        if (!buffer_[currentTail & mask_].isReady) {
            return false;
        }

        item = buffer_[currentTail & mask_].data;
        buffer_[currentTail & mask_].isReady = false;
        tail_.store(currentTail + 1, std::memory_order_release);
        return true;
    }

    size_t size() const {
        size_t h = head_.load(std::memory_order_relaxed);
        size_t t = tail_.load(std::memory_order_relaxed);
        return (h >= t) ? (h - t) : (Capacity - (t - h));
    }
};

class DspWorkerPool {
private:
    std::vector<std::thread> workers_;
    std::atomic<bool> running_{false};
    LockFreeRingBuffer<double, kRingBufferCapacity> audioTaskQueue_;
    std::function<void(const std::array<double, kBlockSize>&)> dspCallback_;

    void workerLoop() {
        std::array<double, kBlockSize> block;
        while (running_.load(std::memory_order_relaxed)) {
            if (audioTaskQueue_.pop(block)) {
                if (dspCallback_) {
                    dspCallback_(block);
                }
            } else {
                std::this_thread::yield();
            }
        }
    }

public:
    explicit DspWorkerPool(size_t numThreads, std::function<void(const std::array<double, kBlockSize>&)> callback)
        : dspCallback_(callback) {
        running_.store(true, std::memory_order_relaxed);
        workers_.reserve(numThreads);
        for (size_t i = 0; i < numThreads; ++i) {
            workers_.emplace_back(&DspWorkerPool::workerLoop, this);
        }
    }

    ~DspWorkerPool() {
        shutdown();
    }

    void shutdown() {
        running_.store(false, std::memory_order_release);
        for (auto& worker : workers_) {
            if (worker.joinable()) {
                worker.join();
            }
        }
        workers_.clear();
    }

    // REAL-TIME AUDIO THREAD EXECUTION: Zero allocation, lock-free push
    bool processRealtimeBlock(const double* inputBuffer) {
        std::array<double, kBlockSize> block;
        for (size_t i = 0; i < kBlockSize; ++i) {
            block[i] = inputBuffer[i];
        }
        return audioTaskQueue_.push(block);
    }
};

} // namespace UnboxedDSP
