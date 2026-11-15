// Draws the body points unresponsive detection uses, for the debug panel.
//   mode "image": over the camera preview, with the torso's own axes (x along the shoulders, y toward the hips).
//   mode "torso": the same body redrawn IN TORSO COORDINATES, so it stays upright whatever the camera
//                 rotation; this is what the signals actually see.
// It reads the newest frame from a ref in its own animation loop, so the page does not re-render 10 times a second.
import { useEffect, useRef } from 'react';
import {
  LEFT_ELBOW, LEFT_HIP, LEFT_SHOULDER, LEFT_WRIST, NOSE, RIGHT_ELBOW, RIGHT_HIP, RIGHT_SHOULDER, RIGHT_WRIST, toTorso, torsoFrame,
} from '../../cv/torso';
import type { Vec } from '../../cv/types';
import { useCv } from '../../state/CvContext';

// Lines to draw: both arms, the shoulder line and the hips.
const BONES: [number, number][] = [
  [LEFT_SHOULDER, RIGHT_SHOULDER], [LEFT_SHOULDER, LEFT_ELBOW], [LEFT_ELBOW, LEFT_WRIST],
  [RIGHT_SHOULDER, RIGHT_ELBOW], [RIGHT_ELBOW, RIGHT_WRIST], [LEFT_HIP, RIGHT_HIP],
];
const POINTS = [NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP];

/** A theme color token as a canvas color string. */
const token = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim()})`;

export function SkeletonCanvas({ mode, className = '' }: { mode: 'image' | 'torso'; className?: string }) {
  const { frameRef, thresholds } = useCv();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let handle = 0;
    const draw = () => {
      handle = requestAnimationFrame(draw);
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (!el || !ctx) return;
      // Match the drawing size to the element's size on screen.
      const { clientWidth: w, clientHeight: h } = el;
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      ctx.clearRect(0, 0, w, h);
      const pose = frameRef.current?.pose;
      const torso = pose && thresholds ? torsoFrame(pose, thresholds.landmark_visibility) : null;
      if (!pose || !torso) return;

      // Where a body point lands on the canvas in each mode.
      const place = (p: Vec): Vec => {
        if (mode === 'image') return { x: p.x * w, y: p.y * h };
        // Torso view: origin a third of the way down, one shoulder width = a quarter of the width.
        const local = toTorso(p, torso);
        return { x: w / 2 + local.x * (w / 4), y: h / 3 + local.y * (w / 4) };
      };

      // Bones and points.
      ctx.lineWidth = 2;
      ctx.strokeStyle = token('ok');
      for (const [a, b] of BONES) {
        const pa = place(pose[a]); const pb = place(pose[b]);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      ctx.fillStyle = token('text');
      for (const i of POINTS) { const p = place(pose[i]); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }

      // The torso axes: x along the shoulders (blue), y toward the hips (amber), one shoulder width long.
      const origin = place(torso.origin);
      const tip = (axis: Vec) => place({ x: torso.origin.x + axis.x * torso.scale, y: torso.origin.y + axis.y * torso.scale });
      for (const [axis, color] of [[torso.xAxis, 'info'], [torso.yAxis, 'watch']] as const) {
        const end = tip(axis);
        ctx.strokeStyle = token(color); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      }
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, [frameRef, thresholds, mode]);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
