import React, { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { listAdminConsultas, type AdminConsultaListItem } from '../../lib/api/adminConsultasApi';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'novo', label: 'Novo' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
];

export function AdminConsultas() {
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<AdminConsultaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const r = await listAdminConsultas(user.id, {
        status: status || undefined,
        limit: 80,
        offset: 0,
      });
      setItems(r.items || []);
      setTotal(r.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar consultas.');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id, status]);

  useEffect(() => {
    if (isLoaded && user?.id) void load();
  }, [isLoaded, user?.id, load]);

  if (!isLoaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList className="h-7 w-7 text-primary" />
            Consulta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tickets em <span className="font-mono text-xs">consultas_agronomicas</span> — canal híbrido
            como contexto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground">
            Estado
            <select
              className="ml-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <Card>
        <CardBody className="!p-0">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Assunto</th>
                    <th className="px-4 py-3 font-medium">Produtor</th>
                    <th className="px-4 py-3 font-medium">Especialista</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Aval.</th>
                    <th className="px-4 py-3 font-medium">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        Nenhum registo{total === 0 ? '' : ` (total ${total})`}.
                      </td>
                    </tr>
                  )}
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-border/80 hover:bg-muted/20">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{row.status}</span>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="line-clamp-2 font-medium text-foreground">{row.assunto}</p>
                        {row.preview && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.preview}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.produtorNome}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                          {row.produtorClerkId}
                        </p>
                      </td>
                      <td className="px-4 py-3">{row.agronomoNome || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.hybridWhatsappMasked ? (
                          <>
                            <span>WA {row.hybridWhatsappMasked}</span>
                            {row.hybridAtendimentoAtivo != null && (
                              <span className={row.hybridAtendimentoAtivo ? ' text-green-600' : ''}>
                                {' '}
                                · {row.hybridAtendimentoAtivo ? 'ativo' : 'encerrado'}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.atendimentoAvaliacaoEstrelas != null ? (
                          <span>{row.atendimentoAvaliacaoEstrelas}★</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.dataAtualizacao).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {!loading && items.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">Mostrando {items.length} de {total}</p>
      )}
    </div>
  );
}
