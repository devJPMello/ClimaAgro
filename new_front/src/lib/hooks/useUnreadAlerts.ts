import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { getMyDualProfile } from '../api/dualProfileApi';
import { listClimateAlerts } from '../api/alertsApi';
import type { ClimateAlertDto } from '../api/contracts/alerts';
import { STORAGE_KEYS } from '../storage/storageKeys';

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIF_ALERTAS_SEEN);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIF_ALERTAS_SEEN, JSON.stringify([...ids]));
  } catch { /* silent */ }
}

export function useUnreadAlerts() {
  const { user } = useUser();
  const [unread, setUnread] = useState<ClimateAlertDto[]>([]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const profile = await getMyDualProfile(user.id);
      // Se o usuário desativou notificações de alertas, não busca
      if (profile?.notifAlertasCriticos === false) return;

      const uf = profile?.uf && /^[A-Z]{2}$/.test(profile.uf) ? profile.uf : undefined;
      const { items } = await listClimateAlerts(uf ? { state: uf } : undefined);

      const critical = items.filter(
        (a) => a.severidade === 'critical' || a.severidade === 'high',
      );
      const seen = getSeenIds();
      setUnread(critical.filter((a) => !seen.has(a.id)));
    } catch { /* silent */ }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markAllSeen = useCallback(() => {
    setUnread((prev) => {
      if (!prev.length) return prev;
      const seen = getSeenIds();
      prev.forEach((a) => seen.add(a.id));
      saveSeenIds(seen);
      return [];
    });
  }, []);

  return { count: unread.length, alerts: unread, markAllSeen };
}
