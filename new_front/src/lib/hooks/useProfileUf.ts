import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { getMyDualProfile } from '../api/dualProfileApi';

/** UF salva no perfil (ex: "TO") e se a consulta ao perfil já terminou (com ou sem UF). */
export function useProfileUfState(): { uf: string | null; loaded: boolean } {
  const { user, isLoaded } = useUser();
  const [profileUf, setProfileUf] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user?.id) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void getMyDualProfile(user.id)
      .then((p) => {
        if (!cancelled && p?.uf && /^[A-Z]{2}$/.test(p.uf)) {
          setProfileUf(p.uf);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isLoaded]);

  return { uf: profileUf, loaded };
}

/** Retorna a UF salva no perfil do usuário (ex: "TO"), ou null enquanto carrega / se não configurada. */
export function useProfileUf(): string | null {
  return useProfileUfState().uf;
}
