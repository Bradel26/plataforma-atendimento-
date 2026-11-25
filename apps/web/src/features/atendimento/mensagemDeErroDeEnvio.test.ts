import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api';
import { MSG_RECUSA_DO_WHATSAPP, textoDoErroDeEnvio } from './mensagemDeErroDeEnvio';

describe('textoDoErroDeEnvio', () => {
  it('troca o fragmento sem sentido do conector (ex.: "t") por uma explicacao', () => {
    expect(textoDoErroDeEnvio(new ApiError(502, 'WEBJS_LOCAL_RECUSOU', 't'), 'Falha')).toBe(MSG_RECUSA_DO_WHATSAPP);
  });

  it('o mesmo vale para qualquer 502 com texto curto ou sem espaco', () => {
    expect(textoDoErroDeEnvio(new ApiError(502, 'X', 'Error'), 'Falha')).toBe(MSG_RECUSA_DO_WHATSAPP);
  });

  it('erro claro do servidor passa como veio', () => {
    const msg = 'A janela de 24 horas do WhatsApp está fechada.';
    expect(textoDoErroDeEnvio(new ApiError(409, 'JANELA', msg), 'Falha')).toBe(msg);
    expect(textoDoErroDeEnvio(new ApiError(502, 'WEBJS_LOCAL_RECUSOU', 'Conecte o WhatsApp pelo Atendimento primeiro.'), 'Falha')).toBe(
      'Conecte o WhatsApp pelo Atendimento primeiro.',
    );
  });

  it('erro que nao e da API usa o texto padrao', () => {
    expect(textoDoErroDeEnvio(new Error('x'), 'Falha ao enviar o arquivo')).toBe('Falha ao enviar o arquivo');
  });
});
