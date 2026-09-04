/**
 * Medidor de consumo de IA: a aritmética (item 6.8 do plano em ANALISE-CRM.md).
 *
 * Vem do medidor de crédito do Néctar. O plano registra a condição do item — "só
 * faz sentido se a IA for ligada de verdade" — e hoje ela **não está**: não há
 * provedor configurado nesta plataforma.
 *
 * A projeção é a parte que vai importar quando estiver, e é a que pode errar em
 * silêncio: um número de fim de mês calculado sobre a base errada faz a operação
 * descobrir o custo na fatura.
 */

export type RecursoIA = 'TRANSCRICAO' | 'RESUMO' | 'SUGESTAO_RESPOSTA' | 'CLASSIFICACAO' | 'OUTRO';

export type Uso = {
  recurso: RecursoIA;
  unidades: number;
  /** Nulo quando o provedor não informou custo. Não é zero. */
  custo: number | null;
};

/** Rótulo da unidade de cada recurso — não existe unidade universal. */
export const UNIDADE: Record<RecursoIA, string> = {
  TRANSCRICAO: 'minutos de áudio',
  RESUMO: 'mil tokens',
  SUGESTAO_RESPOSTA: 'mil tokens',
  CLASSIFICACAO: 'mil tokens',
  OUTRO: 'unidades',
};

const arredondar = (v: number, casas = 6) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

export type ConsumoDoCiclo = {
  /** Nulo quando NENHUM uso trouxe custo — zero afirmaria que foi de graça. */
  custoTotal: number | null;
  unidadesTotais: number;
  usos: number;
  /** Quantos usos trouxeram custo: sem isso, o total parece cobrir todos. */
  usosComCusto: number;
  porRecurso: Array<{ recurso: RecursoIA; usos: number; unidades: number; custo: number | null }>;
};

/**
 * Agrega o consumo do ciclo, por recurso.
 *
 * A quebra por recurso é o que faz o medidor servir para decidir: "gastamos
 * demais" não é acionável, "a transcrição é 80% do gasto" é.
 */
export function agregarConsumo(usos: Uso[]): ConsumoDoCiclo {
  const comCusto = usos.filter((u) => u.custo !== null);
  const soma = comCusto.reduce((a, u) => a + (u.custo ?? 0), 0);

  const recursos = new Map<RecursoIA, { usos: number; unidades: number; custo: number | null }>();
  for (const u of usos) {
    const atual = recursos.get(u.recurso) ?? { usos: 0, unidades: 0, custo: null };
    recursos.set(u.recurso, {
      usos: atual.usos + 1,
      unidades: atual.unidades + u.unidades,
      // Soma custo só quando há custo: um recurso inteiro sem custo informado
      // continua nulo, e não zero.
      custo: u.custo === null ? atual.custo : arredondar((atual.custo ?? 0) + u.custo),
    });
  }

  return {
    custoTotal: comCusto.length === 0 ? null : arredondar(soma),
    unidadesTotais: usos.reduce((a, u) => a + u.unidades, 0),
    usos: usos.length,
    usosComCusto: comCusto.length,
    porRecurso: [...recursos.entries()]
      .map(([recurso, v]) => ({ recurso, ...v }))
      // Maior gasto primeiro; recurso sem custo informado vai para o fim, porque
      // ele não ajuda a decidir onde cortar.
      .sort((a, b) => (b.custo ?? -1) - (a.custo ?? -1)),
  };
}

export type ProjecaoDoCiclo = {
  /** Nulo quando não há o que projetar: mês futuro, ou nada consumido. */
  projecao: number | null;
  /** Fração do teto que a projeção representa. Nulo sem teto ou sem projeção. */
  fracaoDoTeto: number | null;
  diasDecorridos: number;
  diasNoMes: number;
  situacao: 'SEM_TETO' | 'DENTRO' | 'PROJETA_ESTOURO' | 'ESTOUROU' | 'SEM_CONSUMO';
};

/**
 * Projeta o fim do ciclo pelo ritmo até agora.
 *
 * As mesmas três regras de honestidade das metas (decisão 62), porque o erro
 * possível é o mesmo:
 *
 * - **mês encerrado não projeta**: o gasto real *é* o resultado;
 * - **mês futuro não projeta**: não há ritmo de que extrapolar;
 * - **sem consumo, projeção nula** e não zero — zero afirmaria que o mês vai
 *   fechar sem gasto, e o mês pode não ter começado a usar ainda.
 *
 * `hoje` entra por parâmetro para o teste não depender do relógio.
 */
export function projetarCiclo(entrada: {
  gastoAteAgora: number | null;
  teto: number | null;
  mes: Date;
  hoje: Date;
}): ProjecaoDoCiclo {
  const { gastoAteAgora, teto, mes, hoje } = entrada;
  const inicio = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));
  const diasNoMes = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0)).getUTCDate();

  const corrente = hoje >= inicio && hoje < fim;
  const futuro = hoje < inicio;
  const diasDecorridos = corrente ? hoje.getUTCDate() : futuro ? 0 : diasNoMes;

  const semConsumo = gastoAteAgora === null || gastoAteAgora === 0;

  const projecao = futuro || semConsumo
    ? null
    : corrente
      ? arredondar((gastoAteAgora / diasDecorridos) * diasNoMes, 2)
      : arredondar(gastoAteAgora, 2);

  const fracaoDoTeto = projecao === null || teto === null || teto <= 0 ? null : projecao / teto;

  const situacao: ProjecaoDoCiclo['situacao'] =
    teto === null || teto <= 0
      ? 'SEM_TETO'
      : semConsumo
        ? 'SEM_CONSUMO'
        : (gastoAteAgora ?? 0) > teto
          ? 'ESTOUROU'
          : projecao !== null && projecao > teto
            ? 'PROJETA_ESTOURO'
            : 'DENTRO';

  return { projecao, fracaoDoTeto, diasDecorridos, diasNoMes, situacao };
}
