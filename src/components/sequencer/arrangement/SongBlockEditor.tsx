import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { ArrangementClip, SongBlock } from '../../../audio/types.ts';
import type { AutoLane, AutoPoint } from '../../../audio/automation/model.ts';
import { valueAt } from '../../../audio/automation/model.ts';
import { audioStore } from '../../../audio/clips/audioStore.ts';
import { AudioClipWave, useAudioStoreVersion } from './AudioClipWave.tsx';

interface Props {
  audioEngine: AudioEngine;
  block: SongBlock;
  onClose: () => void;
}

const fieldClass = 'w-20 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-slate-100';
const buttonClass = 'inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-bold text-slate-300 hover:border-cyan-500 hover:text-white';

/** Edits the audio and automation captured inside one reusable song Block. */
export function SongBlockEditor({ audioEngine, block, onClose }: Props) {
  useAudioStoreVersion();
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const endPos = (block.lengthBars ?? 4) * audioEngine.stepsPerBar;
  const audioGroups = Object.entries(block.audioClipsByTrack ?? {}).filter(([, clips]) => clips.length > 0);
  const updateClip = (trackId: string, clip: ArrangementClip, patch: Parameters<AudioEngine['updateSongBlockAudioClip']>[3]) => {
    audioEngine.updateSongBlockAudioClip(block.id, trackId, clip.id, patch);
    refresh();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${block.name} song block`}
      data-testid="song-block-editor"
    >
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-amber-500/50 bg-[#0b111b] text-slate-100 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <span className="rounded bg-amber-950 px-2 py-1 text-[11px] font-black tracking-wider text-amber-200">BLOCK EDITOR</span>
          <input
            key={`${block.id}:${revision}`}
            defaultValue={block.name}
            aria-label="Block name"
            onBlur={(event) => { audioEngine.renameSongBlock(block.id, event.target.value); refresh(); }}
            className="min-w-0 flex-1 bg-transparent text-sm font-black outline-none"
          />
          <button type="button" className={buttonClass} onClick={() => audioEngine.switchPatternBank(block.patternIndex)} title="Open the copied instrument scene for editing">
            EDIT SCENE S{block.patternIndex + 1}
          </button>
          <button type="button" onClick={onClose} aria-label="Close Block editor" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-emerald-300">Captured audio</h2>
              <span className="text-[11px] text-slate-500">{audioGroups.reduce((sum, [, clips]) => sum + clips.length, 0)} clips · starts are relative to this Block</span>
            </div>
            {audioGroups.length === 0 ? (
              <p className="rounded border border-dashed border-slate-800 px-3 py-4 text-[11px] text-slate-500">No audio clips were captured. Create a Block with the L–R button to capture audio from the loop range.</p>
            ) : (
              <div className="space-y-3">
                {audioGroups.map(([trackId, clips]) => {
                  const track = audioEngine.tracks.find((item) => item.id === trackId);
                  const color = track?.color ?? '#34d399';
                  return (
                    <div key={trackId} className="rounded border border-slate-800 bg-slate-950/40 p-2">
                      <div className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color }}>{track?.name ?? 'Missing audio track'}</div>
                      <div className="space-y-2">
                        {clips.map((clip) => {
                          const asset = audioStore.get(clip.audioId);
                          return (
                          <div key={`${clip.id}:${revision}`} className="rounded border border-slate-800 bg-[#090e16] p-2">
                            <div className="mb-2 flex items-center gap-2">
                              <input defaultValue={clip.name} aria-label="Block audio clip name" className="min-w-0 flex-1 bg-transparent text-[11px] font-bold outline-none" onBlur={(event) => updateClip(trackId, clip, { name: event.target.value })} />
                              <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Start position within this Block">
                                BAR
                                <input type="number" min="1" max={block.lengthBars ?? 4} step="0.0625" defaultValue={+(clip.startBar + 1).toFixed(4)} className={fieldClass} onBlur={(event) => updateClip(trackId, clip, { startBar: Math.max(0, Number(event.target.value) - 1) })} />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Clip length in bars">
                                LEN
                                <input type="number" min="0.0625" max={block.lengthBars ?? 4} step="0.0625" defaultValue={+clip.lengthBars.toFixed(4)} className={fieldClass} onBlur={(event) => updateClip(trackId, clip, { lengthBars: Number(event.target.value) })} />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Clip gain in decibels">
                                dB
                                <input type="number" min="-60" max="24" step="0.5" defaultValue={clip.gainDb ?? 0} className={fieldClass} onBlur={(event) => updateClip(trackId, clip, { gainDb: Number(event.target.value) })} />
                              </label>
                              <button type="button" className={buttonClass} aria-pressed={!!clip.muted} onClick={() => updateClip(trackId, clip, { muted: !clip.muted })} title={clip.muted ? 'Unmute this captured clip' : 'Mute this captured clip'}>MUTE</button>
                              <button type="button" className={buttonClass} aria-pressed={!!clip.reverse} onClick={() => updateClip(trackId, clip, { reverse: !clip.reverse })} title={clip.reverse ? 'Play forwards' : 'Reverse this captured clip'}>REV</button>
                              <button type="button" onClick={() => { audioEngine.deleteSongBlockAudioClip(block.id, trackId, clip.id); refresh(); }} aria-label={`Remove ${clip.name} from ${block.name}`} className="rounded p-1 text-slate-500 hover:bg-red-950 hover:text-red-200" title="Remove this clip from the Block">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="mb-2 flex flex-wrap gap-2">
                              <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Source region start in seconds">
                                SOURCE
                                <input type="number" min="0" max={asset?.buffer.duration ?? 0} step="0.01" defaultValue={clip.audioOffset ?? 0} className={fieldClass} onBlur={(event) => updateClip(trackId, clip, { audioOffset: Number(event.target.value) })} />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Fade in length in seconds">
                                FADE IN
                                <input type="number" min="0" step="0.01" defaultValue={clip.fadeIn ?? 0} className={fieldClass} onBlur={(event) => updateClip(trackId, clip, { fadeIn: Number(event.target.value) })} />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Fade out length in seconds">
                                FADE OUT
                                <input type="number" min="0" step="0.01" defaultValue={clip.fadeOut ?? 0} className={fieldClass} onBlur={(event) => updateClip(trackId, clip, { fadeOut: Number(event.target.value) })} />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Varispeed pitch shift in semitones">
                                PITCH
                                <input type="number" min="-24" max="24" step="1" defaultValue={clip.pitch ?? 0} className={fieldClass} onBlur={(event) => updateClip(trackId, clip, { pitch: Number(event.target.value) })} />
                              </label>
                            </div>
                            <div className="h-9 overflow-hidden rounded bg-black/40">
                              <AudioClipWave clip={clip} width={760} height={36} color={color} bpm={audioEngine.bpm} spb={audioEngine.stepsPerBar} />
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-cyan-300">Captured automation</h2>
              <span className="text-[11px] text-slate-500">{block.automationLanes?.length ?? 0} lanes · positions use 16ths from the Block start</span>
            </div>
            {block.automationLanes?.length ? (
              <div className="space-y-3">
                {block.automationLanes.map((lane) => (
                  <BlockAutomationLane
                    key={lane.id}
                    lane={lane}
                    endPos={endPos}
                    label={audioEngine.automation.label(lane.target)}
                    onChange={(points) => { audioEngine.updateSongBlockAutomation(block.id, lane.id, points); refresh(); }}
                    onDelete={() => { audioEngine.deleteSongBlockAutomationLane(block.id, lane.id); refresh(); }}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed border-slate-800 px-3 py-4 text-[11px] text-slate-500">No automation was captured. Create a Block with the L–R button while the source range contains automation lanes.</p>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
          <span>Changes apply to every placement of this Block.</span>
          <button type="button" className={buttonClass} onClick={onClose}>DONE</button>
        </footer>
      </section>
    </div>
  );
}

function BlockAutomationLane({
  lane,
  endPos,
  label,
  onChange,
  onDelete,
}: {
  lane: AutoLane;
  endPos: number;
  label: string;
  onChange: (points: AutoPoint[]) => void;
  onDelete: () => void;
}) {
  const width = 720;
  const height = 72;
  const path = Array.from({ length: 181 }, (_, index) => {
    const x = (index / 180) * width;
    const value = valueAt(lane.points, (index / 180) * endPos) ?? 0.5;
    return `${index ? 'L' : 'M'} ${x} ${height - value * height}`;
  }).join(' ');
  const addPoint = () => {
    const positions = [0, ...lane.points.map((point) => point.pos), endPos].sort((a, b) => a - b);
    let pos = endPos / 2;
    let gap = -1;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] - positions[i - 1] > gap) {
        gap = positions[i] - positions[i - 1];
        pos = (positions[i] + positions[i - 1]) / 2;
      }
    }
    onChange([...lane.points, { pos, value: valueAt(lane.points, pos) ?? 0.5 }]);
  };
  const updatePoint = (index: number, patch: Partial<AutoPoint>) => onChange(lane.points.map((point, i) => i === index ? { ...point, ...patch } : point));

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-200">{label}</span>
        <button type="button" className={buttonClass} onClick={addPoint} title="Add a control point halfway through the widest gap"><Plus className="h-3 w-3" /> POINT</button>
        <button type="button" onClick={onDelete} aria-label={`Remove ${label} from this Block`} className="rounded p-1 text-slate-500 hover:bg-red-950 hover:text-red-200" title="Remove this automation lane from the Block"><Trash2 className="h-3 w-3" /></button>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-16 w-full rounded bg-[#070b12]" aria-label={`${label} automation curve`} role="img">
        <path d={`M 0 ${height / 2} H ${width}`} stroke="#334155" strokeDasharray="3 5" strokeWidth="1" />
        <path d={path} fill="none" stroke="#d6a358" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {lane.points.map((point, index) => (
          <circle key={index} cx={(Math.max(0, Math.min(endPos, point.pos)) / Math.max(1, endPos)) * width} cy={height - point.value * height} r="4" fill="#f2dfbf" stroke="#a66e32" strokeWidth="2" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {lane.points.map((point, index) => (
          <div key={`${point.pos}:${index}`} className="flex items-center gap-1 rounded border border-slate-800 bg-[#080d15] px-1.5 py-1">
            <span className="text-[11px] text-slate-500">P{index + 1}</span>
            <label className="flex items-center gap-1 text-[11px] text-slate-500">16TH
            <input type="number" min="0" max={endPos} step="0.25" defaultValue={+point.pos.toFixed(4)} onBlur={(event) => updatePoint(index, { pos: Number(event.target.value) })} className="w-16 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px] text-slate-100" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-500">VALUE
              <input type="number" min="0" max="1" step="0.01" defaultValue={+point.value.toFixed(3)} onBlur={(event) => updatePoint(index, { value: Number(event.target.value) })} className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px] text-slate-100" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-500">CURVE
              <input type="number" min="-1" max="1" step="0.05" defaultValue={point.curve ?? 0} onBlur={(event) => updatePoint(index, { curve: Number(event.target.value) })} className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px] text-slate-100" />
            </label>
            <button type="button" className={buttonClass} aria-pressed={!!point.hold} onClick={() => updatePoint(index, { hold: !point.hold })} title="Hold this value until the next point">HOLD</button>
            <button type="button" aria-label={`Remove automation point ${index + 1}`} onClick={() => onChange(lane.points.filter((_, i) => i !== index))} className="rounded px-1 text-slate-500 hover:text-red-300">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
