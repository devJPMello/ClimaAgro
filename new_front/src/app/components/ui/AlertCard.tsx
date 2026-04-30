import { AlertTriangle, MapPin, Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardBody } from './Card';
import { Badge } from './Badge';
import type { ClimateAlertTendencia } from '../../../lib/api/contracts/alerts';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface AlertCardProps {
  tipo: string;
  local: string;
  valorAtual: string;
  limiar: string;
  recomendacao: string;
  impactoEstimado: string;
  severidade: Severity;
  data: string;
  tendencia?: ClimateAlertTendencia;
  onClick?: () => void;
}

const severityLabels: Record<Severity, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

const iconBgMap: Record<Severity, string> = {
  critical: 'bg-severity-critical/10',
  high: 'bg-severity-high/10',
  medium: 'bg-severity-medium/10',
  low: 'bg-severity-low/10',
};

const iconColorMap: Record<Severity, string> = {
  critical: 'text-severity-critical',
  high: 'text-severity-high',
  medium: 'text-severity-medium',
  low: 'text-severity-low',
};

const tendenciaConfig: Record<ClimateAlertTendencia, { label: string; icon: typeof TrendingUp; color: string }> = {
  crescente: { label: 'Crescente', icon: TrendingUp, color: 'text-severity-high' },
  decrescente: { label: 'Decrescente', icon: TrendingDown, color: 'text-severity-low' },
  estavel: { label: 'Estável', icon: Minus, color: 'text-muted-foreground' },
};

export function AlertCard({ tipo, local, valorAtual, limiar, recomendacao, severidade, data, tendencia, onClick }: AlertCardProps) {
  const trend = tendencia ? tendenciaConfig[tendencia] : null;
  const TrendIcon = trend?.icon;

  return (
    <Card
      className="hover:shadow-md transition-shadow duration-200 cursor-pointer select-none"
      onClick={onClick}
    >
      <CardBody>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgMap[severidade]}`}>
              <AlertTriangle className={`w-5 h-5 ${iconColorMap[severidade]}`} />
            </div>
            <div>
              <h4 className="text-base font-semibold text-foreground leading-tight mb-1">{tipo}</h4>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span>{local}</span>
                <span>·</span>
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span>{data}</span>
              </div>
            </div>
          </div>
          <Badge variant={severidade}>{severityLabels[severidade]}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 py-3 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Valor Atual</p>
            <p className="text-sm font-medium text-foreground">{valorAtual}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Limiar</p>
            <p className="text-sm font-medium text-foreground">{limiar}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-3">{recomendacao}</p>

        <div className="flex items-center justify-between">
          {trend && TrendIcon ? (
            <div className={`flex items-center gap-1 text-xs ${trend.color}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              <span>Tendência: {trend.label}</span>
            </div>
          ) : (
            <div />
          )}
          <button
            className="text-xs text-primary hover:underline"
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            type="button"
          >
            Clique para detalhes →
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
