/**
 * Matriz de produtividade (item 3.3): usuario x tipo de atividade, no formato
 * `feitas / agendadas`.
 *
 * Duas decisoes de base, e as duas evitam inventar numero:
 *
 * 1. **"Agendada" e ter prazo** — a mesma definicao de `agenda.ts` (item E.5).
 *    Uma nota ou ligacao so registrada, sem prazo, nunca foi um compromisso: ela
 *    nao entra nem no numerador nem no denominador desta matriz, do mesmo jeito
 *    que `montarAgenda` a tira da agenda em vez de fingir que ela era pendente.
 * 2. **Celula sem nenhuma atividade agendada e nula, nao 0%.** Zero por cento
 *    afirmaria "combinou tarefas e nao cumpriu nenhuma"; nulo diz "nao ha o que
 *    medir aqui" — o mesmo raciocinio do TMA nulo em `metrics.service.ts`
 *    quando nao ha conversa fechada no periodo.
 *
 * A linha da matriz e o **usuario que apareceu como responsavel** de alguma
 * atividade agendada no periodo — nao a lista inteira de usuarios da
 * organizacao. Uma pessoa sem nenhuma atividade agendada no mes nao ganha uma
 * linha de zeros: ela simplesmente nao aparece, porque nao ha nada para medir
 * sobre ela naquele mes.
 */

export const TIPOS_ATIVIDADE = [
  'NOTA',
  'TAREFA',
  'LIGACAO',
  'WHATSAPP',
  'EMAIL',
  'REUNIAO',
  'VISITA',
  'PROPOSTA',
] as const;

export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];

export type AtividadeParaProdutividade = {
  id: string;
  titulo: string;
  tipo: TipoAtividade;
  prazo: Date | null;
  concluidoEm: Date | null;
  responsavel: { id: string; nome: string } | null;
};

/** O que a celula (ou o total da linha) mostra: a razao, e a lista para o drill-down. */
export type CelulaProdutividade = {
  feitas: number;
  agendadas: number;
  /** Inteiro de 0 a 100. */
  percentual: number;
  atividades: Array<{ id: string; titulo: string; prazo: Date; concluidoEm: Date | null }>;
};

export type LinhaProdutividade = {
  usuarioId: string;
  usuarioNome: string;
  /** Nulo = nenhuma atividade agendada deste tipo, para este usuario, no periodo. */
  porTipo: Record<TipoAtividade, CelulaProdutividade | null>;
  total: CelulaProdutividade;
};

function celulaDe(agendadas: AtividadeParaProdutividade[]): CelulaProdutividade | null {
  if (agendadas.length === 0) return null;

  const feitas = agendadas.filter((a) => a.concluidoEm !== null);
  return {
    feitas: feitas.length,
    agendadas: agendadas.length,
    percentual: Math.round((feitas.length / agendadas.length) * 100),
    atividades: agendadas
      // `prazo` nao e nulo aqui: so entram atividades agendadas nesta funcao.
      .map((a) => ({ id: a.id, titulo: a.titulo, prazo: a.prazo!, concluidoEm: a.concluidoEm }))
      .sort((x, y) => x.prazo.getTime() - y.prazo.getTime()),
  };
}

/**
 * Monta a matriz a partir das atividades do periodo (ja filtradas por
 * visibilidade e por data na consulta).
 *
 * So entram atividades com `prazo` preenchido e com responsavel — sem as duas,
 * a atividade nao tem o que "agendada" e "de quem" exigem para virar uma
 * celula.
 */
export function matrizProdutividade(atividades: AtividadeParaProdutividade[]): LinhaProdutividade[] {
  const agendadas = atividades.filter((a) => a.prazo !== null && a.responsavel !== null);

  const porUsuario = new Map<string, { nome: string; itens: AtividadeParaProdutividade[] }>();
  for (const a of agendadas) {
    const { id, nome } = a.responsavel!;
    if (!porUsuario.has(id)) porUsuario.set(id, { nome, itens: [] });
    porUsuario.get(id)!.itens.push(a);
  }

  const linhas: LinhaProdutividade[] = [];
  for (const [usuarioId, { nome, itens }] of porUsuario) {
    const porTipo = {} as Record<TipoAtividade, CelulaProdutividade | null>;
    for (const tipo of TIPOS_ATIVIDADE) {
      porTipo[tipo] = celulaDe(itens.filter((a) => a.tipo === tipo));
    }
    linhas.push({ usuarioId, usuarioNome: nome, porTipo, total: celulaDe(itens)! });
  }

  return linhas.sort((a, b) => a.usuarioNome.localeCompare(b.usuarioNome, 'pt-BR'));
}
