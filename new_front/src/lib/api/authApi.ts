import { httpClient } from './httpClient';

export type ProfileType = 'standard' | 'agronomist';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  profileType: ProfileType;
  creaRegistrationNumber?: string;
  creaUf?: string;
  cpf?: string;
  creaDocumentStorageKey?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      agronomistApprovalStatus: string | null;
    };
    token: string;
  };
}

export async function registerAccount(payload: RegisterPayload) {
  return httpClient.post<RegisterResponse>('auth/register', payload);
}
