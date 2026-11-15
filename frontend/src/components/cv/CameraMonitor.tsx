// The camera's on-screen parts: the on/off button in the header (CameraToggle) and the small floating panel
// with the live preview and status (CameraMonitor). Camera detection is off until the crew member turns it on;
// the pulse check on the finger clip runs either way.
import { Eye, EyeSlash, ShieldCheck, VideoCamera, VideoCameraSlash, WarningCircle, X } from '@phosphor-icons/react';
import { useCv } from '../../state/CvContext';
import { SkeletonCanvas } from './SkeletonCanvas';

type Tone = 'ok' | 'watch' | 'alert' | 'muted';

/** The status line in plain words, and its colour. */
function useCameraStatus(): { text: string; tone: Tone } {
  const { phase, live, pulse } = useCv();
  if (phase === 'off') return { text: 'Camera off', tone: 'muted' };
  if (phase === 'loading') return { text: 'Starting the camera…', tone: 'muted' };
  if (phase === 'error') return { text: 'Not running', tone: 'alert' };
  // The detector's own state first.
  const state = live.state?.name;
  if (state === 'CHECK_IN' || state === 'SUSPECTED') return { text: 'Asking "Are you OK?"', tone: 'alert' };
  if (state === 'ALARM') return { text: 'Alarm raised · crew alerted', tone: 'alert' };
  // Nobody in view.
  if (!live.present) return { text: 'No one at the module', tone: 'watch' };
  if (phase === 'calibrating') return { text: `Calibrating · work as usual, face the camera (${Math.ceil(live.calibrationLeftS)} s)`, tone: 'watch' };
  if (live.isSleepTime) return { text: 'Sleep hours · camera not checking (pulse still checked)', tone: 'muted' };
  if (live.paused) return { text: 'Paused on this screen', tone: 'muted' };
  if (pulse.status === 'clip_off') return { text: 'Monitoring · check the sensor (clip off?)', tone: 'watch' };
  if (state === 'COOLDOWN' && live.state?.resumeAt) {
    return { text: `OK confirmed · checking again in ${Math.ceil(live.state.resumeAt - live.now)} s`, tone: 'ok' };
  }
  return { text: 'Monitoring', tone: 'ok' };
}

const TONE_CLASS: Record<Tone, string> = { ok: 'text-ok', watch: 'text-watch', alert: 'text-alert', muted: 'text-muted' };
const DOT_CLASS: Record<Tone, string> = { ok: 'bg-ok', watch: 'bg-watch', alert: 'bg-alert', muted: 'bg-muted' };

/** Header button: turns camera detection on and off. */
export function CameraToggle() {
  const { phase, start, stop } = useCv();
  const on = phase === 'loading' || phase === 'calibrating' || phase === 'running';
  return (
    <button
      className={`btn h-9 gap-1.5 px-3 ${on ? 'ring-ok/40' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Turn unresponsive detection camera off' : 'Turn unresponsive detection camera on'}
      title="Unresponsive detection with the webcam. On-device only; no video is stored."
      onClick={() => (on ? stop() : void start())}
    >
      {on ? <VideoCamera className="h-4 w-4 text-ok" weight="fill" aria-hidden /> : <VideoCameraSlash className="h-4 w-4 text-muted" aria-hidden />}
      <span className="hidden text-xs 2xl:inline">Unresponsive detection</span>
    </button>
  );
}

/** Floating panel (bottom left): live preview, status line and the privacy badge. Mounted once in App.tsx. */
export function CameraMonitor() {
  const { phase, error, videoRef, previewVisible, setPreviewVisible, skeletonVisible, start, stop } = useCv();
  const status = useCameraStatus();
  // Nothing to show while off; the <video> still exists (hidden) so start() has somewhere to play the camera.
  const hidden = phase === 'off';

  return (
    <aside
      aria-label="Unresponsive detection camera"
      className={`fixed bottom-4 left-4 z-40 w-72 rounded-2xl bg-panel/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl ${hidden ? 'hidden' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[status.tone]}`} aria-hidden />
        <span className="text-sm font-medium">Unresponsive detection</span>
        <div className="ml-auto flex items-center gap-1">
          <button className="rounded-full p-1.5 text-muted transition hover:bg-white/[0.06] hover:text-text"
            onClick={() => setPreviewVisible(!previewVisible)} aria-label={previewVisible ? 'Hide camera preview' : 'Show camera preview'}>
            {previewVisible ? <EyeSlash className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
          <button className="rounded-full p-1.5 text-muted transition hover:bg-white/[0.06] hover:text-text" onClick={stop} aria-label="Turn the camera off">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* The live preview. When hidden it shrinks to 1 pixel instead of display:none, so the browser keeps decoding frames. */}
      <div className={previewVisible && phase !== 'error' ? 'relative mt-2 overflow-hidden rounded-xl bg-black' : 'pointer-events-none absolute h-px w-px overflow-hidden opacity-0'}>
        {/* Mirrored like a mirror. The skeleton canvas sits inside the same mirrored box, so it lines up. Never recorded. */}
        <div className="relative -scale-x-100">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Live camera preview (not recorded)" />
          {skeletonVisible && <SkeletonCanvas mode="image" className="absolute inset-0 h-full w-full" />}
        </div>
      </div>

      <p className={`mt-2 text-sm ${TONE_CLASS[status.tone]}`} role="status">{status.text}</p>

      {error && (
        <div className="mt-2 rounded-xl bg-alert/10 p-2.5 text-xs text-text ring-1 ring-alert/30">
          <p className="flex gap-1.5"><WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-alert" aria-hidden />{error}</p>
          <button className="btn mt-2 h-8 px-3 text-xs" onClick={() => void start()}>Try again</button>
        </div>
      )}

      {/* The privacy promise, always visible while the camera panel is open. */}
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-ok" aria-hidden /> On-device · no video stored · work modules only
      </p>
    </aside>
  );
}
