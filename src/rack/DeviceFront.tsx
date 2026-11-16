/**
 * The front panel of any device (rack units and the workstation's EDIT window use the same).
 * Instruments get the "Load audio" strip on top; dropping an audio file anywhere on a keys
 * instrument's panel makes it the instrument's sound (drops a faceplate handles itself are left alone).
 */
import React from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import { loadKeySampleFile } from '../audio/deviceSamples.ts';
import { drumLanesFor } from '../audio/drumLanes.ts';
import { SpecDevice } from '../audio/spec/SpecDevice.ts';
import { VstPluginDevice } from '../vst/VstPluginDevice.ts';
import { DeviceFaceplate } from '../components/faceplates/DeviceFaceplate.tsx';
import { SpecFaceplate } from '../components/faceplates/SpecFaceplate.tsx';
import { ChoraleFaceplate } from '../components/faceplates/ChoraleFaceplate.tsx';
import { PolytoneFaceplate } from '../components/faceplates/PolytoneFaceplate.tsx';
import { Seer6Faceplate } from '../components/faceplates/Seer6Faceplate.tsx';
import { VstFaceplate } from './VstFaceplate.tsx';
import { MixerUnitFaceplate, isMixerUnit } from './MixerUnitFaceplate.tsx';
import { DeviceSampleBar, isAudioFile } from './DeviceSampleBar.tsx';

export const DeviceFront: React.FC<{ device: BaseDevice; onUpdate: () => void; onMessage: (msg: string, type: 'success' | 'error' | 'info') => void; dark?: boolean }> = ({
  device,
  onUpdate,
  onMessage,
  dark = false,
}) => {
  const face =
    device instanceof VstPluginDevice ? (
      <VstFaceplate device={device} onUpdate={onUpdate} onMessage={onMessage} />
    ) : device instanceof SpecDevice ? (
      device.spec.type === 'humana' ? (
        <ChoraleFaceplate device={device} onUpdate={onUpdate} />
      ) : device.spec.type === 'polytone' ? (
        <PolytoneFaceplate device={device} onUpdate={onUpdate} />
      ) : device.spec.type === 'prophet6' ? (
        <Seer6Faceplate device={device} onUpdate={onUpdate} />
      ) : (
        <SpecFaceplate device={device} onUpdate={onUpdate} dark={dark} />
      )
    ) : isMixerUnit(device) ? (
      <MixerUnitFaceplate device={device} />
    ) : (
      <DeviceFaceplate device={device} onUpdate={onUpdate} />
    );
  if (!audioEngine.isPlayableInstrument(device.type)) return face;
  const keys = !drumLanesFor(device);
  return (
    <div
      onDragOver={(e) => keys && e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (!keys || e.defaultPrevented) return;
        const file = Array.from(e.dataTransfer.files).find(isAudioFile);
        if (!file) return;
        e.preventDefault();
        loadKeySampleFile(device.id, file)
          .then(() => {
            audioEngine.changed();
            onMessage(`${file.name} is now the sound of ${device.name}`, 'success');
          })
          .catch(() => onMessage(`${file.name} could not be decoded as audio`, 'error'));
      }}
    >
      <DeviceSampleBar device={device} />
      {face}
    </div>
  );
};
