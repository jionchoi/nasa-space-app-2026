// WebSockets: live vitals (/ws/vitals) with the sensor/replay source, and the alerts feed (/ws/alerts).
import { useSyncExternalStore } from 'react';
import type { AlertFeedMessage, SourceChanged, VitalsFrame } from '../types/contracts';
import mockVitals from '../mock/vitals.json';
import { setMock, WS_URL } from './mockFlag';

// ---- where live vitals come from right now (shown as the source chip in the header) ----

export type VitalsSource = 'sensor' | 'replay';
let source: VitalsSource | null = null;
const sourceListeners = new Set<() => void>();

function setSource(next: VitalsSource) {
  if (next === source) return;
  source = next;
  sourceListeners.forEach((fn) => fn());
}

export const useVitalsSource = () =>
  useSyncExternalStore((fn) => { sourceListeners.add(fn); return () => { sourceListeners.delete(fn); }; }, () => source);

// ---- replay controls (demo) ----

let replayStart: number | null = null; // one-shot jump, sent until a socket has opened with it
let replaySpeed: number | null = null;
export function setReplay(opts: { start?: number | null; speed?: number | null }) {
  if (opts.start !== undefined) replayStart = opts.start;
  if (opts.speed !== undefined) replaySpeed = opts.speed;
}

// Presenter "Pause" (demo mode): while paused, incoming vitals are dropped, so every screen holds still.
let vitalsPaused = false;
export function setVitalsPaused(paused: boolean) {
  vitalsPaused = paused;
}

export interface VitalsConnection {
  close(): void;
  /** Hint for the replay only (e.g. {posture: "stand"}); ignored in mock mode. */
  send(message: unknown): void;
}

let mockIndex = 0;
const pickMock = (persona: string) => {
  const table = mockVitals as Record<string, VitalsFrame[]>;
  return table[persona] ?? table.A;
};

/** Opens /ws/vitals. Reconnects 2 s after a drop; plays mock frames while the backend is unreachable. */
export function connectVitals(persona: string, onFrame: (frame: VitalsFrame) => void): VitalsConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let mockTimer: ReturnType<typeof setInterval> | undefined;

  const startMock = () => {
    if (mockTimer || closed) return;
    setMock(true);
    setSource('replay');
    const frames = pickMock(persona);
    // A demo jump (?start= or the presenter bar) also works offline: start the mock recording at that second.
    if (replayStart !== null) {
      mockIndex = Math.max(0, Math.floor(replayStart));
      replayStart = null;
    }
    mockTimer = setInterval(() => {
      if (vitalsPaused) return;
      onFrame({ ...frames[mockIndex++ % frames.length], t: new Date().toISOString(), source: 'replay' });
    }, 1000);
  };
  const stopMock = () => {
    clearInterval(mockTimer);
    mockTimer = undefined;
  };

  const open = () => {
    if (closed) return;
    const query = new URLSearchParams({ persona });
    const sentStart = replayStart;
    if (sentStart !== null) query.set('start', String(sentStart));
    if (replaySpeed !== null) query.set('speed', String(replaySpeed));
    let opened = false;
    const socket = new WebSocket(`${WS_URL}/ws/vitals?${query}`);
    ws = socket;
    socket.onopen = () => {
      opened = true;
      if (replayStart === sentStart) replayStart = null;
      stopMock();
      setMock(false);
    };
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data) as VitalsFrame | SourceChanged;
      if ('type' in data) {
        if (data.type === 'source_changed') setSource(data.source);
        return;
      }
      setSource(data.source);
      if (!vitalsPaused) onFrame(data);
    };
    socket.onclose = () => {
      if (closed) return;
      if (!opened) startMock();
      retry = setTimeout(open, 2000);
    };
  };
  open();

  return {
    close() {
      closed = true;
      clearTimeout(retry);
      stopMock();
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    },
    send(message) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    },
  };
}

/** Opens /ws/alerts for a persona: a snapshot on connect, then each new or changed alert. Reconnects after 3 s. */
export function connectAlerts(persona: string, onMessage: (message: AlertFeedMessage) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    if (closed) return;
    const socket = new WebSocket(`${WS_URL}/ws/alerts?persona=${encodeURIComponent(persona)}`);
    ws = socket;
    socket.onmessage = (e) => onMessage(JSON.parse(e.data) as AlertFeedMessage);
    socket.onclose = () => {
      if (!closed) retry = setTimeout(open, 3000);
    };
  };
  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };
}
