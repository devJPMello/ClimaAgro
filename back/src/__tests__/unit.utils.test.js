/**
 * Testes unitários das funções utilitárias puras.
 * Nenhuma dependência de banco, HTTP ou serviços externos.
 */

const { BRAZIL_UFS, normalizeUf } = require('../utils/brazilUfs');
const { normalizeDigits, phonesMatch, extractText } = require('../utils/formatting');
const { normalizeMunicipalityKey } = require('../utils/municipalityNameMatch');
const { mapProductLabelToCropType, slugifySidraProductLabel } = require('../utils/sidra1612ProductCropMap');

// ─── brazilUfs ───────────────────────────────────────────────────────────────

describe('BRAZIL_UFS', () => {
  test('contém exatamente 27 siglas', () => {
    expect(BRAZIL_UFS).toHaveLength(27);
  });

  test('contém as siglas das 5 regiões do Brasil', () => {
    // Norte, Nordeste, Centro-Oeste, Sudeste, Sul
    for (const uf of ['AM', 'PA', 'BA', 'CE', 'GO', 'MT', 'SP', 'RJ', 'RS', 'SC', 'PR']) {
      expect(BRAZIL_UFS).toContain(uf);
    }
  });

  test('não contém siglas inválidas', () => {
    expect(BRAZIL_UFS).not.toContain('XX');
    expect(BRAZIL_UFS).not.toContain('BR');
    expect(BRAZIL_UFS).not.toContain('');
  });
});

describe('normalizeUf', () => {
  test('retorna sigla em maiúsculo para UF válida já em maiúsculo', () => {
    expect(normalizeUf('SP')).toBe('SP');
    expect(normalizeUf('TO')).toBe('TO');
    expect(normalizeUf('MG')).toBe('MG');
  });

  test('converte minúsculas para maiúsculas', () => {
    expect(normalizeUf('sp')).toBe('SP');
    expect(normalizeUf('to')).toBe('TO');
    expect(normalizeUf('rj')).toBe('RJ');
  });

  test('remove espaços antes de validar', () => {
    expect(normalizeUf('  GO  ')).toBe('GO');
    expect(normalizeUf(' ba ')).toBe('BA');
  });

  test('retorna "ALL" para a sigla especial ALL (qualquer capitalização)', () => {
    expect(normalizeUf('ALL')).toBe('ALL');
    expect(normalizeUf('all')).toBe('ALL');
    expect(normalizeUf('All')).toBe('ALL');
  });

  test('retorna null para sigla inexistente', () => {
    expect(normalizeUf('XX')).toBeNull();
    expect(normalizeUf('ZZ')).toBeNull();
    expect(normalizeUf('BR')).toBeNull();
  });

  test('retorna null para string vazia', () => {
    expect(normalizeUf('')).toBeNull();
    expect(normalizeUf('   ')).toBeNull();
  });

  test('retorna null para valores nulos/undefined', () => {
    expect(normalizeUf(null)).toBeNull();
    expect(normalizeUf(undefined)).toBeNull();
  });

  test('retorna null para sigla com mais de 2 caracteres (exceto ALL)', () => {
    expect(normalizeUf('SPP')).toBeNull();
    expect(normalizeUf('TOC')).toBeNull();
  });

  test('aceita todas as 27 UFs do Brasil', () => {
    for (const uf of BRAZIL_UFS) {
      expect(normalizeUf(uf)).toBe(uf);
    }
  });
});

// ─── formatting ──────────────────────────────────────────────────────────────

describe('normalizeDigits', () => {
  test('mantém string que já contém apenas dígitos', () => {
    expect(normalizeDigits('5562999991234')).toBe('5562999991234');
    expect(normalizeDigits('11999999999')).toBe('11999999999');
  });

  test('remove caracteres não numéricos de número formatado', () => {
    expect(normalizeDigits('+55 (62) 9 9999-1234')).toBe('5562999991234');
    expect(normalizeDigits('(11) 91234-5678')).toBe('11912345678');
  });

  test('remove espaços, traços e parênteses', () => {
    expect(normalizeDigits('55 62 9999 1234')).toBe('556299991234');
    expect(normalizeDigits('9999-1234')).toBe('99991234');
  });

  test('retorna string vazia para null', () => {
    expect(normalizeDigits(null)).toBe('');
  });

  test('retorna string vazia para undefined', () => {
    expect(normalizeDigits(undefined)).toBe('');
  });

  test('retorna string vazia para string sem dígitos', () => {
    expect(normalizeDigits('abc-def')).toBe('');
    expect(normalizeDigits('+')).toBe('');
  });
});

describe('phonesMatch', () => {
  test('retorna true para números idênticos', () => {
    expect(phonesMatch('5562999991234', '5562999991234')).toBe(true);
  });

  test('retorna true quando um tem DDI e o outro não (sufixo)', () => {
    expect(phonesMatch('5562999991234', '62999991234')).toBe(true);
    expect(phonesMatch('62999991234', '5562999991234')).toBe(true);
  });

  test('retorna true quando os últimos 9 dígitos coincidem', () => {
    expect(phonesMatch('62999991234', '999991234')).toBe(true);
  });

  test('retorna false para números diferentes', () => {
    expect(phonesMatch('5562999991234', '5511888887777')).toBe(false);
  });

  test('retorna false quando algum dos valores está vazio', () => {
    expect(phonesMatch('', '5562999991234')).toBe(false);
    expect(phonesMatch('5562999991234', '')).toBe(false);
    expect(phonesMatch('', '')).toBe(false);
  });

  test('retorna false para null/undefined', () => {
    expect(phonesMatch(null, '5562999991234')).toBe(false);
    expect(phonesMatch('5562999991234', null)).toBe(false);
  });

  test('ignora formatação ao comparar', () => {
    expect(phonesMatch('+55 (62) 9 9999-1234', '5562999991234')).toBe(true);
  });
});

describe('extractText', () => {
  test('extrai de message.conversation', () => {
    expect(extractText({ conversation: 'Olá, preciso de ajuda.' })).toBe('Olá, preciso de ajuda.');
  });

  test('extrai de extendedTextMessage.text quando conversation está ausente', () => {
    expect(extractText({ extendedTextMessage: { text: 'Texto longo.' } })).toBe('Texto longo.');
  });

  test('extrai de imageMessage.caption', () => {
    expect(extractText({ imageMessage: { caption: 'Foto da lavoura' } })).toBe('Foto da lavoura');
  });

  test('extrai de videoMessage.caption', () => {
    expect(extractText({ videoMessage: { caption: 'Vídeo do campo' } })).toBe('Vídeo do campo');
  });

  test('extrai de documentMessage.caption', () => {
    expect(extractText({ documentMessage: { caption: 'Laudo técnico' } })).toBe('Laudo técnico');
  });

  test('extrai de audioMessage.caption', () => {
    expect(extractText({ audioMessage: { caption: 'Mensagem de voz' } })).toBe('Mensagem de voz');
  });

  test('retorna string vazia para objeto sem campos reconhecidos', () => {
    expect(extractText({})).toBe('');
    expect(extractText({ outro: 'ignorado' })).toBe('');
  });

  test('retorna string vazia para null ou undefined', () => {
    expect(extractText(null)).toBe('');
    expect(extractText(undefined)).toBe('');
  });

  test('prioriza conversation sobre os demais campos', () => {
    expect(
      extractText({ conversation: 'principal', extendedTextMessage: { text: 'secundário' } })
    ).toBe('principal');
  });
});

// ─── municipalityNameMatch ───────────────────────────────────────────────────

describe('normalizeMunicipalityKey', () => {
  test('converte para minúsculas', () => {
    expect(normalizeMunicipalityKey('PALMAS')).toBe('palmas');
    expect(normalizeMunicipalityKey('São Paulo')).toBe('sao paulo');
  });

  test('remove acentuação (NFD)', () => {
    expect(normalizeMunicipalityKey('São Paulo')).toBe('sao paulo');
    expect(normalizeMunicipalityKey('Araguaína')).toBe('araguaina');
    expect(normalizeMunicipalityKey('Marabá')).toBe('maraba');
    expect(normalizeMunicipalityKey('Açailândia')).toBe('acailandia');
  });

  test('normaliza espaços múltiplos para um único espaço', () => {
    expect(normalizeMunicipalityKey('São   Paulo')).toBe('sao paulo');
  });

  test('remove espaços nas bordas', () => {
    expect(normalizeMunicipalityKey('  Palmas  ')).toBe('palmas');
  });

  test('retorna string vazia para null/undefined', () => {
    expect(normalizeMunicipalityKey(null)).toBe('');
    expect(normalizeMunicipalityKey(undefined)).toBe('');
    expect(normalizeMunicipalityKey('')).toBe('');
  });

  test('permite comparar nomes com e sem acento como iguais', () => {
    const comAcento = normalizeMunicipalityKey('Araguaína');
    const semAcento = normalizeMunicipalityKey('Araguaina');
    expect(comAcento).toBe(semAcento);
  });
});

// ─── sidra1612ProductCropMap ─────────────────────────────────────────────────

describe('mapProductLabelToCropType', () => {
  test('mapeia rótulos com "soja" para "soja"', () => {
    expect(mapProductLabelToCropType('Soja (em grão)')).toBe('soja');
    expect(mapProductLabelToCropType('SOJA')).toBe('soja');
  });

  test('mapeia rótulos com "milho" para "milho"', () => {
    expect(mapProductLabelToCropType('Milho (em grão)')).toBe('milho');
    expect(mapProductLabelToCropType('milho')).toBe('milho');
  });

  test('mapeia rótulos com "trigo" para "trigo"', () => {
    expect(mapProductLabelToCropType('Trigo (em grão)')).toBe('trigo');
  });

  test('mapeia rótulos com "arroz" para "arroz"', () => {
    expect(mapProductLabelToCropType('Arroz (em casca)')).toBe('arroz');
  });

  test('mapeia rótulos com "feijão"/"feijao" para "feijao"', () => {
    expect(mapProductLabelToCropType('Feijão (em grão)')).toBe('feijao');
    expect(mapProductLabelToCropType('Feijao')).toBe('feijao');
  });

  test('mapeia rótulos com "algodão"/"algodao" para "algodao"', () => {
    expect(mapProductLabelToCropType('Algodão herbáceo (em caroço)')).toBe('algodao');
    expect(mapProductLabelToCropType('Algodao')).toBe('algodao');
  });

  test('mapeia rótulos com "cana" para "cana"', () => {
    expect(mapProductLabelToCropType('Cana-de-açúcar')).toBe('cana');
    expect(mapProductLabelToCropType('cana')).toBe('cana');
  });

  test('mapeia rótulos com "café"/"cafe" para "cafe"', () => {
    expect(mapProductLabelToCropType('Café (em coco)')).toBe('cafe');
    expect(mapProductLabelToCropType('Cafe')).toBe('cafe');
  });

  test('retorna null para "Total"', () => {
    expect(mapProductLabelToCropType('Total')).toBeNull();
    expect(mapProductLabelToCropType('total')).toBeNull();
  });

  test('retorna null para string vazia ou whitespace', () => {
    expect(mapProductLabelToCropType('')).toBeNull();
    expect(mapProductLabelToCropType('   ')).toBeNull();
    expect(mapProductLabelToCropType(null)).toBeNull();
  });

  test('gera slug para produto desconhecido (não retorna null)', () => {
    const result = mapProductLabelToCropType('Mandioca (aipim)');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('slugifySidraProductLabel', () => {
  test('retorna "outros" para "Total"', () => {
    expect(slugifySidraProductLabel('Total')).toBe('outros');
    expect(slugifySidraProductLabel('total')).toBe('outros');
  });

  test('retorna "outros" para string vazia ou null', () => {
    expect(slugifySidraProductLabel('')).toBe('outros');
    expect(slugifySidraProductLabel(null)).toBe('outros');
    expect(slugifySidraProductLabel(undefined)).toBe('outros');
  });

  test('gera slug em minúsculas sem acentos', () => {
    expect(slugifySidraProductLabel('Açaí')).toBe('acai');
    expect(slugifySidraProductLabel('Café')).toBe('cafe');
  });

  test('substitui caracteres especiais por underscores', () => {
    const slug = slugifySidraProductLabel('Mandioca (aipim)');
    expect(slug).toBe('mandioca_aipim');
  });

  test('não tem underscores nas bordas', () => {
    const slug = slugifySidraProductLabel(' Feijão ');
    expect(slug).not.toMatch(/^_|_$/);
  });

  test('limita o slug a 80 caracteres', () => {
    const longo = 'A'.repeat(200);
    expect(slugifySidraProductLabel(longo).length).toBeLessThanOrEqual(80);
  });

  test('slug é estável (mesma entrada → mesma saída)', () => {
    const label = 'Arroz (em casca)';
    expect(slugifySidraProductLabel(label)).toBe(slugifySidraProductLabel(label));
  });
});
