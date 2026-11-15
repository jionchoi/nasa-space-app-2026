import { glucoseText, glucoseUnitLabel, useCrewReference, useGlucoseUnit } from '../../lib/crewReference';
import type { CrewReference as Ref } from '../../types/contracts';

/** Glucose values in the file are mg/dL; everything else is shown exactly as in the file. */
function cell(ref: Ref, analyte: string, crew: string, tp: string, unit: 'mmol' | 'mgdl'): string {
  const value = ref.analytes[analyte]?.values[crew]?.[tp];
  if (analyte === 'glucose' && ref.analytes.glucose.units === 'mg/dL') return glucoseText(value, unit, ref.mgdl_per_mmol);
  return value ?? '–';
}

function unitOf(ref: Ref, analyte: string, unit: 'mmol' | 'mgdl'): string {
  return analyte === 'glucose' && ref.analytes.glucose.units === 'mg/dL' ? glucoseUnitLabel(unit) : ref.analytes[analyte].units;
}

function rangeOf(ref: Ref, analyte: string, unit: 'mmol' | 'mgdl'): string {
  const [lo, hi] = ref.analytes[analyte].range;
  if (analyte === 'glucose' && ref.analytes.glucose.units === 'mg/dL') {
    return `${glucoseText(lo, unit, ref.mgdl_per_mmol)}-${glucoseText(hi, unit, ref.mgdl_per_mmol)}`;
  }
  return `${lo}-${hi}`;
}

/** "Real crew reference" line for glucose: the four crew members before (L-3) and after (R+1) flight, as in the file.
 *  Reference only: no colours, no interpretation. */
export function CrewGlucoseLine({ className = '' }: { className?: string }) {
  const ref = useCrewReference();
  const [unit] = useGlucoseUnit();
  if (!ref?.analytes.glucose) return null;
  const { pre_flight: pre, post_flight: post } = ref.display;
  const list = (tp: string) => ref.crew.map((c) => `${c.id} ${cell(ref, 'glucose', c.id, tp, unit)}`).join(' · ');
  const u = unitOf(ref, 'glucose', unit);
  return (
    <div className={`text-xs leading-relaxed text-muted ${className}`}>
      <span className="font-medium text-soft">Real crew reference</span> (glucose, {u}): before flight ({pre}) {list(pre)};
      after flight ({post}) {list(post)}. Lab reference range {rangeOf(ref, 'glucose', unit)} {u}.{' '}
      <a href={ref.url} target="_blank" rel="noreferrer" className="text-info hover:underline">Source: {ref.source}</a>
    </div>
  );
}

/** Learn tab (metabolism): glucose, sodium and potassium before vs after flight per crew member, as in the file. */
export function CrewPanelTable() {
  const ref = useCrewReference();
  const [unit] = useGlucoseUnit();
  if (!ref) return null;
  const { pre_flight: pre, post_flight: post } = ref.display;
  const analytes = ['glucose', 'sodium', 'potassium'].filter((a) => ref.analytes[a]);
  return (
    <div className="flex flex-col gap-2">
      <span className="kicker text-muted">Real crew reference</span>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Blood values of the Inspiration4 crew before and after flight</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 pr-2 font-medium">Crew</th>
              {analytes.map((a) => (
                <th key={a} scope="colgroup" colSpan={2} className="py-1 pr-2 font-medium">
                  {ref.analytes[a].label} <span className="font-normal">({unitOf(ref, a, unit)}, range {rangeOf(ref, a, unit)})</span>
                </th>
              ))}
            </tr>
            <tr>
              <th />
              {analytes.flatMap((a) => [
                <th key={`${a}-pre`} scope="col" className="pr-2 font-normal">{pre}</th>,
                <th key={`${a}-post`} scope="col" className="pr-2 font-normal">{post}</th>,
              ])}
            </tr>
          </thead>
          <tbody className="font-mono text-soft">
            {ref.crew.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <th scope="row" className="py-1 pr-2 font-sans font-normal text-muted">{c.id}</th>
                {analytes.flatMap((a) => [
                  <td key={`${a}-pre`} className="py-1 pr-2">{cell(ref, a, c.id, pre, unit)}</td>,
                  <td key={`${a}-post`} className="py-1 pr-2">{cell(ref, a, c.id, post, unit)}</td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        {ref.timepoint_note} As in the file, no interpretation.{' '}
        <a href={ref.url} target="_blank" rel="noreferrer" className="text-info hover:underline">Source: {ref.source}</a> ({ref.licence})
      </p>
    </div>
  );
}
