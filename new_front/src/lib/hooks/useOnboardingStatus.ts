import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { getMyDualProfile } from '../api/dualProfileApi';

/**
 * Detecta se o usuário logado ainda não configurou estado e município.
 * Retorna `show=true` até as boas-vindas serem concluídas (são obrigatórias).
 */
export function useOnboardingStatus() {
  const { user, isLoaded } = useUser();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user?.id) { setChecking(false); return; }

    let cancelled = false;
    void getMyDualProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        setNeedsOnboarding(!(profile?.uf && profile?.municipio));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [user?.id, isLoaded]);

  function complete() {
    setNeedsOnboarding(false);
  }

  return {
    show: !checking && needsOnboarding,
    /** true quando a consulta ao perfil terminou e as boas-vindas não estão na tela. */
    liberado: !checking && !needsOnboarding,
    complete,
  };
}
