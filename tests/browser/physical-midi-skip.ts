/**
 * A physical MIDI probe can only pass on a machine with a real Impulse controller and an allowed Web MIDI
 * permission. That is a machine precondition, not a code path, so the pages report it as a SKIP carrying its
 * evidence instead of failing the suite on hardware that is simply absent; the simulated-port probes
 * (`midi-bootstrap`, `midi-ui-recording`, `midi-recording`) keep guarding the app's own MIDI code.
 * Once an Impulse input is open, every later mismatch stays a failure. A machine that is supposed to have the
 * controller sets `UNBOX_REQUIRE_PHYSICAL_MIDI=1` (PowerShell `-RequirePhysicalMidi`) and the runner turns the
 * skip back into a failure.
 */
export class PhysicalMidiUnavailable extends Error {}

/** Marks the result node as skipped and explains exactly which acceptance did not run and why. */
export function reportPhysicalMidiSkip(node: HTMLElement, reason: string): void {
  node.dataset.status = 'skipped';
  node.textContent = `SKIP · physical MIDI acceptance not run — ${reason}`;
  console.info(`PHYSICAL_MIDI_SKIP ${reason}`);
}
