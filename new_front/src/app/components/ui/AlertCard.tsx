import { AlertTriangle, MapPin } from 'lucide-react';
import { Card, CardBody } from './Card';
import { Badge } from './Badge';

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
}

export function AlertCard({
  tipo,
  local,
  valorAtual,
  limiar,
  recomendacao,
  impactoEstimado,
  severidade,
  data,
}: AlertCardProps) {
  const severityLabels: Record<Severity, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    critical: 'Crítica',
  };

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardBody>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                severidade === 'critical'
                  ? 'bg-severity-critical/10'
                  : severidade === 'high'
                  ? 'bg-severity-high/10'
                  : severidade === 'medium'
                  ? 'bg-severity-medium/10'
                  : 'bg-severity-low/10'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  severidade === 'critical'
                    ? 'text-severity-critical'
                    : severidade === 'high'
                    ? 'text-severity-high'
                    : severidade === 'medium'
                    ? 'text-severity-medium'
                    : 'text-severity-low'
                }`}
              />
            </div>
            <div>
              <h4 className="text-base text-foreground mb-1">{tipo}</h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{local}</span>
                <span>•</span>
                <span>{data}</span>
              </div>
            </div>
          </div>
          <Badge variant={severidade}>{severityLabels[severidade]}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Valor Atual</p>
            <p className="text-sm text-foreground">{valorAtual}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Limiar</p>
            <p className="text-sm text-foreground">{limiar}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Recomendação</p>
            <p className="text-foreground">{recomendacao}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Impacto Estimado</p>
            <p className="text-foreground">{impactoEstimado}</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
