// The medical lead's workbook as the app reads it (backend/scripts/import_medical.py): Scientific References and the
// Master Health Indicator Catalog. Loaded once, with the offline mocks as fallback.
import { useEffect, useState } from 'react';
import { getIndicators, getReferences } from '../api/client';
import type { IndicatorsConfig, ReferencesConfig } from '../types/contracts';

let refs: Promise<ReferencesConfig> | null = null;
let inds: Promise<IndicatorsConfig> | null = null;

export function useReferences(): ReferencesConfig | null {
  const [value, setValue] = useState<ReferencesConfig | null>(null);
  useEffect(() => {
    let live = true;
    (refs ??= getReferences()).then((r) => { if (live) setValue(r); });
    return () => { live = false; };
  }, []);
  return value;
}

export function useIndicators(): IndicatorsConfig | null {
  const [value, setValue] = useState<IndicatorsConfig | null>(null);
  useEffect(() => {
    let live = true;
    (inds ??= getIndicators()).then((r) => { if (live) setValue(r); });
    return () => { live = false; };
  }, []);
  return value;
}
