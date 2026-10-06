import { describe, expect, it } from 'vitest';
import { identificarSegmentoParceiro } from './segmentoParceiro';

describe('identificarSegmentoParceiro', () => {
  it('reconhece Starlink pela fonte, mesmo sem telefone', () => {
    expect(
      identificarSegmentoParceiro(
        null,
        'CNPJ: 12.345.678/0001-90; DDD/UF não identificáveis: telefone ausente; Fonte: CONTATOS STARLINK',
      ),
    ).toBe('STARLINK');
  });

  it('reconhece TIM por qualquer fonte que termine em TIM', () => {
    expect(identificarSegmentoParceiro(null, 'CNPJ: 1; Fonte: PLANILHA REVENDAS TIM')).toBe('TIM');
    expect(identificarSegmentoParceiro(null, 'fonte: carteira pdv tim; uf: SP')).toBe('TIM');
  });

  it('reconhece a carteira PDV TIM', () => {
    expect(identificarSegmentoParceiro(null, 'Importado da carteira PDV TIM')).toBe('TIM');
  });

  it('reconhece "Importado ... Starlink" sem Fonte', () => {
    expect(identificarSegmentoParceiro(null, 'Importado da base Starlink 2026')).toBe('STARLINK');
  });

  it('a fonte decide mesmo quando o resto do texto cita a outra operação', () => {
    expect(identificarSegmentoParceiro(null, 'Fonte: CONTATOS STARLINK; antes era PDV TIM')).toBe('STARLINK');
    expect(identificarSegmentoParceiro(null, 'Fonte: CONTATOS TIM; quer Starlink também')).toBe('TIM');
  });

  it('ignora palavras que só contêm TIM e textos sem origem', () => {
    expect(identificarSegmentoParceiro(null, 'Fonte: planilha antiga; último contato em 2025')).toBeNull();
    expect(identificarSegmentoParceiro(null, 'Fonte: estimativa comercial')).toBeNull();
    expect(identificarSegmentoParceiro(null, 'Cliente de Timbó, sem origem')).toBeNull();
    expect(identificarSegmentoParceiro(null, null)).toBeNull();
  });

  it('o segmento informado prevalece sobre as observações', () => {
    expect(identificarSegmentoParceiro('starlink', 'Fonte: CONTATOS TIM')).toBe('STARLINK');
    expect(identificarSegmentoParceiro('', 'Fonte: CONTATOS TIM')).toBe('TIM');
  });
});
