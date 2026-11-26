import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { OnboardingWizard } from './OnboardingWizard';

const mocks = vi.hoisted(() => ({
  putMyDualProfile: vi.fn(async () => ({})),
  signOut: vi.fn(),
}));

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { id: 'user_novo' }, isLoaded: true }),
  useClerk: () => ({ signOut: mocks.signOut }),
}));
vi.mock('../../../lib/api/dualProfileApi', () => ({ putMyDualProfile: mocks.putMyDualProfile }));
vi.mock('../../../lib/hooks/useIbgeMunicipioSelectOptions', () => ({
  useIbgeMunicipioSelectOptions: () => ({
    options: [{ value: 'Palmas', label: 'Palmas' }],
    loading: false,
  }),
}));

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('não pode ser pulado nem fechado clicando fora', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);

    expect(screen.queryByRole('button', { name: /pular/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fechar/i })).not.toBeInTheDocument();

    // O primeiro elemento do portal é o fundo escurecido.
    await user.click(document.body.lastElementChild as HTMLElement);
    expect(screen.getByText('Bem-vindo ao ClimaAgro')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /sair da conta/i }));
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: '/login' });
  });

  it('exige estado, município, ao menos uma cultura e o aceite', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);
    const proximo = () => screen.getByRole('button', { name: /próximo/i });

    expect(proximo()).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox'), 'TO');
    await user.click(proximo());

    expect(proximo()).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox'), 'Palmas');
    await user.click(proximo());

    expect(proximo()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /soja/i }));
    await user.click(proximo());

    const concluir = screen.getByRole('button', { name: /aceitar e concluir/i });
    expect(concluir).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /li e aceito/i }));
    await user.click(concluir);

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mocks.putMyDualProfile).toHaveBeenCalledWith('user_novo', {
      uf: 'TO',
      municipio: 'Palmas',
      lgpdConsentDate: expect.any(String),
    });
    expect(JSON.parse(localStorage.getItem('climaagro.pref.culturas') ?? '[]')).toHaveLength(1);
  });
});
