/** Always-visible disclaimer (medical lead's sheet: never label the app clinically validated). */
export const RESEARCH_NOTE = 'Research prototype · not clinically validated';

export function ResearchNote({ className = '' }: { className?: string }) {
  return (
    <p role="note" className={`text-[11px] font-medium text-watch ${className}`}>{RESEARCH_NOTE}</p>
  );
}
