import { describe, expect, it } from 'vitest';
import { discordanciaDaTemperatura, etiquetasDoCartao, LABEL_TEMPERATURA } from './temperatura';

describe('etiquetasDoCartao', () => {
  it('nao mostra etiqueta nenhuma quando ninguem leu nem registrou', () => {
    // A regra central do item: nulo NAO vira "Fria". As oportunidades que
    // existiam antes da coluna nunca foram lidas, e pinta-las de frias seria
    // inventar uma leitura em nome do vendedor.
    expect(etiquetasDoCartao({ temperatura: null, canalOrigem: null })).toEqual([]);
  });

  it('trata campo ausente igual a nulo', () => {
    // A API antiga pode nao mandar os campos; ausencia tambem e "ninguem disse".
    expect(etiquetasDoCartao({})).toEqual([]);
  });

  it('escreve a palavra, e nao so a cor', () => {
    const [etiqueta] = etiquetasDoCartao({ temperatura: 'FRIA' });
    expect(etiqueta?.texto).toBe('Fria');
  });

  it('so "quente" ganha destaque; frio e morno ficam cinza', () => {
    // Ambar esta reservado para compromisso descumprido (sinalDeAcao), e
    // negocio frio nao e compromisso descumprido.
    expect(etiquetasDoCartao({ temperatura: 'FRIA' })[0]?.tom).toBe('neutro');
    expect(etiquetasDoCartao({ temperatura: 'MORNA' })[0]?.tom).toBe('neutro');
    expect(etiquetasDoCartao({ temperatura: 'QUENTE' })[0]?.tom).toBe('marca');
  });

  it('explica no hover que temperatura nao e a probabilidade da etapa', () => {
    const [etiqueta] = etiquetasDoCartao({ temperatura: 'MORNA' });
    expect(etiqueta?.titulo).toContain('Nao e a probabilidade da etapa');
  });

  it('mostra a origem com o rotulo de sempre', () => {
    const etiquetas = etiquetasDoCartao({ canalOrigem: 'WHATSAPP' });
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0]?.texto).toBe('WhatsApp');
  });

  it('mantem ordem fixa: temperatura antes de origem', () => {
    // Etiqueta que troca de lugar conforme o que esta preenchido obriga a ler
    // cada cartao de novo, e o vendedor varre cem.
    const etiquetas = etiquetasDoCartao({ temperatura: 'QUENTE', canalOrigem: 'EMAIL' });
    expect(etiquetas.map((e) => e.texto)).toEqual(['Quente', 'E-mail']);
  });

  it('mostra origem sozinha quando ninguem leu a temperatura', () => {
    const etiquetas = etiquetasDoCartao({ temperatura: null, canalOrigem: 'VOZ' });
    expect(etiquetas.map((e) => e.texto)).toEqual(['Telefone']);
  });

  it('tem rotulo para os tres degraus, e sao tres', () => {
    // Tres e nao cinco de proposito: escala fina vira ruido, todo mundo marca o
    // meio. O teste trava a decisao.
    expect(Object.keys(LABEL_TEMPERATURA)).toEqual(['FRIA', 'MORNA', 'QUENTE']);
  });
});

describe('discordanciaDaTemperatura', () => {
  const FUNIL = [10, 40, 70, 90];

  it('avisa quando o negocio esta frio na etapa mais avancada', () => {
    // O cartao que infla a previsao: a etapa diz "quase fechando", e quem esta
    // na negociacao diz que esfriou.
    expect(discordanciaDaTemperatura('FRIA', 90, FUNIL)).toBe('Fria na etapa mais avancada do funil');
  });

  it('cala quando a etapa nao e a mais avancada', () => {
    expect(discordanciaDaTemperatura('FRIA', 70, FUNIL)).toBeNull();
  });

  it('cala para quente em etapa inicial: otimismo comum nao muda decisao', () => {
    expect(discordanciaDaTemperatura('QUENTE', 10, FUNIL)).toBeNull();
  });

  it('cala sem temperatura — nao ha discordancia com uma leitura que nao existe', () => {
    expect(discordanciaDaTemperatura(null, 90, FUNIL)).toBeNull();
    expect(discordanciaDaTemperatura(undefined, 90, FUNIL)).toBeNull();
  });

  it('cala sem probabilidade: falta o outro lado da comparacao', () => {
    expect(discordanciaDaTemperatura('FRIA', null, FUNIL)).toBeNull();
  });

  it('cala em funil de uma etapa, onde "mais avancada" nao significa nada', () => {
    expect(discordanciaDaTemperatura('FRIA', 50, [50])).toBeNull();
    expect(discordanciaDaTemperatura('FRIA', 50, [])).toBeNull();
  });

  it('nao usa limiar proprio: o mesmo cartao muda de resposta conforme o funil', () => {
    // 60% e "mais avancada" num funil que para em 60, e nao e em outro que vai
    // a 90. Um numero fixo meu estaria errado nos dois.
    expect(discordanciaDaTemperatura('FRIA', 60, [20, 60])).toBe('Fria na etapa mais avancada do funil');
    expect(discordanciaDaTemperatura('FRIA', 60, [20, 60, 90])).toBeNull();
  });

  it('probabilidade zero na etapa ainda conta como numero, e nao como ausencia', () => {
    // Guarda contra `if (!probabilidade)`, que trataria 0% como "nao informado".
    expect(discordanciaDaTemperatura('FRIA', 0, [0, 50])).toBeNull();
  });
});
