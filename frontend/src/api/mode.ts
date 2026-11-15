import type { SignalMode } from '../types/signals';
const initial = new URLSearchParams(window.location.search).get('mode') ?? sessionStorage.getItem('crewsense-mode');
let mode: SignalMode = initial === 'measurement' || initial === 'research' ? initial : 'demo';
sessionStorage.setItem('crewsense-mode', mode);
export const currentMode = () => mode;
export function setCurrentMode(next: SignalMode) { mode = next; sessionStorage.setItem('crewsense-mode', next); }
