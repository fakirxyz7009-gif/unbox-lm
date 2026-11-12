/** The single studio AudioContext, shared by the engine, the library audition and the audio store. */
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
const AudioCtx: typeof AudioContext | undefined = typeof window !== 'undefined'
  ? (window.AudioContext ?? (window as WebkitWindow).webkitAudioContext)
  : (globalThis as any).AudioContext;
export const sharedAudioContext: AudioContext = AudioCtx ? new AudioCtx({ latencyHint: 'interactive' }) : ({} as any);
