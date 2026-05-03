import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Select } from '../components/ui/Select';
import { User, Mail, Lock, Upload, Leaf, Tractor, Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { scanCreaCarteira } from '../../lib/api/agronomistOnboardingApi';
import { registerAccount } from '../../lib/api/authApi';
import { ApiError } from '../../lib/api/errors';
import {
  brazilUfSelectOptionsAlphabetical,
  UF_SELECT_PLACEHOLDER_OPTION,
} from '../../lib/geo/brazilStatesMalha';

type PerfilCadastro = 'produtor' | 'agronomo';

export function Cadastro() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [perfil, setPerfil] = useState<PerfilCadastro>('produtor');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [aceitoTermos, setAceitoTermos] = useState(false);

  const [numeroCrea, setNumeroCrea] = useState('');
  const [ufCrea, setUfCrea] = useState('');
  const [cpf, setCpf] = useState('');
  const [creaStorageKey, setCreaStorageKey] = useState<string | null>(null);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ufOptions = [UF_SELECT_PLACEHOLDER_OPTION, ...brazilUfSelectOptionsAlphabetical()];

  const pickPerfil = (p: PerfilCadastro) => {
    setPerfil(p);
    setErrors({});
    if (p === 'produtor') {
      setNumeroCrea('');
      setUfCrea('');
      setCpf('');
      setCreaStorageKey(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreaFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    setOcrLoading(true);
    setErrors((e) => ({ ...e, documento: '' }));
    try {
      const res = await scanCreaCarteira(file);
      const { storageKey, extracted, warnings } = res.data;
      setCreaStorageKey(storageKey);

      if (extracted.fullName) setNome(extracted.fullName);
      if (extracted.creaRegistrationNumber) setNumeroCrea(extracted.creaRegistrationNumber);
      if (extracted.creaUf) setUfCrea(extracted.creaUf.toUpperCase());
      if (extracted.cpf) setCpf(extracted.cpf);

      warnings.forEach((w) => toast.warning(w));
      toast.success('Documento recebido. Confira os dados extraídos.');
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Não foi possível processar a imagem. Tente outra foto.';
      toast.error(msg);
      setErrors((e) => ({ ...e, documento: msg }));
      setCreaStorageKey(null);
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};
    const isAgronomo = perfil === 'agronomo';

    if (!nome) newErrors.nome = 'Nome é obrigatório';
    if (!email) newErrors.email = 'Email é obrigatório';
    if (!senha) newErrors.senha = 'Senha é obrigatória';
    if (senha.length < 8) newErrors.senha = 'Senha deve ter no mínimo 8 caracteres';
    if (senha !== confirmarSenha) newErrors.confirmarSenha = 'As senhas não coincidem';

    if (isAgronomo) {
      if (!telefone.trim()) {
        newErrors.telefone = 'Telefone é obrigatório para agrônomos';
      } else if (!/^\d{10,13}$/.test(telefone.trim())) {
        newErrors.telefone = 'Use somente dígitos com DDD (ex: 63999999999)';
      }
      if (!numeroCrea.trim()) newErrors.numeroCrea = 'Informe o número do registro CREA';
      if (!ufCrea) newErrors.ufCrea = 'Selecione a UF do CREA';
      if (!cpf.trim()) newErrors.cpf = 'Informe o CPF';
      else if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpf.trim())) {
        newErrors.cpf = 'CPF deve estar no formato 000.000.000-00';
      }
      if (!creaStorageKey) {
        newErrors.documento = 'Envie a foto da carteira CREA para continuar';
      }
    }

    if (!aceitoTermos) {
      toast.error('Você precisa aceitar os termos de uso');
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const phoneTrim = telefone.trim();
      await registerAccount({
        name: nome.trim(),
        email: email.trim(),
        password: senha,
        profileType: isAgronomo ? 'agronomist' : 'standard',
        ...(isAgronomo && creaStorageKey
          ? {
              creaRegistrationNumber: numeroCrea.trim(),
              creaUf: ufCrea,
              cpf: cpf.trim(),
              creaDocumentStorageKey: creaStorageKey,
              phone: phoneTrim,
            }
          : phoneTrim
            ? { phone: phoneTrim }
            : {}),
      });

      toast.success(
        isAgronomo
          ? 'Cadastro enviado. Seu perfil ficará aguardando aprovação da equipe.'
          : 'Conta criada com sucesso!'
      );
      navigate('/login');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Não foi possível concluir o cadastro. Tente novamente.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Criar sua conta
        </h1>
        <p className="text-muted-foreground">
          Escolha seu perfil e preencha os dados para começar
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-8">
        <button
          type="button"
          onClick={() => pickPerfil('produtor')}
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
            perfil === 'produtor'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background hover:bg-muted/50'
          }`}
        >
          <Tractor className="w-5 h-5 shrink-0" />
          Sou produtor rural
        </button>
        <button
          type="button"
          onClick={() => pickPerfil('agronomo')}
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
            perfil === 'agronomo'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background hover:bg-muted/50'
          }`}
        >
          <Leaf className="w-5 h-5 shrink-0" />
          Sou agrônomo
        </button>
      </div>

      {perfil === 'agronomo' && (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Envie uma foto legível da sua carteira profissional do CREA. A leitura automática preenche
            nome, registro, UF e CPF; você confere e completa e-mail e telefone.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleCreaFile(e.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={ocrLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            {ocrLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando imagem…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Subir foto da Carteira do CREA
              </>
            )}
          </Button>
          {creaStorageKey && !ocrLoading && (
            <p className="text-xs text-muted-foreground">
              Documento recebido para auditoria. Campos abaixo podem ser editados se necessário.
            </p>
          )}
          {errors.documento && <p className="text-xs text-destructive">{errors.documento}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="relative">
          <User className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
          <Input
            label="Nome completo"
            type="text"
            placeholder="João Silva"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="pl-11"
            error={errors.nome}
            required
          />
        </div>

        {perfil === 'agronomo' && (
          <>
            <div className="relative">
              <Input
                label="Número do registro CREA"
                type="text"
                placeholder="Ex.: SP-123456/D ou conforme o documento"
                value={numeroCrea}
                onChange={(e) => setNumeroCrea(e.target.value)}
                error={errors.numeroCrea}
                required
              />
            </div>
            <Select
              label="UF do CREA"
              value={ufCrea}
              onChange={(e) => setUfCrea(e.target.value)}
              options={ufOptions}
              error={errors.ufCrea}
              required
            />
            <div className="relative">
              <Input
                label="CPF"
                type="text"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                error={errors.cpf}
                required
              />
            </div>
          </>
        )}

        <div className="relative">
          <Mail className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
          <Input
            label="Email"
            type="email"
            placeholder="joao@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-11"
            error={errors.email}
            required
          />
        </div>

        <div className="relative">
          <Phone className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
          <Input
            label={perfil === 'agronomo' ? 'WhatsApp (somente dígitos, com DDD)' : 'Telefone (opcional)'}
            type="tel"
            placeholder="Ex: 63999999999"
            inputMode="numeric"
            maxLength={13}
            value={telefone}
            onChange={(e) => setTelefone(e.target.value.replace(/\D/g, ''))}
            className="pl-11"
            autoComplete="tel"
            error={errors.telefone}
            helperText={perfil === 'agronomo' ? 'DDD + número, sem espaços ou traços (ex: 63999999999)' : undefined}
            required={perfil === 'agronomo'}
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
          <Input
            label="Senha"
            type="password"
            placeholder="••••••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="pl-11"
            error={errors.senha}
            helperText="Mínimo de 8 caracteres"
            required
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-[42px] w-5 h-5 text-muted-foreground" />
          <Input
            label="Confirmar senha"
            type="password"
            placeholder="••••••••"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            className="pl-11"
            error={errors.confirmarSenha}
            required
          />
        </div>

        {perfil === 'agronomo' && (
          <p className="text-sm text-muted-foreground rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2">
            Após o cadastro, seu perfil de agrônomo ficará <strong>aguardando aprovação</strong>. A equipe
            pode conferir o registro no sistema do CONFEA antes de liberar indicações e recursos
            exclusivos.
          </p>
        )}

        <div className="pt-2">
          <Checkbox
            label={
              <span>
                Aceito os{' '}
                <a href="#" className="text-primary hover:underline">
                  Termos de Uso
                </a>{' '}
                e{' '}
                <a href="#" className="text-primary hover:underline">
                  Política de Privacidade
                </a>
              </span>
            }
            checked={aceitoTermos}
            onChange={(e) => setAceitoTermos(e.target.checked)}
          />
        </div>

        <Button type="submit" variant="primary" className="w-full" loading={loading || ocrLoading}>
          Criar conta
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Já tem uma conta?{' '}
        <Link to="/login" className="text-primary hover:underline">
          Fazer login
        </Link>
      </p>
    </div>
  );
}
