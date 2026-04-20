import { useEffect, useState } from 'react';
import { DEFAULT_IBGE_UF_ID } from '../geo/ibgeMunicipioEnv';
import { fetchIbgeMunicipiosList, getTocantinsMunicipiosFallbackRows } from '../geo/fetchIbgeMunicipios';
import { TO_CITY_VALUE_TO_NAME } from '../geo/tocantinsCities';

export type MunicipioSelectOption = { value: string; label: string };

function fallbackMunicipioOptions(ufId?: string): MunicipioSelectOption[] {
  const id = ufId ?? DEFAULT_IBGE_UF_ID;
  if (String(id) === '17') {
    return getTocantinsMunicipiosFallbackRows().map((m) => ({ value: m.nome, label: m.nome }));
  }
  const nomes = [...new Set(Object.values(TO_CITY_VALUE_TO_NAME))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return nomes.map((nome) => ({ value: nome, label: nome }));
}

/**
 * Opções para `<Select label="Município" />` — nomes oficiais IBGE (`value` = nome, como em `geo_data.name`).
 */
export function useIbgeMunicipioSelectOptions(ufId?: string) {
  const [options, setOptions] = useState<MunicipioSelectOption[]>(() => fallbackMunicipioOptions(ufId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const rows = await fetchIbgeMunicipiosList(ufId);
        if (cancelled) return;
        setOptions(rows.map((m) => ({ value: m.nome, label: m.nome })));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Erro ao carregar municípios.');
        setOptions(fallbackMunicipioOptions(ufId));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ufId]);

  return { options, loading, error };
}
