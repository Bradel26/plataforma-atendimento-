import { describe, expect, it } from 'vitest';
import type { EstruturaEsteira, EtapaEsteira } from '../../lib/esteiraTypes';
import {
  colunasDoKanban,
  decidirMovimento,
  estadoDoErro,
  podeSoltar,
  rotuloPendencia,
  textoParado,
  textoUltimaInteracao,
  type EstadoDialogo,
} from './regrasMovimento';

const etapa = (chave: string, tipo: 'NORMAL' | 'DESVIO' | 'SAIDA', ordem: number, ativa = true): EtapaEsteira =>
  ({
    chave,
    nome: `Etapa ${chave}`,
    tipo,
    ordem,
    papel: null,
    trilho: tipo === 'NORMAL' ? ordem : null,
    id: `id-${chave}`,
    diasParado: null,
    diasParadoEfetivo: tipo === 'SAIDA' ? null : 7,
    ativa,
  }) as EtapaEsteira;

const MOTIVOS: EstruturaEsteira['motivosPerda'] = [
  { valor: 'NAO_RESPONDEU', rotulo: 'Não respondeu', classe: 'RECUPERAVEL' },
  { valor: 'SEM_CONTATO', rotulo: 'Sem contato', classe: 'RECUPERAVEL' },
  { valor: 'SEM_INTERESSE', rotulo: 'Sem interesse', classe: 'DEFINITIVO' },
  { valor: 'CNPJ_IRREGULAR', rotulo: 'CNPJ irregular', classe: 'DEFINITIVO' },
];

describe('podeSoltar', () => {
  it('proibido e indefinido não aceitam o cartão', () => {
    expect(podeSoltar('PROIBIDO', true).permitido).toBe(false);
    expect(podeSoltar(undefined, true).permitido).toBe(false);
  });

  it('exceção só para quem pode forçar; sem permissão explica o motivo', () => {
    expect(podeSoltar('EXCECAO', true)).toEqual({ permitido: true, aviso: 'Fora da regra: pede justificativa' });
    const negado = podeSoltar('EXCECAO', false);
    expect(negado.permitido).toBe(false);
    expect(negado.aviso).toMatch(/administrador, supervisor ou gestor/);
  });

  it('livre não tem aviso; justificativa avisa', () => {
    expect(podeSoltar('LIVRE', false)).toEqual({ permitido: true, aviso: null });
    expect(podeSoltar('JUSTIFICATIVA', false)).toEqual({ permitido: true, aviso: 'Pede justificativa' });
  });
});

describe('decidirMovimento', () => {
  const base = { podeForcar: true, motivosPerda: MOTIVOS };

  it('livre numa etapa normal vai direto ao servidor', () => {
    const d = decidirMovimento({ ...base, operacao: 'TIM', destino: 'LIVRE', etapa: etapa('TIM_DOCUMENTACAO', 'NORMAL', 2) });
    expect(d.tipo).toBe('direto');
    expect(d.contexto.titulo).toBe('Mover para Etapa TIM_DOCUMENTACAO');
  });

  it('exceção vai direto: o servidor devolve as pendências no 409', () => {
    const d = decidirMovimento({ ...base, operacao: 'TIM', destino: 'EXCECAO', etapa: etapa('TIM_POS_CRED', 'NORMAL', 5) });
    expect(d.tipo).toBe('direto');
  });

  it('exceção sem permissão de forçar é bloqueada', () => {
    const d = decidirMovimento({
      ...base,
      podeForcar: false,
      operacao: 'TIM',
      destino: 'EXCECAO',
      etapa: etapa('TIM_POS_CRED', 'NORMAL', 5),
    });
    expect(d.tipo).toBe('bloqueado');
  });

  it('proibido é bloqueado', () => {
    const d = decidirMovimento({ ...base, operacao: 'TIM', destino: 'PROIBIDO', etapa: etapa('TIM_NEGOCIACAO', 'NORMAL', 1) });
    expect(d.tipo).toBe('bloqueado');
  });

  it('justificativa abre o diálogo pedindo o texto', () => {
    const d = decidirMovimento({ ...base, operacao: 'TIM', destino: 'JUSTIFICATIVA', etapa: etapa('TIM_NEGOCIACAO', 'NORMAL', 1) });
    expect(d.tipo).toBe('dialogo');
    if (d.tipo !== 'dialogo') return;
    expect(d.estado.pedeJustificativa).toBe(true);
    expect(d.estado.motivo).toBeNull();
  });

  it('saída TIM pede motivo em texto (sem justificativa se livre)', () => {
    const d = decidirMovimento({ ...base, operacao: 'TIM', destino: 'LIVRE', etapa: etapa('TIM_DESISTENCIA', 'SAIDA', 8) });
    expect(d.tipo).toBe('dialogo');
    if (d.tipo !== 'dialogo') return;
    expect(d.estado.motivo).toEqual({ tipo: 'texto' });
    expect(d.estado.pedeJustificativa).toBe(false);
  });

  it('saída Starlink pede o motivo da perda filtrado pela classe da coluna', () => {
    const nurture = decidirMovimento({ ...base, operacao: 'STARLINK', destino: 'LIVRE', etapa: etapa('SL_NURTURE', 'SAIDA', 10) });
    const descartado = decidirMovimento({
      ...base,
      operacao: 'STARLINK',
      destino: 'JUSTIFICATIVA',
      etapa: etapa('SL_DESCARTADO', 'SAIDA', 11),
    });
    expect(nurture.tipo === 'dialogo' && nurture.estado.motivo).toEqual({
      tipo: 'perda',
      opcoes: [
        { valor: 'NAO_RESPONDEU', rotulo: 'Não respondeu' },
        { valor: 'SEM_CONTATO', rotulo: 'Sem contato' },
      ],
    });
    expect(descartado.tipo === 'dialogo' && descartado.estado.motivo).toEqual({
      tipo: 'perda',
      opcoes: [
        { valor: 'SEM_INTERESSE', rotulo: 'Sem interesse' },
        { valor: 'CNPJ_IRREGULAR', rotulo: 'CNPJ irregular' },
      ],
    });
    expect(descartado.tipo === 'dialogo' && descartado.estado.pedeJustificativa).toBe(true);
  });
});

describe('estadoDoErro', () => {
  const contexto = { titulo: 'Mover para Pós-cred', operacao: 'TIM' as const, motivoSeExigido: null };

  it('409 EXIGE_JUSTIFICATIVA abre o diálogo com as pendências traduzidas', () => {
    const e = estadoDoErro(
      {
        status: 409,
        code: 'EXIGE_JUSTIFICATIVA',
        message: 'Informe a justificativa para mover fora da regra',
        details: { resultado: 'EXCECAO', pendencias: ['matriculaSappdv', 'vendedorAtivo'] },
      },
      null,
      contexto,
    );
    expect(e).not.toBeNull();
    expect(e!.pedeJustificativa).toBe(true);
    expect(e!.pendencias).toEqual(['Matrícula SAPPDV preenchida', 'Ao menos um vendedor ativo no PDV']);
    expect(e!.bloqueio).toBeNull();
    // Primeira vez: ainda não pediu, então não é erro.
    expect(e!.erro).toBeNull();
    expect(e!.titulo).toBe('Mover para Pós-cred');
  });

  it('409 depois de já pedir a justificativa mostra a mensagem como erro', () => {
    const anterior: EstadoDialogo = {
      titulo: 'X',
      descricao: '',
      pendencias: [],
      pedeJustificativa: true,
      motivo: null,
      bloqueio: null,
      erro: null,
    };
    const e = estadoDoErro({ status: 409, code: 'EXIGE_JUSTIFICATIVA', message: 'Informe', details: {} }, anterior, contexto);
    expect(e!.erro).toBe('Informe');
    expect(e!.titulo).toBe('X');
  });

  it('403 EXCECAO_NAO_AUTORIZADA vira bloqueio com as pendências', () => {
    const e = estadoDoErro(
      { status: 403, code: 'EXCECAO_NAO_AUTORIZADA', message: 'Só gestores', details: { pendencias: ['compraChip'] } },
      null,
      contexto,
    );
    expect(e!.bloqueio).toBe('Só gestores');
    expect(e!.pendencias).toEqual(['Compra de chip concluída']);
  });

  it('400 TRANSICAO_PROIBIDA vira bloqueio', () => {
    const e = estadoDoErro({ status: 400, code: 'TRANSICAO_PROIBIDA', message: 'Não pode' }, null, contexto);
    expect(e!.bloqueio).toBe('Não pode');
  });

  it('400 EXIGE_MOTIVO pede o motivo do contexto (texto quando não há outro)', () => {
    const e = estadoDoErro({ status: 400, code: 'EXIGE_MOTIVO', message: 'Informe o motivo' }, null, contexto);
    expect(e!.motivo).toEqual({ tipo: 'texto' });
    const perda = { tipo: 'perda' as const, opcoes: [{ valor: 'SEM_CONTATO', rotulo: 'Sem contato' }] };
    const e2 = estadoDoErro(
      { status: 400, code: 'EXIGE_MOTIVO', message: 'Informe o motivo' },
      null,
      { ...contexto, motivoSeExigido: perda },
    );
    expect(e2!.motivo).toEqual(perda);
  });

  it('outros erros não são de regra', () => {
    expect(estadoDoErro({ status: 400, code: 'CAMPO_BLOQUEADO', message: 'x' }, null, contexto)).toBeNull();
    expect(estadoDoErro({ status: 500, code: 'ERRO', message: 'x' }, null, contexto)).toBeNull();
    expect(estadoDoErro({ status: 403, code: 'FORBIDDEN', message: 'x' }, null, contexto)).toBeNull();
  });
});

describe('rotuloPendencia', () => {
  it('traduz por operação (treinamento difere entre TIM e Starlink)', () => {
    expect(rotuloPendencia('TIM', 'treinamento')).toBe('Treinamento concluído');
    expect(rotuloPendencia('STARLINK', 'treinamento')).toBe('Treinamento: Sim');
    expect(rotuloPendencia('STARLINK', 'vivensisStatus')).toBe('Vivensis aprovado');
    expect(rotuloPendencia('TIM', 'campoNovo')).toBe('campoNovo');
  });
});

describe('textoParado', () => {
  it('singular e plural', () => {
    expect(textoParado(1)).toBe('Parado há 1 dia');
    expect(textoParado(12)).toBe('Parado há 12 dias');
    expect(textoParado(0)).toBe('Parado há menos de 1 dia');
  });
});

describe('textoUltimaInteracao', () => {
  const agora = new Date('2026-10-26T15:00:00-03:00');
  it('hoje, ontem, dias e data', () => {
    expect(textoUltimaInteracao('2026-10-26T08:00:00-03:00', agora)).toBe('hoje');
    expect(textoUltimaInteracao('2026-10-25T23:00:00-03:00', agora)).toBe('ontem');
    expect(textoUltimaInteracao('2026-10-20T10:00:00-03:00', agora)).toBe('há 6 dias');
    expect(textoUltimaInteracao('2026-08-01T10:00:00-03:00', agora)).toBe('01/08/2026');
  });
});

describe('colunasDoKanban', () => {
  it('só ativas, na ordem da estrutura, marcando as laterais', () => {
    const etapas = [
      etapa('SL_NURTURE', 'SAIDA', 10),
      etapa('SL_AGUARDANDO', 'NORMAL', 1),
      etapa('SL_MEI', 'DESVIO', 8),
      etapa('SL_EM_ATENDIMENTO', 'NORMAL', 2, false),
    ];
    expect(colunasDoKanban(etapas).map((c) => [c.chave, c.lateral])).toEqual([
      ['SL_AGUARDANDO', false],
      ['SL_MEI', true],
      ['SL_NURTURE', true],
    ]);
  });
});
