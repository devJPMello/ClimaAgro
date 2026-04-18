import type { BrazilMapMetric } from './brazilMapConfig';
import { LEGEND_BY_METRIC } from './brazilMapConfig';

interface MapMetricLegendProps {
  metric: BrazilMapMetric;
  className?: string;
}

export function MapMetricLegend({ metric, className }: MapMetricLegendProps) {
  const items = LEGEND_BY_METRIC[metric];
  return (
    <div className={className}>
      <p className="text-sm mb-3 font-medium">Legenda</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
