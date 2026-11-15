// Locations and the surface rover's planet. Same rules as backend store.environment / env_keys:
// the env key is the location id, or "<id>:<planet>" for a location with planets ("rover:mars").
import type { Environment } from '../types/contracts';

/** The env key for a location (and planet, if it has planets). */
export function envKey(env: Environment | undefined, planet?: string | null): string {
  if (!env) return '';
  if (!env.planets) return env.id;
  const p = planet && env.planets[planet] ? planet : env.planet ?? Object.keys(env.planets)[0];
  return `${env.id}:${p}`;
}

/** The location for an env key, with the planet's delay, advice note and advice_as filled in. */
export function resolveEnv(environments: Environment[], key: string): Environment | undefined {
  const [base, planet] = key.split(':');
  const found = environments.find((e) => e.id === base);
  if (!found?.planets) return found;
  const id = planet && found.planets[planet] ? planet : found.planet ?? Object.keys(found.planets)[0];
  const p = found.planets[id];
  return { ...found, key: `${found.id}:${id}`, planet: id, delay_s: p.delay_s, advice_note: p.advice_note ?? found.advice_note,
    advice_as: p.advice_as, planet_label: p.label };
}

/** Keys to look up a per-location text, most specific first: "rover:mars", "rover", then "mars". */
export function envKeys(key: string, info?: Environment): string[] {
  const keys = [key];
  const base = key.split(':')[0];
  if (base !== key) keys.push(base);
  if (info?.advice_as) keys.push(info.advice_as);
  return keys;
}

/** First entry of a per-location table for these keys, else table.default. */
export function pickForEnv<T>(table: Record<string, T> | undefined, keys: string[]): T | undefined {
  if (!table) return undefined;
  for (const k of keys) if (table[k]) return table[k];
  return table.default;
}

/** Texts not yet reviewed start with "DRAFT: ". Strip it for display (a badge shows the draft state instead). */
export const undraft = (text: string | undefined) => (text ?? '').replace(/^DRAFT:\s*/, '');
export const isDraft = (text: string | undefined) => /^DRAFT/.test(text ?? '');

/** Notes for a protocol step's equipment when this location has a limited medical kit (environments.json kit_notes). */
export function kitNotes(env: Environment | undefined, equipment: string[] | undefined): string[] {
  if (env?.medical_kit !== 'limited' || !equipment?.length) return [];
  const notes = equipment.map((e) => undraft(env.kit_notes?.[e] ?? env.kit_notes?.default)).filter(Boolean);
  return [...new Set(notes)];
}
