import { useStatusLabel } from '../../state/AppContext';
import { STATUS_CLASS } from '../../lib/status';
import type { Status } from '../../types/contracts';
import { Sparkline } from '../common/Sparkline';

interface Props {
  name: string;
  value: string;
  unit: string;
  status: Status;
  /** Last 60 s of values for the sparkline. */
  series: number[];
  /** "Your usual: 61 bpm" (personal baseline), or nothing. */
  usual?: string;
  /** Poor signal: grey the card out. */
  dim?: boolean;
  /** Smaller version for the emergency screen. */
  compact?: boolean;
}

/** One live vital: name and status pill, big number, 60-second sparkline, personal usual. 3px top border in the status color. */
export function VitalCard({ name, value, unit, status, series, usual, dim, compact }: Props) {
  const statusLabel = useStatusLabel();
  const cls = STATUS_CLASS[status];
  return (
    <div className={`flex min-w-0 flex-col rounded-[14px] border border-t-[3px] bg-panel transition ${
      compact ? 'gap-1 px-3.5 py-2.5' : 'gap-2 px-[18px] py-4'} ${status === 'green' ? 'border-line' : cls.edge} ${cls.top} ${dim ? 'opacity-40 grayscale' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold text-soft">{name}</span>
        <span className={`pill ${cls.soft} ${cls.text}`}>{statusLabel(status)}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono font-semibold leading-none text-text ${compact ? 'text-[32px]' : 'text-5xl'}`}>{value}</span>
        <span className="text-base text-muted">{unit}</span>
      </div>
      <Sparkline values={series} className={`w-full ${compact ? 'h-6' : 'h-10'} ${cls.text}`} width={120} height={28} strokeWidth={2} />
      {usual && <span className="text-xs text-muted">{usual}</span>}
    </div>
  );
}
