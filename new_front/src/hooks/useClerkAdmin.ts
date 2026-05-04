import { useEffect, useLayoutEffect, useState } from 'react';
import { getAdminAccess } from '../lib/api/adminConsultasApi';

/**
 * Admin definido só na API (`CLERK_ADMIN_USER_IDS` / `CLERK_ADMIN_USER_ID`); evita duplicar lista no Vite.
 */
export function useClerkAdmin(userId: string | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);
  /** `false` = API sem lista de admins; `null` = falha de rede / resposta inválida. */
  const [configured, setConfigured] = useState<boolean | null>(null);
  /** Começa em `true` para não tratar como “não admin” antes do primeiro fetch. */
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    if (userId) {
      setIsAdmin(false);
      setLoading(true);
    } else {
      setIsAdmin(false);
      setConfigured(null);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getAdminAccess(userId)
      .then((r) => {
        if (cancelled) return;
        setIsAdmin(Boolean(r.clerkAdmin));
        setConfigured(Boolean(r.configured));
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
        setConfigured(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAdmin, loading, configured };
}
