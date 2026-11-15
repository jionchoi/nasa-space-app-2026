// Debug panel for unresponsive detection, on /admin only. Shows every signal, the pulse status and the timers
// live, draws the body-relative skeleton, lets the team try other numbers with sliders (this browser session
// only; the real numbers stay in thresholds.json), copies everything as JSON for Yenna, and has a demo trigger.
import { ArrowCounterClockwise, Copy, Eye, Lightning } from '@phosphor-icons/react';
import { useState } from 'react';
import type { CvOverrides } from '../../cv/thresholds';
import type { CvThresholds } from '../../cv/types';
import { useCv } from '../../state/CvContext';
import { Card } from '../common/Card';
import { CvSliders } from './CvSliders';
import { SkeletonCanvas } from './SkeletonCanvas';

/** A number with a fixed number of decimals, or a dash. */
const fmt = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? '–' : value.toFixed(digits));

/** One label/value line. `hot` turns the value amber when it points toward "unresponsive". */
function Row({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-right font-mono text-sm ${hot ? 'text-watch' : ''}`}>{value}</dd>
    </div>
  );
}

export function CvDebugPanel() {
  const { phase, live, pulse, thresholds, fileThresholds, overrides, setOverrides, forceSuspected, start, skeletonVisible, setSkeletonVisible } = useCv();
  const [copied, setCopied] = useState(false);
  const s = live.signals;
  const state = live.state;
  const t = thresholds;

  // Timers from the detector's state and its clock.
  const needed = t ? (pulse.vitalsRed ? t.suspect_after_s_with_red_vitals : t.suspect_after_s) : 0;
  const highFor = state?.highSince != null ? live.now - state.highSince : null;
  const checkInLeft = state?.checkInDeadline != null ? Math.max(0, state.checkInDeadline - live.now) : null;
  const resumeIn = state?.resumeAt != null ? Math.max(0, state.resumeAt - live.now) : null;

  /** Everything on this panel as JSON, ready to paste into a message or into thresholds.json. */
  const copy = async () => {
    const snapshot = { thresholds_in_use: t, overrides, file_values: fileThresholds, phase, state, signals: s, pulse,
      working_posture_baseline: live.baseline, is_sleep_time: live.isSleepTime, paused: live.paused, fall_enabled: live.fallEnabled, fps: live.fps };
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="mt-4" inner="p-5">
      <div className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4 text-info" aria-hidden /> Unresponsive detection (debug)</div>
      <p className="mt-1 text-sm text-muted">
        Camera values are relative to the torso (sw = shoulder widths), so camera rotation and floating do not change them.
        The pulse check runs even with the camera off. Sliders change numbers for this browser session only.
      </p>
      {phase === 'off' && <button className="btn btn-primary mt-4" onClick={() => void start()}>Turn the camera on</button>}

      <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <dl>
          <Row label="Phase" value={phase} />
          <Row label="State" value={state?.name ?? '–'} hot={!!state && state.name !== 'MONITORING'} />
          <Row label="Why" value={state?.reason ?? '–'} />
          <Row label="Score high for" value={highFor === null ? '–' : `${fmt(highFor, 1)} of ${needed} s`} hot={highFor !== null} />
          <Row label="Check-in left" value={checkInLeft === null ? '–' : `${fmt(checkInLeft, 1)} s`} />
          <Row label="Monitoring again in" value={resumeIn === null ? '–' : `${fmt(resumeIn, 0)} s`} />
          <Row label="Sleep hours / paused" value={`${live.isSleepTime ? 'sleep' : 'awake'} / ${live.paused ? 'paused' : 'no'}`} />
          <Row label="PPG pulse" value={`${pulse.status} · ${pulse.reason}`} hot={pulse.status !== 'ok'} />
          <Row label="PPG quality / amplitude" value={`${fmt(pulse.quality)} / ${pulse.amplitudeRatio === null ? 'not sent' : `${fmt(pulse.amplitudeRatio)} of normal`}`} />
          <Row label="No beats for" value={`${fmt(pulse.secondsWithoutBeats, 0)} s`} hot={pulse.secondsWithoutBeats > 2} />
          <Row label="Still hand (clean PPG) / red vitals" value={`${pulse.stillHand ? 'yes' : 'no'} / ${pulse.vitalsRed ? 'yes' : 'no'}`} hot={pulse.vitalsRed} />
        </dl>
        <dl>
          <Row label="Someone present" value={live.present ? 'yes' : 'no'} hot={!live.present} />
          <Row label="Limb motion (sw/s)" value={`${fmt(s?.limbMotion, 3)} / still ≤ ${t?.limb_motion_low}`} hot={!!s && !!t && s.limbMotion <= t.limb_motion_low} />
          <Row label="Body drift (sw/s)" value={`${fmt(s?.bodyDrift, 3)} · smooth ${fmt(s?.driftScore)}`} hot={!!s && s.driftScore > 0.5} />
          <Row label="Neutral body posture" value={`${fmt(s?.nbpScore)} (working ${fmt(live.baseline)})`} hot={!!s && s.nbpScore > 0.5} />
          <Row label="Eyes closed for" value={`${fmt(s?.eyesClosedSeconds, 1)} s`} hot={!!s && s.eyesClosedSeconds > 0} />
          <Row label="No blink for / blinks per min" value={`${fmt(s?.secondsSinceBlink, 0)} s / ${s?.blinksPerMinute ?? '–'}`} />
          <Row label="Unresponsive score" value={`${fmt(s?.unresponsiveScore)} / ≥ ${t?.unresponsive_threshold}`} hot={!!s && !!t && s.unresponsiveScore >= t.unresponsive_threshold} />
          <Row label="Fall (gravity only)" value={live.fallEnabled ? (s?.fallDetected ? 'yes' : 'no') : 'off here'} />
          <Row label="Calibration left / fps" value={`${phase === 'calibrating' ? `${fmt(live.calibrationLeftS, 1)} s` : '–'} / ${live.fps}`} />
        </dl>
      </div>

      {/* The body-relative skeleton: what the signals see. Stays upright whatever the camera rotation. */}
      <div className="mt-4 flex flex-wrap items-start gap-4 border-t border-white/[0.06] pt-4">
        <SkeletonCanvas mode="torso" className="h-48 w-48 rounded-card bg-inset" />
        <div className="max-w-xs text-xs text-muted">
          <p>Torso view: origin between the shoulders, blue = along the shoulders, amber = toward the hips. Arms floating up
            and bent here = neutral body posture.</p>
          <label className="mt-3 flex min-h-touch items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={skeletonVisible} onChange={(e) => setSkeletonVisible(e.target.checked)} />
            Draw the skeleton on the camera preview
          </label>
        </div>
      </div>

      {t && (
        <CvSliders thresholds={t} overrides={overrides}
          onNumber={(key: keyof CvOverrides, value: number) => setOverrides({ ...overrides, [key]: value })}
          onWeight={(key: keyof CvThresholds['weights'], value: number) => setOverrides({ ...overrides, weights: { ...overrides.weights, [key]: value } })} />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
        <button className="btn" onClick={() => void copy()}><Copy className="h-4 w-4" aria-hidden /> {copied ? 'Copied' : 'Copy as JSON'}</button>
        <button className="btn" onClick={() => setOverrides({})} disabled={Object.keys(overrides).length === 0}>
          <ArrowCounterClockwise className="h-4 w-4" aria-hidden /> Back to file values
        </button>
        <button className="btn btn-danger" onClick={forceSuspected} disabled={phase !== 'running'} title="Skips the wait and shows &quot;Are you OK?&quot; now. Debug only.">
          <Lightning className="h-4 w-4" weight="fill" aria-hidden /> Demo trigger
        </button>
        {phase !== 'running' && <span className="text-xs text-muted">Demo trigger needs the camera on and calibrated.</span>}
      </div>
    </Card>
  );
}
