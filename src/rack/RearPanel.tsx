import React from 'react';
import type { PortDefinition } from '../audio/types.ts';
import type { CableController } from './PatchCableLayer.tsx';
import type { JackRegistry } from './jackRegistry.ts';

interface RearPanelProps {
  deviceId: string;
  deviceName: string;
  ports: PortDefinition[];
  controller: CableController;
  registry: JackRegistry;
  /** jack key → cable colour for plugged jacks */
  plugged: Map<string, string>;
  serial?: string;
}

const GROUPS: { title: string; match: (p: PortDefinition) => boolean }[] = [
  { title: 'Audio In', match: (p) => p.type === 'audio_in' },
  { title: 'Audio Out', match: (p) => p.type === 'audio_out' },
  { title: 'CV In', match: (p) => p.type === 'cv_in' },
  { title: 'CV Out', match: (p) => p.type === 'cv_out' },
];

function shortLabel(port: PortDefinition): string {
  const s = port.name
    .replace(/^Audio /, '')
    .replace(/ CV In$| CV Out$| CV$/, '')
    .replace(/^Master /, '')
    .trim();
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
}

export const RearPanel: React.FC<RearPanelProps> = ({ deviceId, deviceName, ports, controller, registry, plugged, serial }) => {
  const groups = GROUPS.map((g) => ({ ...g, ports: ports.filter(g.match) })).filter((g) => g.ports.length);
  return (
    <div className="rack-rear flex items-stretch gap-3 px-3 py-2.5 min-h-full">
      <div className="rack-rear-label shrink-0 self-center">
        <div className="text-[11px] font-black tracking-widest uppercase text-neutral-900 leading-tight max-w-[150px] truncate">{deviceName}</div>
        <div className="text-[11px] font-mono text-neutral-600 mt-0.5">{serial ?? deviceId.slice(-10).toUpperCase()}</div>
      </div>
      <div className="flex flex-wrap items-start gap-2.5 flex-1">
        {groups.length === 0 && <span className="text-[11px] font-mono text-neutral-500 self-center">No patchable connections</span>}
        {groups.map((g) => (
          <fieldset key={g.title} className="rack-jack-group">
            <legend>{g.title}</legend>
            <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
              {g.ports.map((port) => {
                const key = `${deviceId}:${port.id}`;
                const color = plugged.get(key);
                const cv = port.type.startsWith('cv');
                const dir = port.type.endsWith('_in') ? 'input' : 'output';
                return (
                  <div key={port.id} className="flex flex-col items-center w-[52px]">
                    <button
                      type="button"
                      ref={registry.ref(key)}
                      data-jack-key={key}
                      className={`rack-jack ${cv ? 'rack-jack--cv' : 'rack-jack--audio'} ${color ? 'rack-jack--plugged' : ''}`}
                      style={color ? ({ ['--plug' as string]: color } as React.CSSProperties) : undefined}
                      title={`${deviceName} · ${port.name} (${cv ? 'CV' : 'audio'} ${dir})${port.description ? ` — ${port.description}` : ''}`}
                      aria-label={`${deviceName} ${port.name}, ${cv ? 'CV' : 'audio'} ${dir}${color ? ', patched' : ''}`}
                      onPointerDown={(e) => controller.onJackPointerDown(e, key)}
                      onKeyDown={(e) => controller.onJackKeyDown(e, key)}
                    />
                    <span className="rack-jack-label">{shortLabel(port)}</span>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
};
