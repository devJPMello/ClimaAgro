import { useEffect, useState } from 'react';
import { MessageCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import {
  confirmarCodigoWhatsapp,
  enviarCodigoWhatsapp,
  getWhatsappStatus,
  removerWhatsapp,
  type WhatsappStatus,
} from '../../../lib/api/whatsappApi';

type Props = {
  clerkUserId: string;
  /** Chamado quando o número é confirmado ou removido (para a tela atualizar o que depende dele). */
  onChange?: (status: WhatsappStatus) => void;
};

function mensagemDeErro(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

/** Cadastro do WhatsApp do usuário, confirmado por um código de 6 dígitos enviado ao próprio número. */
export function WhatsAppCard({ clerkUserId, onChange }: Props) {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [numero, setNumero] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [ocupado, setOcupado] = useState<'codigo' | 'confirmar' | 'remover' | null>(null);

  async function carregar() {
    try {
      const s = await getWhatsappStatus(clerkUserId);
      setStatus(s);
      onChange?.(s);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    if (clerkUserId) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUserId]);

  async function pedirCodigo() {
    setOcupado('codigo');
    try {
      await enviarCodigoWhatsapp(clerkUserId, numero);
      setCodigoEnviado(true);
      toast.success('Código enviado para o seu WhatsApp.');
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível enviar o código.'));
    } finally {
      setOcupado(null);
    }
  }

  async function confirmar() {
    setOcupado('confirmar');
    try {
      await confirmarCodigoWhatsapp(clerkUserId, codigo);
      toast.success('WhatsApp confirmado.');
      setCodigo('');
      setNumero('');
      setCodigoEnviado(false);
      await carregar();
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Código incorreto.'));
    } finally {
      setOcupado(null);
    }
  }

  async function remover() {
    setOcupado('remover');
    try {
      await removerWhatsapp(clerkUserId);
      toast.success('Número removido. Você não receberá mais mensagens.');
      await carregar();
    } catch (e) {
      toast.error(mensagemDeErro(e, 'Não foi possível remover o número.'));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp</CardTitle>
        <CardDescription>
          Receba alertas climáticos críticos e relatórios no seu WhatsApp. O número é confirmado por um código enviado a ele.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-4">
        {status && !status.disponivel && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            O envio por WhatsApp está indisponível no momento. Tente novamente mais tarde.
          </p>
        )}

        {status?.verificado ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
              WhatsApp confirmado: <span className="font-medium tabular-nums">{status.numero}</span>
            </p>
            <Button
              type="button"
              variant="ghost"
              className="text-xs"
              onClick={() => void remover()}
              loading={ocupado === 'remover'}
            >
              Remover número
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Número com DDD"
                  placeholder="63 99999-9999"
                  inputMode="tel"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void pedirCodigo()}
                loading={ocupado === 'codigo'}
                disabled={numero.replace(/\D/g, '').length < 10 || !status?.disponivel}
              >
                <MessageCircle className="h-4 w-4" />
                {codigoEnviado ? 'Reenviar código' : 'Enviar código'}
              </Button>
            </div>

            {codigoEnviado && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input
                    label="Código de 6 dígitos"
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void confirmar()}
                  loading={ocupado === 'confirmar'}
                  disabled={codigo.length !== 6}
                >
                  Confirmar
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Usamos o número só para enviar o que você pedir (alertas críticos e relatórios). Você pode removê-lo a qualquer momento.
        </p>
      </CardBody>
    </Card>
  );
}
