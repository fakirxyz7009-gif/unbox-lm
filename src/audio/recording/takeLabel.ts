/**
 * A take's length in the app's short style (`0:07.4`): the transport's RECORDING badge and the
 * names of recorded clips both use it, so a clip can be matched to the take that made it.
 */
export const takeLengthLabel = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
