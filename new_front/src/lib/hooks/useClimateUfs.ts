import { useEffect, useState } from 'react';
import { listClimateUfs } from '../api/climateApi';

export type UfOption = { value: string; label: string };

// Module-level cache shared across all hook instances — one fetch per session
let _cache: UfOption[] | null = null;
let _fetchPromise: Promise<UfOption[]> | null = null;
let _fetchedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function fetchClimateUfs(): Promise<UfOption[]> {
  if (_cache && Date.now() - _fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(_cache);
  }
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = listClimateUfs()
    .then((data) => {
      _cache = data;
      _fetchedAt = Date.now();
      _fetchPromise = null;
      return data;
    })
    .catch((err) => {
      _fetchPromise = null;
      throw err;
    });
  return _fetchPromise;
}

export function useClimateUfs(): { ufs: UfOption[]; loading: boolean; error: string | null } {
  const [ufs, setUfs] = useState<UfOption[]>(_cache ?? []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache && Date.now() - _fetchedAt < CACHE_TTL_MS) {
      setUfs(_cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchClimateUfs()
      .then((data) => {
        if (!cancelled) { setUfs(data); setLoading(false); }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar UFs');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { ufs, loading, error };
}
