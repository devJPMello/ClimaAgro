import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
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
            Assistente de IA para clima, produtividade e alertas, com análise de fotos e documentos.
          </p>
        </div>

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
              messageMediaPreviews={chat.messageMediaPreviews}
              userId={chat.user?.id}
              quickActions={IAGRO_QUICK_ACTIONS}
              onApplyQuickPrompt={chat.applyQuickPrompt}
              onApplyPlantAnalysis={chat.applyPlantAnalysis}
            />
            <ChatInput
              input={chat.input}
              setInput={chat.setInput}
              loadingSend={chat.loadingSend}
              canSend={chat.canSend}
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
        clerkUserId={chat.user?.id ?? ''}
        onClose={() => chat.setHistoryOpen(false)}
        onOpenThread={(id) => void chat.openThread(id)}
        onToggleFavorite={(t) => void chat.handleToggleFavorite(t)}
        onDeleteThread={chat.handleDeleteThread}
      />

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

    </div>
  );
}
