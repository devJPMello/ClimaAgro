export const STORAGE_KEYS = {
  // UI
  THEME: 'climaagro-theme',

  // Alertas — filtros persistidos
  ALERTAS_SEVERIDADE: 'climaagro.pref.alertas.severidade',
  ALERTAS_TIPO: 'climaagro.pref.alertas.tipo',
  ALERTAS_UF: 'climaagro.pref.alertas.uf',

  // Notificações
  NOTIF_ALERTAS_SEEN: 'climaagro.notif.alertas.seen',

  // IAgro — chat IA (sessionStorage)
  IAGRO_ACTIVE_THREAD_ID: 'climaagro.iagro.activeThreadId',

  // IAgro — prefixo de cache de imagens por thread (localStorage dinâmico)
  IAGRO_THREAD_IMAGES_PREFIX: 'climaagro.iagro.thread-images.',

  // Perfil — municipio favorito legado (migrado para DB; mantido para leitura de migração)
  PERFIL_MUNICIPIO_FAVORITO: 'climaagro.pref.perfil.municipioFavorito',

  // Relatórios — identificador anónimo de cliente para histórico de exportações
  REPORT_EXPORT_CLIENT_ID: 'climaagro_export_client_id',
} as const;

/** Gera a chave de cache de imagens para uma thread específica do IAgro. */
export function iagroThreadImagesKey(threadId: string): string {
  return `${STORAGE_KEYS.IAGRO_THREAD_IMAGES_PREFIX}${threadId}`;
}
