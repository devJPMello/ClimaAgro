const mockQuery = jest.fn();
const mockSendMessage = jest.fn();
const mockBuild = jest.fn();
const mockLoad = jest.fn();

jest.mock('../config/database', () => ({ sequelize: { query: (...a) => mockQuery(...a) }, models: {} }));
jest.mock('../services/evolutionService', () => ({
  sendMessage: (...a) => mockSendMessage(...a),
  isConfigured: () => true,
}));
jest.mock('../services/climateAlertsUiService', () => ({
  loadOfficialAlertsForUi: (...a) => mockLoad(...a),
  buildOfficialAlertUiItems: (...a) => mockBuild(...a),
}));

process.env.WHATSAPP_ALERTS_DELAY_MS = '0';
const { notificarAlertasCriticos, _internos } = require('../services/whatsappAlertsService');

const alerta = (id, severidade, tipo = 'Tempestade') => ({ id, tipo, severidade, limiar: 'Vigência: 2026-11-08 a 2026-11-09' });

function modelsCom(perfis) {
  return {
    OfficialAlert: {},
    GeoData: {},
    DualUserProfile: { findAll: jest.fn().mockResolvedValue(perfis) },
  };
}

describe('alertas críticos por WhatsApp', () => {
  let enviadosNoBanco;
  beforeEach(() => {
    jest.clearAllMocks();
    enviadosNoBanco = new Set();
    mockLoad.mockResolvedValue([]);
    mockSendMessage.mockResolvedValue({ sent: true });
    mockQuery.mockImplementation(async (sql, { replacements } = {}) => {
      if (sql.startsWith('SELECT')) {
        return [replacements.ids.filter((id) => enviadosNoBanco.has(`${replacements.userId}|${id}`)).map((id) => ({ alerta_id: id }))];
      }
      enviadosNoBanco.add(`${replacements.userId}|${replacements.id}`);
      return [[]];
    });
  });

  test('só alertas alta/crítica vão na mensagem, com link e aviso de como parar', async () => {
    mockBuild.mockResolvedValue([alerta('a1', 'critical'), alerta('a2', 'high', 'Chuvas Intensas'), alerta('a3', 'medium')]);
    const models = modelsCom([{ clerkUserId: 'u1', whatsapp: '63999990000', uf: 'TO' }]);

    const r = await notificarAlertasCriticos({ models });

    expect(r).toMatchObject({ usuarios: 1, mensagens: 1, alertas: 2, interrompido: false });
    const texto = mockSendMessage.mock.calls[0][1];
    expect(texto).toContain('Tempestade (crítico)');
    expect(texto).toContain('Chuvas Intensas (alto)');
    expect(texto).not.toContain('medium');
    expect(texto).toContain('Perfil → Notificações');
  });

  test('cada alerta é enviado uma única vez por usuário', async () => {
    mockBuild.mockResolvedValue([alerta('a1', 'critical')]);
    const models = modelsCom([{ clerkUserId: 'u1', whatsapp: '63999990000', uf: 'TO' }]);

    await notificarAlertasCriticos({ models });
    const segunda = await notificarAlertasCriticos({ models });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(segunda.mensagens).toBe(0);
  });

  test('alerta novo depois do primeiro envio vai numa nova mensagem só com o novo', async () => {
    const models = modelsCom([{ clerkUserId: 'u1', whatsapp: '63999990000', uf: 'TO' }]);
    mockBuild.mockResolvedValue([alerta('a1', 'critical')]);
    await notificarAlertasCriticos({ models });
    mockBuild.mockResolvedValue([alerta('a1', 'critical'), alerta('a2', 'high', 'Vendaval')]);
    await notificarAlertasCriticos({ models });

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage.mock.calls[1][1]).toContain('Vendaval');
    expect(mockSendMessage.mock.calls[1][1]).not.toContain('Tempestade');
  });

  test('se o WhatsApp cair, a rodada para e nada é marcado como enviado', async () => {
    mockBuild.mockResolvedValue([alerta('a1', 'critical')]);
    mockSendMessage.mockResolvedValue({ sent: false, reason: 'whatsapp_api_error' });
    const models = modelsCom([
      { clerkUserId: 'u1', whatsapp: '63999990000', uf: 'TO' },
      { clerkUserId: 'u2', whatsapp: '63999991111', uf: 'TO' },
    ]);

    const r = await notificarAlertasCriticos({ models });

    expect(r).toMatchObject({ interrompido: true, motivo: 'whatsapp_api_error', mensagens: 0 });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(enviadosNoBanco.size).toBe(0);
  });

  test('sem alertas na UF ninguém recebe nada', async () => {
    mockBuild.mockResolvedValue([alerta('a1', 'low')]);
    const r = await notificarAlertasCriticos({ models: modelsCom([{ clerkUserId: 'u1', whatsapp: '63999990000', uf: 'TO' }]) });
    expect(r.mensagens).toBe(0);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test('mensagem com mais de 5 alertas resume o resto', () => {
    const muitos = Array.from({ length: 7 }, (_, i) => alerta(`x${i}`, 'high', `Tipo ${i}`));
    const texto = _internos.montarMensagem('MT', muitos);
    expect(texto).toContain('Tipo 4');
    expect(texto).not.toContain('Tipo 5');
    expect(texto).toContain('mais 2 alerta(s)');
  });
});
