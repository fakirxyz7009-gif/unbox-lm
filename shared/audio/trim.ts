/**
 * Drops the first `lead` samples of each channel and keeps the next `length` samples, padding with silence where the
 * source ends. Removes a processing delay, such as the look-ahead of a denoiser.
 */
export function dropLead(channels: readonly Float32Array[], lead: number, length: number): Float32Array<ArrayBuffer>[] {
  return channels.map((src) => {
    const out = new Float32Array(length);
    out.set(src.subarray(Math.min(lead, src.length), Math.min(lead + length, src.length)));
    return out;
  });
}
