import { useEffect, useState, type ReactNode } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { Skeleton } from './Skeleton';

/** Após alguns segundos carregando, avisa que a API pode estar acordando (plano gratuito). */
export function SlowLoadingHint({ delayMs = 5000 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  if (!visible) return null;
  return (
    <p
      role="status"
      className="text-center text-sm text-muted-foreground animate-in fade-in duration-500"
    >
      O servidor está iniciando, isso pode levar até 1 minuto no primeiro acesso…
    </p>
  );
}

function SkeletonBox({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

function KpiSkeleton() {
  return (
    <SkeletonBox className="p-4 sm:p-6">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-9 w-9 sm:h-11 sm:w-11 rounded-lg shrink-0" />
      </div>
    </SkeletonBox>
  );
}

function CardHeaderSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-4 border-b border-border space-y-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-64 max-w-full" />
    </div>
  );
}

/** Generic fallback used by AsyncStateView. */
export function GenericPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <SkeletonBox>
        <CardHeaderSkeleton />
        <div className="p-4 sm:p-6">
          <Skeleton className="h-48 w-full" />
        </div>
      </SkeletonBox>
      <SlowLoadingHint />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <SkeletonBox>
        <CardHeaderSkeleton />
        <div className="p-4 sm:p-6 flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-56 sm:w-64 rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 bg-muted/40 border-b border-border space-y-2">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="px-4 py-3 space-y-3">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-3.5 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-12 ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SkeletonBox>
      <SlowLoadingHint />
    </div>
  );
}

export function AlertasSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando alertas">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} className="px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-10" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </SkeletonBox>
        ))}
      </div>
      <SkeletonBox>
        <CardHeaderSkeleton />
        <div className="p-4 sm:p-6 space-y-3">
          <div className="flex flex-wrap gap-3 pb-2">
            <Skeleton className="h-9 w-full sm:w-48" />
            <Skeleton className="h-9 w-full sm:w-40" />
            <Skeleton className="h-9 w-full sm:w-40" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Skeleton className="h-10 w-1 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 sm:w-1/2" />
                <Skeleton className="h-3 w-1/2 sm:w-1/3" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full hidden sm:block" />
            </div>
          ))}
        </div>
      </SkeletonBox>
      <SlowLoadingHint />
    </div>
  );
}

/** Mapa Climático e Mapa de Produtividade: filtros à esquerda, mapa à direita. */
export function MapPageSkeleton({ filters = 3 }: { filters?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando mapa">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <SkeletonBox className="lg:col-span-1 self-start">
          <div className="px-4 sm:px-6 py-4 border-b border-border">
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
            {Array.from({ length: filters }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
            <div className="pt-4 border-t border-border space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        </SkeletonBox>
        <div className="lg:col-span-3">
          <MapAreaSkeleton />
        </div>
      </div>
      <SlowLoadingHint />
    </div>
  );
}

/** Área do mapa enquanto o GeoJSON ou os dados carregam. */
export function MapAreaSkeleton() {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-muted/40 h-[300px] sm:h-[450px] lg:h-[600px]">
      <Skeleton className="absolute inset-0 rounded-xl !bg-muted-foreground/10" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <MapIcon className="w-10 h-10 animate-pulse opacity-60" aria-hidden="true" />
        <span className="text-sm">Carregando mapa…</span>
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  const bars = [45, 70, 55, 85, 60, 40, 75, 50, 65, 80, 55, 70];
  return (
    <div className="flex items-end gap-2 sm:gap-3 px-2" style={{ height }} aria-busy="true" aria-label="Carregando gráfico">
      {bars.map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function StatsListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListItemsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
