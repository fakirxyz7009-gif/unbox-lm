/** Pointer capture that never throws (a cancelled or synthetic pointer must not abort the gesture). */
export function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // pointer already gone: the gesture still works without capture
  }
}
