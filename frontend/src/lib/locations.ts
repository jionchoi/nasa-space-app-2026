// The v4 sidebar's LOCATION list: one entry per place the astronaut can be. A location with planets (the surface rover)
// becomes one entry per planet ("Surface rover · Moon", "Surface rover · Mars"). Everything comes from
// environments.json. The REAL / EST radiation tag: a location is "real" only when its RadLab file exists on the
// backend, so the tag comes from the exported feed snapshot (mock/radiationFeeds.json, written by
// backend/scripts/export_mocks.py); the live feed of the current location overrides it (Sidebar).
import feeds from '../mock/radiationFeeds.json';
import type { Environment } from '../types/contracts';

const FEED_KIND = feeds as unknown as Record<string, { kind?: 'real' | 'estimated' } | null>;

/** On-screen name of the astronaut (one astronaut in v4; the personas A/B/C are demo scenarios). */
export const ASTRONAUT_NAME = 'Alex Moreno';

/** Personas shown as scenarios (demo mode and /admin only). The backend persona files are unchanged. */
export const SCENARIOS: { id: string; label: string }[] = [
  { id: 'A', label: 'Normal day' },
  { id: 'B', label: 'Slow drift' },
  { id: 'C', label: 'Acute event' },
];
export const scenarioLabel = (persona: string) => SCENARIOS.find((s) => s.id === persona)?.label ?? persona;

export interface LocationEntry {
  /** Env key: "iss", "moon", "mars", "rover:moon", "rover:mars". */
  key: string;
  envId: string;
  planet?: string;
  name: string;
  subtitle: string;
  radiation: 'real' | 'estimated' | 'unknown';
}

const feedKind = (key: string, feed?: Record<string, string>): LocationEntry['radiation'] =>
  FEED_KIND[key]?.kind ?? (feed?.estimate ? 'estimated' : 'unknown');

export function locationEntries(environments: Environment[]): LocationEntry[] {
  const out: LocationEntry[] = [];
  for (const env of environments) {
    if (env.planets) {
      for (const [planet, p] of Object.entries(env.planets)) {
        out.push({ key: `${env.id}:${planet}`, envId: env.id, planet, name: `${env.label} · ${p.label}`,
          subtitle: p.subtitle ?? env.subtitle ?? '', radiation: feedKind(`${env.id}:${planet}`, p.radiation_feed ?? env.radiation_feed) });
      }
    } else {
      out.push({ key: env.id, envId: env.id, name: env.label, subtitle: env.subtitle ?? '', radiation: feedKind(env.id, env.radiation_feed) });
    }
  }
  return out;
}

/** The entry for the current env key ("rover" alone matches the first rover planet). */
export function currentLocation(entries: LocationEntry[], env: string): LocationEntry | undefined {
  return entries.find((e) => e.key === env) ?? entries.find((e) => e.envId === env.split(':')[0]);
}
