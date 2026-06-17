import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { EncerrarAtendimentoModal } from '../components/chat/EncerrarAtendimentoModal';
import { FileAttachmentPickerModal } from '../components/chat/FileAttachmentPickerModal';
import { History } from 'lucide-react';
import { ThreadList } from '../components/iagro/ThreadList';
import { MessageArea } from '../components/iagro/MessageArea';
import { ChatInput } from '../components/iagro/ChatInput';
import { useIagroChat, IAGRO_QUICK_ACTIONS } from '../../lib/hooks/useIagroChat';

export function IAgro() {
  const chat = useIagroChat();

  return (
    <div className="space-y-6 relative">
      <div className="min-w-0 space-y-4">
        <div className="pr-12 sm:pr-28">
          <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
            IAgro
          </h1>
          <p className="text-muted-foreground">
            Chat com o assistente e encaminhamento ao agrônomo parceiro via WhatsApp.
          </p>
        </div>

        {chat.humanHandoff && (
          <div className="rounded-xl border border-green-600/40 bg-green-500/10 px-4 py-3 text-sm text-foreground">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium text-green-800 dark:text-green-300">Atendimento humano ativo</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Suas mensagens são encaminhadas ao WhatsApp do agrônomo (Twilio, se configurado). Respostas chegam aqui em tempo real. Encerre o ticket quando o caso for resolvido — mensagens posteriores do agrônomo não serão roteadas.
                </p>
              </div>
              {chat.hybridConversation?.id && chat.user?.id && chat.hybridConversation.atendimentoAtivo && (
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 text-xs"
                  onClick={() => chat.setEncerrarModalOpen(true)}
                >
                  Encerrar atendimento
                </Button>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => chat.setHistoryOpen((prev) => !prev)}
          className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center text-foreground transition-all hover:-translate-y-0.5 z-30 lg:right-0"
          aria-label={chat.historyOpen ? 'Fechar histórico' : 'Abrir histórico'}
        >
          <History className="w-5 h-5" />
        </button>

        <Card>
          <CardBody className="space-y-4">
            <MessageArea
              messages={chat.messages}
              loadingHistory={chat.loadingHistory}
              loadingSend={chat.loadingSend}
              humanHandoff={chat.humanHandoff}
              messageMediaPreviews={chat.messageMediaPreviews}
              conciergeSuggestion={chat.conciergeSuggestion}
              indicatedAgronomo={chat.indicatedAgronomo}
              loadingIndicatedAgronomo={chat.loadingIndicatedAgronomo}
              escalating={chat.escalating}
              userId={chat.user?.id}
              quickActions={IAGRO_QUICK_ACTIONS}
              onApplyQuickPrompt={chat.applyQuickPrompt}
              onApplyPlantAnalysis={chat.applyPlantAnalysis}
              onAutoEscalateSpecialist={() => void chat.autoEscalateSpecialist()}
              onOpenEscalateModal={chat.openEscalateModal}
              onDismissConcierge={() => chat.setConciergeSuggestion(null)}
            />
            <ChatInput
              input={chat.input}
              setInput={chat.setInput}
              loadingSend={chat.loadingSend}
              canSend={chat.canSend}
              humanHandoff={chat.humanHandoff}
              isRecording={chat.isRecording}
              pendingFiles={chat.pendingFiles}
              pendingPreviews={chat.pendingPreviews}
              inputRef={chat.inputRef}
              onSubmit={(e) => void chat.handleSubmit(e)}
              onPaste={chat.handlePaste}
              onToggleRecording={chat.toggleRecording}
              onRemovePendingFile={chat.removePendingFile}
              onOpenAttachmentModal={() => chat.setIagroAttachmentModalOpen(true)}
            />
          </CardBody>
        </Card>
      </div>

      <ThreadList
        threads={chat.threads}
        threadId={chat.threadId}
        loadingThreads={chat.loadingThreads}
        isOpen={chat.historyOpen}
        onClose={() => chat.setHistoryOpen(false)}
        onOpenThread={(id) => void chat.openThread(id)}
        onToggleFavorite={(t) => void chat.handleToggleFavorite(t)}
        onDeleteThread={chat.handleDeleteThread}
      />

      {/* Modal: escalate to specialist */}
      <Modal
        isOpen={chat.escalateOpen}
        onClose={() => { if (!chat.escalating) { chat.setEscalateOpen(false); } }}
        title="Enviar para especialista"
        footer={
          <>
            <Button variant="ghost" onClick={() => chat.setEscalateOpen(false)} disabled={chat.escalating}>
              Cancelar
            </Button>
            <Button onClick={() => void chat.confirmEscalate()} loading={chat.escalating}>
              Continuar em Minhas conversas
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground mb-3">
          Incluímos as últimas mensagens do IAgro neste tópico e ativamos o atendimento humano. Escolha o parceiro; em seguida você será levado a Minhas conversas para dialogar por aqui.
        </p>
        <label className="block text-xs text-muted-foreground mb-1">Agrônomo parceiro</label>
        <select
          className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm"
          value={chat.escalateAgronomoId}
          onChange={(e) => chat.setEscalateAgronomoId(e.target.value)}
          disabled={chat.loadingEscalateList}
        >
          {chat.loadingEscalateList ? (
            <option value="">Carregando lista de agrônomos…</option>
          ) : chat.agronomosPick.length === 0 ? (
            <option value="">Nenhum agrônomo disponível. Cadastre parceiros ou verifique a página Agrônomos Parceiros.</option>
          ) : (
            chat.agronomosPick.map((a) => (
              <option key={String(a.id)} value={String(a.id)}>
                {a.nome}{a.whatsapp ? '' : ' (sem WhatsApp)'}
              </option>
            ))
          )}
        </select>
      </Modal>

      {/* Modal: delete thread */}
      <Modal
        isOpen={Boolean(chat.threadToDelete)}
        onClose={() => { if (!chat.deletingThread) chat.setThreadToDelete(null); }}
        title="Excluir interação"
        footer={
          <>
            <Button variant="ghost" onClick={() => chat.setThreadToDelete(null)} disabled={chat.deletingThread}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void chat.confirmDeleteThread()} loading={chat.deletingThread}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir a interação
          {chat.threadToDelete?.title ? ` "${chat.threadToDelete.title}"` : ''}?
          <br />
          Essa ação remove a conversa do histórico.
        </p>
      </Modal>

      {/* Modal: attachment picker */}
      <FileAttachmentPickerModal
        isOpen={chat.iagroAttachmentModalOpen}
        onClose={() => chat.setIagroAttachmentModalOpen(false)}
        title="Anexar ficheiros"
        description={
          <p>
            Imagens, PDF e ficheiros de texto (TXT, CSV, JSON, MD, DOC/DOCX). Pode escolher vários de uma vez (até 6
            por mensagem, somando aos já anexados).
          </p>
        }
        accept="image/*,.txt,.csv,.json,.md,.pdf,.doc,.docx"
        multiple
        onFilesSelected={(files) => {
          chat.handleFilesSelected(files);
          chat.setIagroAttachmentModalOpen(false);
        }}
      />

      {/* Modal: encerrar atendimento */}
      <EncerrarAtendimentoModal
        isOpen={chat.encerrarModalOpen}
        onClose={() => chat.setEncerrarModalOpen(false)}
        onConfirmSemAvaliacao={() => void chat.encerrarSemAvaliacaoIAgro()}
        onConfirmComAvaliacao={(a) => void chat.encerrarComAvaliacaoIAgro(a)}
        loading={chat.encerrando}
      />
    </div>
  );
}
