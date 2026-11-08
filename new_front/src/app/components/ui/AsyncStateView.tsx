import type { ReactNode } from 'react';
import type { AsyncStatus } from '../../../lib/hooks/useAsyncResource';
import { Button } from './Button';
import { GenericPageSkeleton } from './PageSkeletons';

interface AsyncStateViewProps<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
  onRetry: () => void;
  /** Quando `success` e `isEmpty(data)` retorna true, mostra `empty` em vez de `children`. */
  isEmpty?: (data: T) => boolean;
  loading?: ReactNode;
  empty: ReactNode;
  children: (data: T) => ReactNode;
}

export function AsyncStateView<T>({
  status,
  data,
  error,
  onRetry,
  isEmpty,
  loading,
  empty,
  children,
}: AsyncStateViewProps<T>) {
  if (status === 'loading') {
    return (
      <>
        {loading ?? <GenericPageSkeleton />}
      </>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{error ?? 'Erro ao carregar.'}</p>
        <Button type="button" variant="secondary" onClick={() => void onRetry()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (data !== null && isEmpty?.(data)) {
    return <>{empty}</>;
  }

  if (data !== null) {
    return <>{children(data)}</>;
  }

  return null;
}
