/**
 * Metas operacionais do consultor de credenciamento — regras puras.
 *
 * Sao metas de PROCESSO (parceiros cadastrados, credenciados, contatos feitos), e
 * ficam separadas da meta comercial em dinheiro (`metas.ts`). O CRM ainda nao tem
 * venda por parceiro, entao nenhum indicador aqui usa venda, faturamento ou
 * volume; quando esses dados existirem entram como indicadores novos, sem mexer
 * nos atuais.
 */

/** Mesmas situacoes do painel de metas comerciais, para a tela reaproveitar cores e rotulos. */
export type SituacaoMeta = 'ATINGIDA' | 'NO_RITMO' | 'ABAIXO' | 'SEM_META';

export const INDICADORES = [
  {
    chave: 'NOVOS_PARCEIROS',
    rotulo: 'Novos parceiros',
    unidade: 'qtd',
    sentido: 'maior',
    comoMede: 'Parceiros cadastrados na esteira no mês, sob sua responsabilidade.',
  },
  {
    chave: 'CREDENCIAMENTOS_CONCLUIDOS',
    rotulo: 'Credenciamentos',
    unidade: 'qtd',
    sentido: 'maior',
    comoMede: 'Parceiros que chegaram ao estágio Ativo da esteira no mês.',
  },
  {
    chave: 'TAXA_CONVERSAO',
    rotulo: 'Taxa de conversão',
    unidade: 'pct',
    sentido: 'maior',
    comoMede: 'Credenciados dividido pelos parceiros trabalhados no mês (cadastrados ou que mudaram de etapa).',
  },
  {
    chave: 'PARCEIROS_ATIVADOS',
    rotulo: 'Parceiros ativados',
    unidade: 'qtd',
    sentido: 'maior',
    comoMede: 'Parceiros que concluiram todas as etapas de implantação no mês.',
  },
  {
    chave: 'CONTATOS_REALIZADOS',
    rotulo: 'Contatos realizados',
    unidade: 'qtd',
    sentido: 'maior',
    comoMede: 'Interações que você registrou no CRM no mês: ligação, WhatsApp, visita, reunião, retorno...',
  },
  {
    chave: 'PARCEIROS_SEM_ACOMPANHAMENTO',
    rotulo: 'Parceiros sem acompanhamento',
    unidade: 'qtd',
    sentido: 'menor',
    comoMede: 'Parceiros da sua carteira há mais de 30 dias sem contato. Posição de hoje; a meta e o máximo aceito.',
  },
  {
    chave: 'REATIVACOES',
    rotulo: 'Reativações',
    unidade: 'qtd',
    sentido: 'maior',
    comoMede: 'Parceiros em risco ou inativos que voltaram a ser acompanhados (marcados como Reativado) no mês.',
  },
] as const;

export type IndicadorChave = (typeof INDICADORES)[number]['chave'];

export const CHAVES_INDICADORES = INDICADORES.map((i) => i.chave) as [IndicadorChave, ...IndicadorChave[]];

export type ProgressoOperacional = {
  alvo: number | null;
  realizado: number | null;
  /** 0..n (1 = 100%). Nulo sem meta ou sem realizado. */
  percentual: number | null;
  situacao: SituacaoMeta;
};

/**
 * Progresso de um indicador.
 *
 * `fracaoDoMes` (0..1) e quanto do mes ja passou: no mes corrente, quem esta
 * abaixo do que o calendario ja "gastou" fica ABAIXO, e quem esta na frente esta
 * NO_RITMO. Mes fechado usa 1 — so vale bater a meta inteira.
 *
 * Nos indicadores em que MENOS e melhor, a meta e um teto: dentro dele a meta esta
 * ATINGIDA (e continua assim), acima dele esta ABAIXO.
 */
export function progressoOperacional(input: {
  alvo: number | null;
  realizado: number | null;
  sentido: 'maior' | 'menor';
  fracaoDoMes: number;
}): ProgressoOperacional {
  const { alvo, realizado, sentido, fracaoDoMes } = input;
  if (alvo === null) return { alvo, realizado, percentual: null, situacao: 'SEM_META' };
  if (realizado === null) return { alvo, realizado, percentual: null, situacao: 'SEM_META' };

  const percentual = alvo > 0 ? realizado / alvo : null;

  if (sentido === 'menor') {
    return { alvo, realizado, percentual, situacao: realizado <= alvo ? 'ATINGIDA' : 'ABAIXO' };
  }
  if (alvo === 0) return { alvo, realizado, percentual, situacao: 'ATINGIDA' };
  if (realizado >= alvo) return { alvo, realizado, percentual, situacao: 'ATINGIDA' };
  return { alvo, realizado, percentual, situacao: realizado / alvo >= fracaoDoMes ? 'NO_RITMO' : 'ABAIXO' };
}

/** Quanto do mes ja passou: 1 para mes fechado, 0 para mes futuro. */
export function fracaoDoMes(mes: Date, hoje: Date): number {
  const inicio = Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), 1);
  const fim = Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 1);
  if (hoje.getTime() >= fim) return 1;
  if (hoje.getTime() < inicio) return 0;
  return (hoje.getTime() - inicio) / (fim - inicio);
}

/** Taxa em pontos percentuais inteiros (60 = 60%); nula sem base. */
export function taxaDeConversao(concluidos: number, trabalhados: number): number | null {
  return trabalhados > 0 ? Math.round((concluidos / trabalhados) * 100) : null;
}
