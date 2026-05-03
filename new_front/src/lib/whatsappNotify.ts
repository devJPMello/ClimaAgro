import { toast } from 'sonner';
import type { WhatsAppDeliveryResult } from './api/hybridChatApi';

/** Feedback visual quando o backend não conseguiu entregar a mensagem via WhatsApp. */
export function notifyWhatsappDelivery(result: WhatsAppDeliveryResult | undefined) {
  if (!result || result.sent) return;

  if (result.reason === 'whatsapp_not_configured') {
    toast.message('WhatsApp não configurado', {
      description:
        'As variáveis EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME não estão definidas no servidor.',
    });
    return;
  }

  if (result.reason === 'invalid_number') {
    toast.error('Número do agrônomo inválido no cadastro.');
    return;
  }

  if (result.reason === 'whatsapp_api_error' && result.detail) {
    toast.error('WhatsApp: mensagem não entregue', {
      description: result.detail,
    });
    return;
  }

  toast.warning('Não foi possível enviar ao WhatsApp do agrônomo.');
}
