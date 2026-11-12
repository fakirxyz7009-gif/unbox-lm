/**
 * @file VectorAutomationCurve.h
 * @brief Cubic Bezier Vector Breakpoint Automation Interpolation Engine
 * @details Calculates sub-millisecond parameter interpolation between two automation nodes
 *          using optimized cubic Bezier equations with tension/shape modifiers (-1.0 to +1.0).
 */

#pragma once

#include <cmath>
#include <algorithm>

namespace UnboxedDSP {

struct AutomationNode {
    double timeSec;
    double value;
};

class VectorAutomationCurveEngine {
public:
    /**
     * @brief Evaluates cubic Bezier automation interpolation at a specific time position.
     * @param node1 Start automation node (Time1, Value1)
     * @param node2 End automation node (Time2, Value2)
     * @param targetTime Current timeline position in seconds (sub-millisecond precision)
     * @param curveShape Bezier curve tension modifier ranging from -1.0 (exponential/logarithmic) to +1.0 (S-curve), with 0.0 being linear.
     * @return double Exact interpolated parameter output value [0.0 to 1.0 or custom range].
     */
    static double evaluateBezierAutomation(
        const AutomationNode& node1,
        const AutomationNode& node2,
        double targetTime,
        double curveShape
    ) {
        if (targetTime <= node1.timeSec) return node1.value;
        if (targetTime >= node2.timeSec) return node2.value;

        // Normalized progress t along timeline [0.0, 1.0]
        double duration = node2.timeSec - node1.timeSec;
        if (duration <= 0.0) return node1.value;

        double t = (targetTime - node1.timeSec) / duration;
        t = std::clamp(t, 0.0, 1.0);

        // Clamp curve shape modifier between -1.0 and +1.0
        double shape = std::clamp(curveShape, -1.0, 1.0);

        // Control point offsets based on shape modifier
        // shape < 0: accelerates/decelerates logarithmically
        // shape > 0: S-curve acceleration & deceleration
        double cp1T = 0.333 + (shape * 0.2);
        double cp1V = node1.value + (node2.value - node1.value) * (0.333 + (shape * 0.4));

        double cp2T = 0.666 - (shape * 0.2);
        double cp2V = node1.value + (node2.value - node1.value) * (0.666 - (shape * 0.4));

        // Solve cubic Bezier curve for value at parameter t using De Casteljau's algorithm or direct polynomial
        // B(t) = (1-t)^3 * P0 + 3(1-t)^2 * t * P1 + 3(1-t) * t^2 * P2 + t^3 * P3
        double u = 1.0 - t;
        double tt = t * t;
        double uu = u * u;
        double uuu = uu * u;
        double ttt = tt * t;

        // P0.value = node1.value, P3.value = node2.value
        double interpolatedValue = 
            uuu * node1.value +
            3.0 * uu * t * cp1V +
            3.0 * u * tt * cp2V +
            ttt * node2.value;

        return interpolatedValue;
    }
};

} // namespace UnboxedDSP
