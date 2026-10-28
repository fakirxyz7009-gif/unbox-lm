/**
 * @file AutomationRdpSimplification.h
 * @brief Ramer-Douglas-Peucker (RDP) Automation Breakpoint Node Reduction Algorithm
 * @details Simplifies dense live-recorded automation paths by eliminating redundant collinear nodes
 *          within a user-definable tolerance threshold (epsilon) while preserving curve topology.
 */

#pragma once

#include <vector>
#include <cmath>
#include <algorithm>

namespace UnboxedDSP {

struct AutomationPoint2D {
    double x; // Time (seconds or ticks)
    double y; // Parameter value [0.0 to 1.0]
};

class AutomationRdpSimplification {
private:
    // Calculates perpendicular distance from point p to line segment (a, b)
    static double perpendicularDistance(const AutomationPoint2D& p, const AutomationPoint2D& a, const AutomationPoint2D& b) {
        double normalLength = std::hypot(b.x - a.x, b.y - a.y);
        if (normalLength == 0.0) {
            return std::hypot(p.x - a.x, p.y - a.y);
        }
        return std::abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / normalLength;
    }

    static void rdpRecursive(
        const std::vector<AutomationPoint2D>& points,
        size_t startIndex,
        size_t endIndex,
        double epsilon,
        std::vector<bool>& keepFlags
    ) {
        if (startIndex + 1 >= endIndex) return;

        double maxDist = 0.0;
        size_t farthestIndex = startIndex;

        const auto& a = points[startIndex];
        const auto& b = points[endIndex];

        for (size_t i = startIndex + 1; i < endIndex; ++i) {
            double dist = perpendicularDistance(points[i], a, b);
            if (dist > maxDist) {
                maxDist = dist;
                farthestIndex = i;
            }
        }

        if (maxDist > epsilon) {
            keepFlags[farthestIndex] = true;
            rdpRecursive(points, startIndex, farthestIndex, epsilon, keepFlags);
            rdpRecursive(points, farthestIndex, endIndex, epsilon, keepFlags);
        }
    }

public:
    /**
     * @brief Simplifies an incoming dense automation curve using the RDP algorithm.
     * @param points Raw array of recorded automation breakpoint coordinates.
     * @param epsilon Tolerance threshold (higher = fewer points, lower = higher fidelity).
     * @return std::vector<AutomationPoint2D> Reduced down-sampled automation vector path.
     */
    static std::vector<AutomationPoint2D> simplifyAutomationPath(
        const std::vector<AutomationPoint2D>& points,
        double epsilon
    ) {
        if (points.size() <= 2) return points;

        std::vector<bool> keepFlags(points.size(), false);
        keepFlags[0] = true;
        keepFlags[points.size() - 1] = true;

        rdpRecursive(points, 0, points.size() - 1, epsilon, keepFlags);

        std::vector<AutomationPoint2D> simplifiedPath;
        for (size_t i = 0; i < points.size(); ++i) {
            if (keepFlags[i]) {
                simplifiedPath.push_back(points[i]);
            }
        }

        return simplifiedPath;
    }
};

} // namespace UnboxedDSP
