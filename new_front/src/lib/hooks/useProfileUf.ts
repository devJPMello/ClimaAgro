import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { getMyDualProfile } from '../api/dualProfileApi';

/** Retorna a UF salva no perfil do usuário (ex: "TO"), ou null enquanto carrega / se não configurada. */
export function useProfileUf(): string | null {
  const { user } = useUser();
  const [profileUf, setProfileUf] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void getMyDualProfile(user.id)
      .then((p) => {
        if (!cancelled && p?.uf && /^[A-Z]{2}$/.test(p.uf)) {
          setProfileUf(p.uf);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return profileUf;
}
