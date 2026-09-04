/**
 * Metas mensais: aritmetica pura (item 4.1 do plano em ANALISE-CRM.md).
 *
 * Consulta fina, agregacao pura — o mesmo padrao dos quatro relatorios da onda 1.
 * O que erra aqui nao quebra: mostra um numero plausivel e errado, e meta e
 * exatamente o tipo de numero que ninguem confere de cabeca.
 */

/** Primeiro dia do mes, em UTC. */
export function competencia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Primeiro dia do mes seguinte, em UTC — o limite superior aberto do periodo. */
export function proximoMes(mes: Date): Date {
  return new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 1));
}

/** Quantos dias tem o mes da competencia. */
export function diasNoMes(mes: Date): number {
  return new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Rampa: a lista de competencias de um intervalo de meses, inclusive.
 *
 * Existe para a tela poder gravar doze linhas de uma vez. Sem isso, "meta
 * diferente por mes" seria doze idas ao formulario e ninguem faria — e a rampa
 * mensal e justamente o que distingue este recurso de uma meta anual.
 */
export function mesesEntre(de: Date, ate: Date): Date[] {
  const inicio = competencia(de);
  const fim = competencia(ate);
  if (fim < inicio) return [];
  const saida: Date[] = [];
  let atual = inicio;
  // Teto de 36 meses: uma rampa maior que tres anos e quase certamente erro de
  // digitacao na data, e gerar 1.200 linhas por engano e pior que recusar.
  while (atual <= fim && saida.length < 36) {
    saida.push(atual);
    atual = proximoMes(atual);
  }
  return saida;
}

export type ProgressoDaMeta = {
  /** Valor a atingir. */
  meta: number;
  /** Ganho no mes. */
  realizado: number;
  /** Fracao da meta. Nulo quando nao ha meta — nulo nao e zero. */
  percentual: number | null;
  /** O que falta. Negativo quando passou da meta. */
  falta: number;
  /**
   * Projecao do mes pelo ritmo ate agora. Nula quando nao ha o que projetar.
   *
   * Mes encerrado nao tem projecao: o realizado **e** o resultado. Mes futuro
   * tambem nao: nao ha ritmo de que extrapolar.
   */
  projecao: number | null;
  /** Projecao menos meta. Nula quando a projecao e nula. */
  variacao: number | null;
  /** Quanto por dia util restante para chegar na meta. Nulo se o mes acabou. */
  ritmoNecessario: number | null;
  situacao: 'ATINGIDA' | 'NO_RITMO' | 'ABAIXO' | 'SEM_META';
};

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Progresso de uma meta num mes.
 *
 * `hoje` entra por parametro: sem isso o teste dependeria do relogio, e — pior —
 * o comportamento de "mes corrente" nao poderia ser exercitado.
 *
 * A projecao e **linear pelo dia do mes**, e nao por dia util. Dia util exigiria
 * calendario de feriados que a plataforma nao tem, e um calendario errado
 * produziria uma projecao pior que a linear, com aparencia de mais precisa.
 */
export function progressoDaMeta(entrada: {
  meta: number;
  realizado: number;
  mes: Date;
  hoje: Date;
}): ProgressoDaMeta {
  const { meta, realizado, mes, hoje } = entrada;
  const total = diasNoMes(mes);
  const inicio = competencia(mes);
  const fim = proximoMes(inicio);

  const mesCorrente = hoje >= inicio && hoje < fim;
  const mesFuturo = hoje < inicio;

  /*
   * Dias decorridos conta o dia de hoje como dia inteiro.
   *
   * Meia-noite do dia 1 com "zero dias decorridos" daria divisao por zero, e a
   * alternativa (comecar a projetar so no dia 2) esconderia o mes exatamente no
   * dia em que alguem abre a tela para ver se comecou bem.
   */
  const decorridos = mesCorrente ? hoje.getUTCDate() : total;
  const restantes = mesCorrente ? total - decorridos : 0;

  const projecao = mesFuturo
    ? null
    : mesCorrente
      ? centavos((realizado / decorridos) * total)
      : // Mes encerrado: o realizado E o resultado. Projetar aqui inventaria
        // futuro para um mes que ja acabou.
        realizado;

  const semMeta = meta <= 0;
  const percentual = semMeta ? null : realizado / meta;

  return {
    meta: centavos(meta),
    realizado: centavos(realizado),
    percentual,
    falta: centavos(meta - realizado),
    projecao,
    variacao: projecao === null || semMeta ? null : centavos(projecao - meta),
    ritmoNecessario:
      !mesCorrente || restantes <= 0 || semMeta ? null : centavos(Math.max(0, meta - realizado) / restantes),
    situacao: semMeta
      ? 'SEM_META'
      : realizado >= meta
        ? 'ATINGIDA'
        : projecao !== null && projecao >= meta
          ? 'NO_RITMO'
          : 'ABAIXO',
  };
}

/**
 * Junta metas e realizados numa lista por pessoa.
 *
 * Quem tem meta e nao vendeu aparece com realizado zero — e um zero de verdade.
 * Quem vendeu e nao tem meta **tambem aparece**, com meta zero e situacao
 * `SEM_META`: esconder a venda porque ninguem definiu meta faria o total da tela
 * discordar do funil, e a primeira conclusao de quem olhasse seria que a
 * plataforma perdeu venda.
 */
export function montarProgresso(
  metas: Array<{ usuarioId: string; nome: string; escopo: 'INDIVIDUAL' | 'EQUIPE'; valor: number }>,
  realizados: Map<string, number>,
  mes: Date,
  hoje: Date,
) {
  const linhas = metas.map((m) => ({
    usuarioId: m.usuarioId,
    nome: m.nome,
    escopo: m.escopo,
    ...progressoDaMeta({ meta: m.valor, realizado: realizados.get(m.usuarioId) ?? 0, mes, hoje }),
  }));

  const comMeta = new Set(metas.filter((m) => m.escopo === 'INDIVIDUAL').map((m) => m.usuarioId));
  return { linhas, semMetaDefinida: [...realizados.keys()].filter((id) => !comMeta.has(id)) };
}

/**
 * Soma dos individuais e a meta da equipe, lado a lado.
 *
 * As duas coexistem de proposito e a diferenca e informacao: meta de equipe
 * acima da soma dos individuais e desafio declarado; abaixo, e folga. Somar tudo
 * num numero so apagaria a distincao — e contaria a venda duas vezes, porque o
 * gestor esta dentro da propria equipe.
 */
export function conferirSomaDaEquipe(metaDaEquipe: number, individuais: number[]) {
  const soma = centavos(individuais.reduce((a, v) => a + v, 0));
  return {
    somaIndividuais: soma,
    metaDaEquipe: centavos(metaDaEquipe),
    diferenca: centavos(metaDaEquipe - soma),
  };
}
