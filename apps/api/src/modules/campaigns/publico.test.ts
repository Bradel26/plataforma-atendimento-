import { describe, expect, it } from 'vitest';
import {
  CAMPO_DO_CANAL,
  descreverFiltro,
  filtroVazio,
  montarPublico,
  type ContatoDoPublico,
} from './publico';

/**
 * Espalhamento, e nao `??` campo por campo.
 *
 * A primeira versao usava `over.telefone ?? '+5511...'`, e por isso
 * `pessoa({ telefone: null })` recebia o telefone padrao: `??` trata nulo como
 * ausencia. Tres casos passaram a testar o contrario do que diziam — a mesma
 * confusao entre "nao informado" e "nulo" que este modulo existe para evitar.
 */
const pessoa = (over: Partial<ContatoDoPublico> = {}): ContatoDoPublico => ({
  id: 'c1',
  nome: 'Alguém',
  email: 'alguem@exemplo.com',
  telefone: '+5511900000000',
  anonimizadoEm: null,
  ...over,
});

describe('montarPublico', () => {
  it('separa quem recebe de quem falta telefone, no WhatsApp', () => {
    const p = montarPublico(
      [pessoa({ id: 'a' }), pessoa({ id: 'b', telefone: null })],
      'WHATSAPP',
    );
    expect(p.alcancaveis.map((c) => c.id)).toEqual(['a']);
    expect(p.semEndereco.map((c) => c.id)).toEqual(['b']);
  });

  it('não soma quem não recebe no número do público', () => {
    // O defeito que este modulo existe para evitar: "publico: 2" e depois uma
    // falha no relatorio. `totalFiltrado` fica disponivel a parte.
    const p = montarPublico([pessoa({ id: 'a' }), pessoa({ id: 'b', telefone: null })], 'WHATSAPP');
    expect(p.alcancaveis).toHaveLength(1);
    expect(p.totalFiltrado).toBe(2);
  });

  it('telefone em branco conta como ausente', () => {
    const p = montarPublico([pessoa({ telefone: '   ' })], 'WHATSAPP');
    expect(p.alcancaveis).toHaveLength(0);
    expect(p.semEndereco).toHaveLength(1);
  });

  it('cobra e-mail, é não telefone, na campanha de e-mail', () => {
    const p = montarPublico(
      [pessoa({ id: 'a', email: null }), pessoa({ id: 'b', telefone: null })],
      'EMAIL',
    );
    expect(p.alcancaveis.map((c) => c.id)).toEqual(['b']);
    expect(p.semEndereco.map((c) => c.id)).toEqual(['a']);
  });

  it('anonimizado por LGPD nunca entra, mesmo com telefone preenchido', () => {
    const p = montarPublico([pessoa({ anonimizadoEm: new Date() })], 'WHATSAPP');
    expect(p.alcancaveis).toHaveLength(0);
    expect(p.anonimizados).toHaveLength(1);
  });

  it('anonimizado sai ANTES da conta de endereço, é não vira "cadastro a completar"', () => {
    // Se caisse em `semEndereco`, a tela convidaria a "completar o cadastro" de
    // quem pediu para ser esquecido.
    const p = montarPublico([pessoa({ anonimizadoEm: new Date(), telefone: null })], 'WHATSAPP');
    expect(p.semEndereco).toHaveLength(0);
    expect(p.anonimizados).toHaveLength(1);
  });

  it('as três listas particionam o filtrado: ninguém se perde nem conta duas vezes', () => {
    const p = montarPublico(
      [
        pessoa({ id: 'a' }),
        pessoa({ id: 'b', telefone: null }),
        pessoa({ id: 'c', anonimizadoEm: new Date() }),
      ],
      'WHATSAPP',
    );
    expect(p.alcancaveis.length + p.semEndereco.length + p.anonimizados.length).toBe(p.totalFiltrado);
  });

  it('canal que não alcanca ninguém não monta público alcançável', () => {
    // Webchat e redes sociais nao tem endereco proprio no cadastro: e o cliente
    // que precisa escrever primeiro.
    const p = montarPublico([pessoa(), pessoa({ id: 'b' })], 'WEBCHAT');
    expect(p.alcancaveis).toHaveLength(0);
    expect(p.semEndereco).toHaveLength(2);
    expect(p.campoExigido).toBeNull();
  });

  it('lista vazia não inventa número', () => {
    const p = montarPublico([], 'WHATSAPP');
    expect(p).toMatchObject({ totalFiltrado: 0, campoExigido: 'telefone' });
    expect(p.alcancaveis).toEqual([]);
  });

  it('todo canal tem regra declarada — canal novo não entra em silencio', () => {
    for (const [canal, campo] of Object.entries(CAMPO_DO_CANAL)) {
      expect([null, 'telefone', 'email'], `canal ${canal}`).toContain(campo);
    }
    expect(Object.keys(CAMPO_DO_CANAL).sort()).toEqual(
      ['EMAIL', 'FACEBOOK', 'INDICACAO', 'INSTAGRAM', 'PROSPECCAO_ATIVA', 'VOZ', 'WEBCHAT', 'WHATSAPP'].sort(),
    );
  });
});

describe('filtroVazio', () => {
  it('objeto sem nada e vazio', () => {
    expect(filtroVazio({})).toBe(true);
  });

  it('lista vazia também e vazio: não seleciona a base inteira', () => {
    expect(filtroVazio({ ciclo: [], tags: [], origem: [], papel: [] })).toBe(true);
  });

  it('um degrau já e filtro', () => {
    expect(filtroVazio({ ciclo: ['CLIENTE'] })).toBe(false);
  });

  it('"sem responsável" e um filtro de verdade, é não ausência de filtro', () => {
    // `null` explicito e a carteira aberta — uma pergunta legitima. Se contasse
    // como vazio, o pedido seria recusado sem motivo.
    expect(filtroVazio({ responsavelId: null })).toBe(false);
  });

  it('etiqueta sozinha e filtro', () => {
    expect(filtroVazio({ tags: ['revenda'] })).toBe(false);
  });
});

describe('descreverFiltro', () => {
  it('descreve o que foi pedido, para responder "para quem isso foi?" depois', () => {
    const frase = descreverFiltro({ ciclo: ['CLIENTE'], tags: ['revenda'] });
    expect(frase).toContain('ciclo: CLIENTE');
    expect(frase).toContain('etiquetas: revenda');
  });

  it('diz "sem filtro" em vez de devolver texto vazio', () => {
    expect(descreverFiltro({})).toBe('sem filtro');
  });

  it('distingue "sem responsável" de um responsável especifico', () => {
    expect(descreverFiltro({ responsavelId: null })).toContain('sem responsável');
    expect(descreverFiltro({ responsavelId: 'u1' })).toContain('responsável: u1');
  });
});
