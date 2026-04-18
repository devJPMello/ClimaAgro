import { ApiError } from './errors';

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;

/** Garante sufixo `/api` (rotas Express estão em `/api/...`). Aceita `http://host:5000` ou `http://host:5000/api`. */
function normalizeApiBaseUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  if (!t) return '';
  if (/\/api$/i.test(t)) return t;
  return `${t}/api`;
}

/**
 * Base da API REST.
 * - Dev + API em localhost: `/api` (proxy do Vite → backend).
 * - Produção / preview: `VITE_API_URL` normalizada (sempre termina em `/api`).
 */
function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  const fromEnv = normalizeApiBaseUrl(raw);
  const pointsToLocalhost =
    !fromEnv || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw || fromEnv);

  if (import.meta.env.DEV && pointsToLocalhost) {
    return '/api';
  }
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) {
    return '/api';
  }
  throw new Error(
    'Defina VITE_API_URL no .env do front (ex.: VITE_API_URL=https://api.seudominio.com) na build de produção.'
  );
}

function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return path;
  const base = getApiBase();
  const p = path.replace(/^\//, '');
  return `${base}/${p}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpClientOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), timeoutMs);
  const external = init.signal;
  if (external) {
    external.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(t);
  }
}

export async function httpRequest<T>(
  method: HttpMethod,
  path: string,
  options: HttpClientOptions & { body?: unknown; retry?: boolean } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, signal, body, retry = method === 'GET' } = options;
  const url = resolveUrl(path);

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    signal,
  };

  if (body !== undefined && method !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      const parsed = await parseBody(response);

      if (!response.ok) {
        const msg =
          typeof parsed === 'object' && parsed !== null && 'message' in parsed
            ? String((parsed as { message: unknown }).message)
            : response.statusText || 'Erro na requisição';
        throw new ApiError(msg || `HTTP ${response.status}`, response.status, parsed);
      }

      return parsed as T;
    } catch (e) {
      if (e instanceof ApiError && retry && method === 'GET' && (e.status === 429 || e.status >= 500)) {
        if (attempt < MAX_RETRIES) {
          attempt += 1;
          await sleep(400 * attempt);
          continue;
        }
      }
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new ApiError('Tempo esgotado. Tente novamente.', 0);
      }
      if (
        e instanceof TypeError &&
        /failed to fetch|network|load failed/i.test(String((e as Error).message))
      ) {
        throw new ApiError(
          'Não foi possível conectar à API. Em dev, suba o backend (porta 5000) e use `npm run dev` no front para o proxy /api.',
          0
        );
      }
      throw e;
    }
  }
}

export const httpClient = {
  get: <T>(path: string, options?: HttpClientOptions) => httpRequest<T>('GET', path, { ...options, retry: true }),
  post: <T>(path: string, body?: unknown, options?: HttpClientOptions) =>
    httpRequest<T>('POST', path, { ...options, body, retry: false }),
};
