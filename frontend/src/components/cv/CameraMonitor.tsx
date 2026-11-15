// The camera's floating panel (CameraMonitor); the on/off button is the top bar's "◉ Camera" (shell/TopBar.tsx). Camera detection is off until the crew member turns it on;
// the pulse check on the finger clip runs either way.
import { CaretDown, CaretUp, Eye, EyeSlash, ShieldCheck, WarningCircle, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

/** Where the panel sits on the dashboard: inside the body-map column (#bodymap-col), bottom left, never over the right
 *  column at any window size (S3, Nov 15). Null elsewhere or when the column is stacked full width. */
function useBodyMapBox(active: boolean): { left: number; width: number } | null {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const el = active ? document.getElementById('bodymap-col') : null;
    if (!el) { setBox(null); return; }
    const update = () => { const r = el.getBoundingClientRect(); setBox({ left: r.left, width: r.width }); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [active]);
  return box;
}

/** Floating panel (bottom left; on the dashboard it stays inside the body-map column). v4 contents: posture, limb motion vs body drift, still-for timer, fall check. Collapsible to a small pill. */
export function CameraMonitor() {
  const { phase, error, videoRef, previewVisible, setPreviewVisible, skeletonVisible, start, stop, live, pulse, thresholds } = useCv();
  const status = useCameraStatus();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  // Nothing to show while off; the <video> still exists (hidden) so start() has somewhere to play the camera.
  const hidden = phase === 'off';
  const sig = live.signals;
  const st = live.state;
  const stillFor = st?.highSince != null ? Math.max(0, live.now - st.highSince) : 0;
  const askAfter = thresholds ? (pulse.vitalsRed ? thresholds.suspect_after_s_with_red_vitals : thresholds.suspect_after_s) : null;
  const posture = !sig ? '–' : sig.nbpScore >= 0.6 ? 'Neutral body posture (arms floating)' : 'Working posture';
  const box = useBodyMapBox(pathname === '/' && !hidden);
  // Inside the body-map column with a 16 px gutter; never wider than the column (the panel content wraps).
  const style = box ? { left: box.left + 16, maxWidth: Math.max(200, box.width - 32) } : undefined;

  return (
    <aside aria-label="Unresponsive detection camera"
      className={`fixed bottom-4 z-40 rounded-panel border border-line-strong bg-panel shadow-[0_20px_50px_rgb(0_0_0/0.6)] ${collapsed ? 'w-auto' : 'w-[300px]'} left-4 ${hidden ? 'hidden' : ''}`} style={style}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[status.tone]}`} aria-hidden />
        <span className="text-sm font-semibold">◉ Camera</span>
        {collapsed && <span className={`max-w-[180px] truncate text-xs ${TONE_CLASS[status.tone]}`}>{status.text}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          {!collapsed && (
            <button className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-text"
              onClick={() => setPreviewVisible(!previewVisible)} aria-label={previewVisible ? 'Hide camera preview' : 'Show camera preview'}>
              {previewVisible ? <EyeSlash className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          )}
          <button className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-text"
            onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand camera panel' : 'Collapse camera panel'}>
            {collapsed ? <CaretUp className="h-4 w-4" aria-hidden /> : <CaretDown className="h-4 w-4" aria-hidden />}
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-text" onClick={stop} aria-label="Turn the camera off">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* The live preview. When hidden or collapsed it shrinks to 1 pixel instead of display:none, so the browser keeps decoding frames. */}
      <div className={previewVisible && !collapsed && phase !== 'error' ? 'relative mx-3 overflow-hidden rounded-xl bg-black' : 'pointer-events-none absolute h-px w-px overflow-hidden opacity-0'}>
        {/* Mirrored like a mirror. The skeleton canvas sits inside the same mirrored box, so it lines up. Never recorded. */}
        <div className="relative -scale-x-100">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Live camera preview (not recorded)" />
          {skeletonVisible && <SkeletonCanvas mode="image" className="absolute inset-0 h-full w-full" />}
        </div>
        <span className="absolute left-2 top-2 text-[11px] text-ok">● on device only</span>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 pt-2">
          <p className={`text-sm ${TONE_CLASS[status.tone]}`} role="status">{status.text}</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 text-xs">
            <dt className="text-muted">Posture</dt><dd>{posture}</dd>
            <dt className="text-muted">Limb motion vs body drift</dt><dd className="font-mono">{sig ? `${sig.limbMotion.toFixed(2)} / ${sig.bodyDrift.toFixed(2)}` : '–'}</dd>
            <dt className="text-muted">Still for</dt><dd className="font-mono">{Math.round(stillFor)} s{askAfter !== null ? ` / ${askAfter} s` : ''}</dd>
            <dt className="text-muted">Fall check</dt><dd>{live.fallEnabled ? 'On (gravity)' : 'Off (microgravity)'}</dd>
            <dt className="text-muted">Pulse (finger clip)</dt><dd>{pulse.status === 'ok' ? 'OK' : pulse.status === 'lost' ? 'Lost' : pulse.status === 'clip_off' ? 'Clip off?' : 'No data'}</dd>
          </dl>
          {error && (
            <div className="mt-2 rounded-xl bg-alert/10 p-2.5 text-xs text-text ring-1 ring-alert/30">
              <p className="flex gap-1.5"><WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-alert" aria-hidden />{error}</p>
              <button className="btn mt-2 h-9 min-h-0 px-3 text-xs" onClick={() => void start()}>Try again</button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">If still too long: "Are you OK?", then the crew alarm. A lost pulse skips the check-in.</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-ok" aria-hidden /> On-device · no video stored · work modules only
          </p>
        </div>
      )}
    </aside>
  );
}
