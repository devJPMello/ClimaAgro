import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useUnreadAlerts } from './useUnreadAlerts';

const mocks = vi.hoisted(() => ({
  getMyDualProfile: vi.fn(),
  listClimateAlerts: vi.fn(),
}));

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { id: 'user_novo' }, isLoaded: true }),
}));
vi.mock('../api/dualProfileApi', () => ({ getMyDualProfile: mocks.getMyDualProfile }));
vi.mock('../api/alertsApi', () => ({ listClimateAlerts: mocks.listClimateAlerts }));

describe('useUnreadAlerts no primeiro acesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getMyDualProfile.mockResolvedValue({ uf: 'TO', notifAlertasCriticos: true });
    mocks.listClimateAlerts.mockResolvedValue({ items: [{ id: 'a1', severidade: 'high' }] });
  });

  it('não busca alertas enquanto as boas-vindas estão abertas e depois filtra pela UF', async () => {
    const { result, rerender } = renderHook(({ ativo }) => useUnreadAlerts(ativo), {
      initialProps: { ativo: false },
    });

    expect(mocks.getMyDualProfile).not.toHaveBeenCalled();
    expect(mocks.listClimateAlerts).not.toHaveBeenCalled();
    expect(result.current.count).toBe(0);

    rerender({ ativo: true });

    await waitFor(() => expect(result.current.count).toBe(1));
    expect(mocks.listClimateAlerts).toHaveBeenCalledTimes(1);
    expect(mocks.listClimateAlerts).toHaveBeenCalledWith({ state: 'TO' });
    expect(result.current.uf).toBe('TO');
  });
});
