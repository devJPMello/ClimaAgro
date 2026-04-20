import { DEFAULT_IBGE_UF_ID, getIbgeLocalidadesMunicipiosUrl } from './ibgeMunicipioEnv';
import tocantinsMunicipiosIbge from './tocantinsMunicipiosIbge.json';

export type IbgeMunicipioRow = { id: number; nome: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function parseIbgeMunicipiosArray(data: unknown): IbgeMunicipioRow[] {
  if (!Array.isArray(data)) return [];
  const out: IbgeMunicipioRow[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = Number(item.id);
    const nome = typeof item.nome === 'string' ? item.nome.trim() : '';
    if (!Number.isFinite(id) || !nome) continue;
    out.push({ id, nome });
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return out;
}

/** Lista embutida (139 municípios) para quando a API do IBGE falha (CORS, offline, etc.). */
export function getTocantinsMunicipiosFallbackRows(): IbgeMunicipioRow[] {
  return parseIbgeMunicipiosArray(tocantinsMunicipiosIbge);
}

/**
 * Busca a lista oficial de municípios (id + nome) na URL configurada em `VITE_IBGE_LOCALIDADES_MUNICIPIOS_URL`.
 * Para a UF 17 (TO), usa lista local como fallback se a rede falhar ou vier vazia.
 */
export async function fetchIbgeMunicipiosList(ufId?: string): Promise<IbgeMunicipioRow[]> {
  const id = ufId ?? DEFAULT_IBGE_UF_ID;
  try {
    const url = getIbgeLocalidadesMunicipiosUrl(ufId);
    const res = await fetch(url);
    if (res.ok) {
      const data: unknown = await res.json();
      const out = parseIbgeMunicipiosArray(data);
      if (out.length > 0) return out;
    }
  } catch {
    /* rede / CORS / offline — segue para fallback TO */
  }
  if (String(id) === '17') {
    return getTocantinsMunicipiosFallbackRows();
  }
  throw new Error('Falha ao buscar municípios (IBGE) e sem lista local para esta UF.');
}
