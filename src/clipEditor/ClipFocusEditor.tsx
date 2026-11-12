/**
 * "Clip" tab of the Clip Editor: edits the clip selected in a song timeline — a note clip in a
 * large piano roll with velocity lane, an audio clip on its waveform — or, for a pattern clip,
 * opens its pattern in the pattern editors. Without a selection it lists the song's clips.
 */
import React from 'react';
import { AudioLines, Grid3x3, Music } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { ArrangementClip, SequencerTrack } from '../audio/types.ts';
import { findPattern } from '../audio/sequencer/model.ts';
import { NoteClipEditor } from '../components/sequencer/arrangement/NoteClipEditor.tsx';
import type { SequencerTabMode } from '../components/sequencer/SequencerView.tsx';
import { useEngineVersion } from '../nexa/useEngine.ts';
import { focusClip, useClipFocus } from '../shell/clipFocus.ts';
import { AudioClipEditor } from './AudioClipEditor.tsx';

interface Props {
  onOpenEditor: (tab: SequencerTabMode) => void;
  onSelectPart: (deviceId: string) => void;
}

const kindIcon = (c: ArrangementClip) => (c.kind === 'audio' ? AudioLines : c.kind === 'notes' ? Music : Grid3x3);

function audition(t: SequencerTrack, note: number, vel: number): void {
  const dev = audioEngine.devices.get(t.deviceId);
  if (!dev?.noteOn) return;
  const now = audioEngine.ctx.currentTime;
  dev.noteOn(note, vel, now);
  dev.noteOff?.(note, now + 0.22);
}

function ClipPicker() {
  const tracks = audioEngine.tracks.filter((t) => (t.arrangementClips ?? []).length > 0);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2" data-testid="clip-picker">
      <div className="font-label font-bold text-[13px] tracking-[0.18em] text-[#d5dae0]">CLIP EDITOR</div>
      <p className="font-label text-[13px] text-chrome-ink">
        Select a clip in the song (Workstation &amp; Sequencer tab) to edit it here, or pick one below. Note clips open in a piano roll with a velocity lane, audio clips on their waveform.
      </p>
      {tracks.length === 0 && <p className="font-label text-[13px] text-chrome-ink/70">The song has no clips yet — draw one with the pencil tool in the song sequencer.</p>}
      {tracks.map((t) => (
        <div key={t.id} className="flex items-start gap-2">
          <span className="w-32 shrink-0 truncate font-label font-bold text-[13px] pt-0.5" style={{ color: t.color }}>
            {t.name}
          </span>
          <div className="flex flex-wrap gap-1">
            {(t.arrangementClips ?? [])
              .slice()
              .sort((a, b) => a.startBar - b.startBar)
              .slice(0, 24)
              .map((c) => {
                const Icon = kindIcon(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="rack-tool !normal-case !tracking-normal"
                    onClick={() => focusClip({ trackId: t.id, clipId: c.id })}
                    title={`${c.name || 'Clip'} — bar ${Math.floor(c.startBar) + 1}, ${+c.lengthBars.toFixed(2)} bars`}
                  >
                    <Icon className="w-3 h-3" /> {c.name || 'Clip'} · {Math.floor(c.startBar) + 1}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClipFocusEditor({ onOpenEditor, onSelectPart }: Props) {
  useEngineVersion();
  const focus = useClipFocus();
  const track = focus ? audioEngine.tracks.find((t) => t.id === focus.trackId) : undefined;
  const clip = track?.arrangementClips?.find((c) => c.id === focus?.clipId);
  if (!track || !clip) return <ClipPicker />;
  const close = () => focusClip(null);

  if (clip.kind === 'audio') return <AudioClipEditor key={clip.id} track={track} clip={clip} onClose={close} />;
  if (clip.kind === 'notes') return <NoteClipEditor key={clip.id} fill audioEngine={audioEngine} track={track} clip={clip} onClose={close} onAudition={(n, v) => audition(track, n, v)} />;

  const pattern = clip.patternId ? findPattern(track, clip.patternId) : undefined;
  const open = (tab: SequencerTabMode) => {
    if (pattern) audioEngine.sequencer.selectPattern(track.id, pattern.id);
    onSelectPart(track.deviceId);
    onOpenEditor(tab);
  };
  return (
    <div className="flex-1 min-h-0 p-3 flex flex-col gap-2" data-testid="pattern-clip-card">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm" style={{ background: clip.color || track.color }} />
        <span className="font-label font-bold text-[18px] text-white">{clip.name || 'Pattern clip'}</span>
        <span className="font-label text-[13px] text-chrome-ink">
          {track.name} · bar {Math.floor(clip.startBar) + 1} · {+clip.lengthBars.toFixed(2)} bars
        </span>
        <span className="flex-1" />
        <button type="button" className="rack-tool" onClick={close}>
          Close
        </button>
      </div>
      <p className="font-label text-[13px] text-chrome-ink">
        This clip plays the pattern <strong className="text-white">{pattern?.name ?? 'of its track'}</strong>. Patterns are edited in the pattern editors (every clip that plays the pattern changes with it).
      </p>
      <div className="flex gap-2">
        <button type="button" className="rack-tool" onClick={() => open('piano_roll')}>
          <Music className="w-3.5 h-3.5" /> Edit in piano roll
        </button>
        <button type="button" className="rack-tool" onClick={() => open(track.group === 'Drums' ? 'drum_editor' : 'channel_rack')}>
          <Grid3x3 className="w-3.5 h-3.5" /> Edit in {track.group === 'Drums' ? 'drum editor' : 'step grid'}
        </button>
      </div>
    </div>
  );
}
