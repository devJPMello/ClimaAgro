import type { BrazilMapMetric } from './brazilMapConfig';
import { LEGEND_BY_METRIC, normalizeBrazilMapMetric } from './brazilMapConfig';

interface MapMetricLegendProps {
  metric: BrazilMapMetric;
  className?: string;
  /** Observação exibida no fim da legenda (ex.: por que só alguns anos aparecem no filtro). */
  note?: string;
}

export function MapMetricLegend({ metric, className, note }: MapMetricLegendProps) {
  const items = LEGEND_BY_METRIC[normalizeBrazilMapMetric(metric)];
  return (
    <div className={className}>
      <p className="text-sm mb-3 font-medium">Legenda</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded shrink-0 border border-border/60"
              style={{ backgroundColor: item.color, opacity: 0.85 }}
            />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
      {note && <p className="mt-3 text-xs text-muted-foreground leading-snug">{note}</p>}
    </div>
  );
}
