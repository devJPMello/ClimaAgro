import { ApiError } from './errors';
import { resolveApiUrl } from './httpClient';

export type CreaExtracted = {
  fullName: string | null;
  creaRegistrationNumber: string | null;
  creaUf: string | null;
  cpf: string | null;
};

export type ScanCreaResponse = {
  success: boolean;
  data: {
    storageKey: string;
    extracted: CreaExtracted;
    warnings: string[];
    rawText?: string;
  };
};

export async function scanCreaCarteira(file: File, signal?: AbortSignal): Promise<ScanCreaResponse> {
  const form = new FormData();
  form.append('document', file);
  const url = resolveApiUrl('agronomist-onboarding/scan-crea');
  const res = await fetch(url, { method: 'POST', body: form, signal });
  const parsed = (await res.json().catch(() => ({}))) as ScanCreaResponse & {
    message?: string;
  };

  if (!res.ok) {
    const msg =
      typeof parsed === 'object' && parsed && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : res.statusText || 'Erro ao enviar imagem';
    throw new ApiError(msg, res.status, parsed);
  }

  return parsed as ScanCreaResponse;
}
