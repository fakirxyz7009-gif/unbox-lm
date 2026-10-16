/**
 * @file UiController.ts
 * @brief Controller for binding UI events to the ProjectStore and AudioGraph.
 */
import { projectStore } from '../store/projectStore';
import { audioGraph } from '../audio/AudioEngineGraph';

export class UiController {
  public static bindBpmSlider(inputElement: HTMLInputElement) {
    inputElement.addEventListener('input', (e) => {
      const bpm = parseInt((e.target as HTMLInputElement).value);
      projectStore.setBpm(bpm);
    });
  }

  public static bindTrackVolume(trackId: string, sliderElement: HTMLInputElement, gainNode: GainNode) {
    sliderElement.addEventListener('input', (e) => {
      const vol = parseFloat((e.target as HTMLInputElement).value);
      projectStore.updateTrack(trackId, { volume: vol });
      audioGraph.setGainSmooth(gainNode, vol);
    });
  }

  public static bindTransportPlay(buttonElement: HTMLButtonElement) {
    buttonElement.addEventListener('click', () => {
      audioGraph.resume();
    });
  }
}
