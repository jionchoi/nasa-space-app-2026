import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { toggleMuted, useMuted } from '../../lib/sound';

/** Header speaker button: mutes or unmutes every app sound (alarm, check-in beep, CPR metronome). The "M" key does
 *  the same. While muted, a "Muted" badge stays visible next to it. */
export function MuteButton({ small }: { small?: boolean }) {
  const muted = useMuted();
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" onClick={toggleMuted} aria-pressed={muted}
        aria-label={muted ? 'Sound is muted. Unmute all app sounds (M)' : 'Mute all app sounds (M)'}
        title={muted ? 'Unmute all sounds (M)' : 'Mute all sounds (M)'}
        className={`btn ${small ? 'h-8 px-2' : 'h-9 px-2.5'} ${muted ? 'ring-watch/50' : ''}`}>
        {muted ? <SpeakerSlash className="h-4 w-4 text-watch" weight="bold" aria-hidden /> : <SpeakerHigh className="h-4 w-4" aria-hidden />}
      </button>
      {muted && <span className="badge bg-watch/10 text-watch ring-watch/25" role="status">Muted</span>}
    </span>
  );
}
