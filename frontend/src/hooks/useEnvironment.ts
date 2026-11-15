import { useEffect, useState } from 'react';
import { getCabin, getRadiation } from '../api/client';
import type { CabinSummary, RadiationSummary } from '../types/contracts';

/** Radiation for the crew member: daily dose, mission total and the active solar event (polled every 5 s). */
export function useRadiation(persona: string, env: string) {
  const [data, setData] = useState<RadiationSummary | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => getRadiation(persona, env).then((d) => { if (live) setData(d); });
    load();
    const id = setInterval(load, 5000);
    return () => { live = false; clearInterval(id); };
  }, [persona, env]);
  return data;
}

/** Simulated cabin environment (CO2, temperature, noise), polled every 30 s. */
export function useCabin() {
  const [data, setData] = useState<CabinSummary | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => getCabin().then((d) => { if (live) setData(d); });
    load();
    const id = setInterval(load, 30_000);
    return () => { live = false; clearInterval(id); };
  }, []);
  return data;
}
