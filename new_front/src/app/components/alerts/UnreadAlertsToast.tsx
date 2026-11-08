import { TriangleAlert, X } from 'lucide-react';
import type { ClimateAlertDto } from '../../../lib/api/contracts/alerts';
import { UF_NOME } from '../../../lib/geo/brazilStatesMalha';

interface Props {
  alerts: ClimateAlertDto[];
  uf: string | null;
  onVerAlertas: () => void;
  onDispensar: () => void;
}

const MAX_LISTADOS = 3;

/** Aviso exibido ao abrir o sistema quando há alertas altos ou críticos não vistos na UF do perfil. */
export function UnreadAlertsToast({ alerts, uf, onVerAlertas, onDispensar }: Props) {
  const criticos = alerts.filter((a) => a.severidade === 'critical');
  const altos = alerts.filter((a) => a.severidade === 'high');
  // Críticos primeiro, depois altos.
  const listados = [...criticos, ...altos].slice(0, MAX_LISTADOS);
  const restantes = alerts.length - listados.length;
  const local = uf ? `${UF_NOME[uf] ?? uf} (${uf})` : 'sua região';
  const temCritico = criticos.length > 0;

  return (
    <div
      role="alert"
      className={`w-[min(420px,calc(100vw-32px))] rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden ${
        temCritico ? 'border-destructive/40' : 'border-orange-400/40'
      }`}
    >
      <div className={`h-1 ${temCritico ? 'bg-destructive' : 'bg-orange-500'}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              temCritico ? 'bg-destructive/15 text-destructive' : 'bg-orange-500/15 text-orange-500'
            }`}
          >
            <TriangleAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">Alertas climáticos em {local}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {criticos.length > 0 && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  {criticos.length} crítico{criticos.length > 1 ? 's' : ''}
                </span>
              )}
              {altos.length > 0 && (
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-600 dark:text-orange-400">
                  {altos.length} alto{altos.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onDispensar}
            aria-label="Fechar aviso"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {listados.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  a.severidade === 'critical' ? 'bg-destructive' : 'bg-orange-500'
                }`}
              />
              <span className="truncate font-medium">{a.tipo}</span>
              {a.data && <span className="ml-auto shrink-0 text-muted-foreground">{a.data}</span>}
            </li>
          ))}
        </ul>
        {restantes > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            e mais {restantes} alerta{restantes > 1 ? 's' : ''}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDispensar}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Dispensar
          </button>
          <button
            type="button"
            onClick={onVerAlertas}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ver alertas
          </button>
        </div>
      </div>
    </div>
  );
}
