import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Check, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { brazilUfSelectOptionsAlphabetical, UF_SELECT_PLACEHOLDER_OPTION } from '../../../lib/geo/brazilStatesMalha';
import { UF_IBGE_ID_BY_SIGLA } from '../../../lib/geo/ufIbgeIds';
import { useIbgeMunicipioSelectOptions } from '../../../lib/hooks/useIbgeMunicipioSelectOptions';
import { putMyDualProfile } from '../../../lib/api/dualProfileApi';
import { PRODUCTIVITY_CROP_OPTIONS } from '../../../lib/filters/appFilters';
import { STORAGE_KEYS } from '../../../lib/storage/storageKeys';

const UF_OPTIONS = [UF_SELECT_PLACEHOLDER_OPTION, ...brazilUfSelectOptionsAlphabetical()];
const CROP_OPTIONS = PRODUCTIVITY_CROP_OPTIONS.filter((o) => o.value !== '');

const STEPS = ['Estado', 'Município', 'Culturas'] as const;

const STEP_TITLE = [
  'Qual é o seu estado?',
  'Qual é o seu município?',
  'Quais culturas você acompanha?',
];

const STEP_DESC = [
  'Vamos personalizar os dados climáticos e alertas para a sua região.',
  'Com o município definido, os dados são ainda mais precisos para a sua localidade.',
  'Escolha as culturas de interesse para receber alertas e análises relevantes. Você pode selecionar várias — ou pular esta etapa.',
];

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [culturas, setCulturas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const ufIbgeId = uf ? UF_IBGE_ID_BY_SIGLA[uf] : undefined;
  const { options: municipioOptions, loading: loadingMunicipios } = useIbgeMunicipioSelectOptions(ufIbgeId);

  const MUNICIPIO_OPTIONS = [{ value: '', label: 'Escolher um município' }, ...municipioOptions];

  function canAdvance() {
    if (step === 0) return /^[A-Z]{2}$/.test(uf);
    if (step === 1) return municipio !== '';
    return true;
  }

  function toggleCultura(value: string) {
    setCulturas((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  async function handleNext() {
    if (step < STEPS.length - 1) {
      if (step === 0) setMunicipio('');
      setStep((s) => s + 1);
      return;
    }

    if (!user?.id) return;
    setSaving(true);
    try {
      await putMyDualProfile(user.id, { uf, municipio: municipio || undefined });
      if (culturas.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CULTURAS_PREFERIDAS, JSON.stringify(culturas));
      }
      toast.success('Perfil configurado com sucesso! Bem-vindo ao ClimaAgro.');
      onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onSkip} title="Bem-vindo ao ClimaAgro" size="lg">
      {/* Progress steps */}
      <div className="flex items-center justify-center gap-1 mb-7">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                      ? 'border-2 border-primary bg-primary/10 text-primary'
                      : 'border border-border bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  i === step ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-10 h-0.5 mb-4 rounded ${i < step ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium text-foreground mb-1">{STEP_TITLE[step]}</h3>
          <p className="text-sm text-muted-foreground">{STEP_DESC[step]}</p>
        </div>

        {step === 0 && (
          <Select
            label="Estado"
            value={uf}
            onChange={(e) => { setUf(e.target.value); setMunicipio(''); }}
            options={UF_OPTIONS}
          />
        )}

        {step === 1 && (
          <Select
            label={loadingMunicipios ? 'Carregando municípios…' : 'Município'}
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
            options={MUNICIPIO_OPTIONS}
            disabled={loadingMunicipios}
          />
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {CROP_OPTIONS.map((opt) => {
              const checked = culturas.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleCultura(opt.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                    checked
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded shrink-0 border flex items-center justify-center transition-colors ${
                      checked ? 'bg-primary border-primary' : 'border-border'
                    }`}
                  >
                    {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Pular por agora
        </button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={handleBack} disabled={saving}>
              Voltar
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleNext()}
            disabled={!canAdvance() || saving}
            loading={saving}
          >
            {step < STEPS.length - 1 ? (
              <>
                Próximo <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              'Concluir'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
