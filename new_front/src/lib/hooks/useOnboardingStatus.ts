import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { getMyDualProfile } from '../api/dualProfileApi';

const SESSION_KEY = 'climaagro.onboarding.dismissed';

/**
 * Detecta se o usuário logado ainda não configurou estado e município.
 * Retorna `show=true` até o wizard ser concluído ou dispensado.
 * "Dispensado" é guardado em sessionStorage — reaparece no próximo login se o perfil ainda estiver incompleto.
 */
export function useOnboardingStatus() {
  const { user, isLoaded } = useUser();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user?.id) { setChecking(false); return; }
    if (sessionStorage.getItem(SESSION_KEY) === '1') { setChecking(false); return; }

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

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, '1');
    setNeedsOnboarding(false);
  }

  function complete() {
    setNeedsOnboarding(false);
  }

  return { show: !checking && needsOnboarding, dismiss, complete };
}
