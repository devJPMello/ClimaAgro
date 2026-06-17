import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/errors';

export type AsyncStatus = 'loading' | 'success' | 'error';

export interface UseAsyncResourceResult<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carrega um recurso assíncrono ao montar e quando `deps` mudam + expõe `reload`.
 * Passe `deps` (ex.: `[uf]`) quando o loader depender de estado externo.
 */
export function useAsyncResource<T>(factory: () => Promise<T>, deps: unknown[] = []): UseAsyncResourceResult<T> {
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  // Monotonically increasing counter. Each call to reload owns a generation;
  // results from earlier generations are silently discarded, preventing stale
  // responses from overwriting newer state when deps change or the component unmounts.
  const generationRef = useRef(0);

  const [status, setStatus] = useState<AsyncStatus>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const gen = ++generationRef.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await factoryRef.current();
      if (gen !== generationRef.current) return;
      setData(result);
      setStatus('success');
    } catch (e) {
      if (gen !== generationRef.current) return;
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Não foi possível carregar os dados.';
      setError(message);
      setStatus('error');
      setData(null);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Invalidate any in-flight request when deps change or component unmounts
    return () => { generationRef.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps são o gatilho externo explícito
  }, [reload, ...deps]);

  return { status, data, error, reload };
}
