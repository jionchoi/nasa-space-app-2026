// Shared "backend unreachable, showing mock data" flag. True also drives the "On-board" indicator in the header.
import { useSyncExternalStore } from 'react';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
export const WS_URL = API_URL.replace(/^http/, 'ws');

export let usingMock = false;
const listeners = new Set<() => void>();

export function setMock(value: boolean) {
  if (value === usingMock) return;
  usingMock = value;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const useUsingMock = () => useSyncExternalStore(subscribe, () => usingMock);
