import { Info } from 'lucide-react';
import { getYearRangeNote } from '../../../lib/filters/appFilters';

/** Aviso curto, junto dos filtros de ano, explicando por que só alguns anos aparecem. */
export function YearRangeNote({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${className}`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{getYearRangeNote()}</span>
    </p>
  );
}
