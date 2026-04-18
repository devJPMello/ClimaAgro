import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { User, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

export function Cadastro() {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [aceitoTermos, setAceitoTermos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};

    if (!nome) newErrors.nome = 'Nome é obrigatório';
    if (!email) newErrors.email = 'Email é obrigatório';
    if (!senha) newErrors.senha = 'Senha é obrigatória';
    if (senha.length < 8) newErrors.senha = 'Senha deve ter no mínimo 8 caracteres';
    if (senha !== confirmarSenha) newErrors.confirmarSenha = 'As senhas não coincidem';
    if (!aceitoTermos) {
      toast.error('Você precisa aceitar os termos de uso');
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    // Simulação de cadastro
    setTimeout(() => {
      toast.success('Conta criada com sucesso!');
      navigate('/');
    }, 1500);
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Criar sua conta
        </h1>
        <p className="text-muted-foreground">
          Preencha os dados abaixo para começar
        </p>
      </div>

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

        <Button type="submit" variant="primary" className="w-full" loading={loading}>
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
