import { describe, expect, it } from 'vitest';
import {
  agruparTempoPorEtapa,
  concluidosNoPeriodo,
  contarPorPapel,
  emFluxo,
  saidaReativavel,
} from './indicadoresEsteira';

const DIA = 86_400;

describe('agruparTempoPorEtapa', () => {
  it('não mistura etapas de operações diferentes com o mesmo nome', () => {
    const r = agruparTempoPorEtapa([
      { operacao: 'TIM', chave: 'TIM_CRED_OK', estagioId: 't4', nome: 'Credenciamento OK', ordem: 4, segundos: 2 * DIA },
      { operacao: 'TIM', chave: 'TIM_CRED_OK', estagioId: 't4', nome: 'Credenciamento OK', ordem: 4, segundos: 4 * DIA },
      // Etapa Starlink renomeada pelo ADMIN para o mesmo nome da TIM.
      { operacao: 'STARLINK', chave: 'SL_CREDENCIAMENTO', estagioId: 's3', nome: 'Credenciamento OK', ordem: 3, segundos: 10 * DIA },
    ]);
    expect(r).toHaveLength(2);
    const tim = r.find((e) => e.operacao === 'TIM')!;
    const sl = r.find((e) => e.operacao === 'STARLINK')!;
    expect(tim).toMatchObject({ chave: 'TIM_CRED_OK', etapa: 'Credenciamento OK', passagens: 2, mediaDias: 3, papel: 'CREDENCIADO' });
    expect(sl).toMatchObject({ chave: 'SL_CREDENCIAMENTO', passagens: 1, mediaDias: 10, papel: 'ANALISE' });
  });

  it('papel vem da chave, não do nome (etapa renomeada não muda o papel)', () => {
    const [e] = agruparTempoPorEtapa([
      { operacao: 'TIM', chave: 'TIM_NEGOCIACAO', estagioId: 't1', nome: 'Apto para venda', ordem: 1, segundos: DIA },
    ]);
    expect(e!.papel).toBe('NOVO');
  });

  it('etapa sem chave agrupa pelo id do estágio, dentro da operação', () => {
    const r = agruparTempoPorEtapa([
      { operacao: 'TIM', chave: null, estagioId: 'a', nome: 'Antiga', ordem: 1, segundos: DIA },
      { operacao: 'TIM', chave: null, estagioId: 'b', nome: 'Antiga', ordem: 2, segundos: DIA },
    ]);
    expect(r).toHaveLength(2);
  });

  it('ordena por operação e depois pela ordem da etapa', () => {
    const r = agruparTempoPorEtapa([
      { operacao: 'STARLINK', chave: 'SL_AGUARDANDO', estagioId: 's1', nome: 'Aguardando contato', ordem: 1, segundos: DIA },
      { operacao: 'TIM', chave: 'TIM_DOCUMENTACAO', estagioId: 't2', nome: 'Doc', ordem: 2, segundos: DIA },
      { operacao: 'TIM', chave: 'TIM_NEGOCIACAO', estagioId: 't1', nome: 'Neg', ordem: 1, segundos: DIA },
    ]);
    expect(r.map((e) => e.chave)).toEqual(['TIM_NEGOCIACAO', 'TIM_DOCUMENTACAO', 'SL_AGUARDANDO']);
  });
});

describe('emFluxo', () => {
  it('com chave, a etapa decide: saída fica fora mesmo sem situação legada', () => {
    expect(emFluxo({ situacaoExcecao: null, estagio: { nome: 'Desistência', chave: 'TIM_DESISTENCIA' } })).toBe(false);
    expect(emFluxo({ situacaoExcecao: null, estagio: { nome: 'Nurture', chave: 'SL_NURTURE' } })).toBe(false);
  });

  it('com chave, situação legada preenchida não tira do fluxo (reativado)', () => {
    expect(emFluxo({ situacaoExcecao: 'CANCELADO', estagio: { nome: 'Em negociação', chave: 'TIM_NEGOCIACAO' } })).toBe(true);
  });

  it('sem chave, vale a situação legada', () => {
    expect(emFluxo({ situacaoExcecao: 'INATIVADO', estagio: { nome: 'Ativo', chave: null } })).toBe(false);
    expect(emFluxo({ situacaoExcecao: null, estagio: { nome: 'Ativo', chave: null } })).toBe(true);
  });
});

describe('contarPorPapel', () => {
  const card = (chave: string, nome = 'Qualquer') => ({ situacaoExcecao: null, estagio: { nome, chave } });

  it('pendentes e ativos pelos papéis da spec 4.7; saídas fora das duas contagens', () => {
    const r = contarPorPapel([
      card('TIM_DOCUMENTACAO'),
      card('SL_MEI'),
      card('SL_ALT_CNAE'),
      card('TIM_VENDA_LIBERADA'),
      card('TIM_ACOMPANHAMENTO'),
      card('SL_PRONTO_VENDA'),
      card('TIM_CRED_OK'),
      card('TIM_DESISTENCIA', 'Ativo'),
      card('SL_DESCARTADO', 'Pendência'),
    ]);
    expect(r).toEqual({ pendentes: 3, ativos: 3 });
  });

  it('nome renomeado não engana a contagem', () => {
    expect(contarPorPapel([card('TIM_NEGOCIACAO', 'Apto para venda')])).toEqual({ pendentes: 0, ativos: 0 });
  });
});

describe('concluidosNoPeriodo', () => {
  const periodo = { desde: new Date('2026-10-01T00:00:00Z'), ate: new Date('2026-10-31T23:59:59Z') };
  const criado = new Date('2026-08-01T00:00:00Z');
  const passagem = (id: string, quando: string, chave: string, nome = 'X') => ({
    credenciamentoId: id,
    criadoEm: new Date(quando),
    paraEstagio: { nome, chave },
    credenciamento: { criadoEm: criado, responsavelId: 'u1' },
  });

  it('termina ao entrar em CREDENCIADO; avançar depois não conta de novo', () => {
    const r = concluidosNoPeriodo(
      [
        passagem('a', '2026-09-10T00:00:00Z', 'TIM_CRED_OK'),
        passagem('a', '2026-10-05T00:00:00Z', 'TIM_POS_CRED'),
        passagem('a', '2026-10-06T00:00:00Z', 'TIM_VENDA_LIBERADA'),
      ],
      periodo,
    );
    expect(r).toEqual([]);
  });

  it('conta quem entrou em CREDENCIADO dentro do período, com a duração desde a criação', () => {
    const r = concluidosNoPeriodo(
      [passagem('b', '2026-10-01T00:00:00Z', 'TIM_DOCUMENTACAO'), passagem('b', '2026-10-01T00:00:00Z', 'SL_TREINAMENTO')],
      periodo,
    );
    expect(r).toEqual([{ dias: 61, responsavelId: 'u1' }]);
  });

  it('pulo direto para ATIVO também conclui; nome não decide', () => {
    const r = concluidosNoPeriodo([passagem('c', '2026-10-02T00:00:00Z', 'TIM_VENDA_LIBERADA', 'Em negociação')], periodo);
    expect(r).toHaveLength(1);
    expect(concluidosNoPeriodo([passagem('d', '2026-10-02T00:00:00Z', 'TIM_NEGOCIACAO', 'Credenciado')], periodo)).toEqual([]);
  });

  it('entrada depois do fim do período não conta', () => {
    expect(concluidosNoPeriodo([passagem('e', '2026-11-02T00:00:00Z', 'TIM_CRED_OK')], periodo)).toEqual([]);
  });
});

describe('saidaReativavel', () => {
  it('descredenciado e nurture podem voltar; desistência e descartado não entram na lista', () => {
    expect(saidaReativavel('TIM_DESCREDENCIADO')).toBe(true);
    expect(saidaReativavel('SL_NURTURE')).toBe(true);
    expect(saidaReativavel('TIM_DESISTENCIA')).toBe(false);
    expect(saidaReativavel('SL_DESCARTADO')).toBe(false);
    expect(saidaReativavel('TIM_NEGOCIACAO')).toBe(false);
    expect(saidaReativavel(null)).toBe(false);
  });
});
