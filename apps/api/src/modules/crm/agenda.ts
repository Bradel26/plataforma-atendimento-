/**
 * Agenda da semana (item E.5): o que cada dia tem para fazer.
 *
 * Duas decisoes governam este arquivo, e as duas sao sobre a semana nao esconder
 * trabalho:
 *
 * 1. **O atrasado aparece.** Uma agenda que mostra apenas segunda a domingo
 *    esconde a tarefa que venceu na semana passada — e ela e justamente a mais
 *    urgente. Atrasadas tem faixa propria, antes de segunda.
 * 2. **Tarefa sem prazo nao cabe em dia nenhum**, e por isso e contada a parte em
 *    vez de empurrada para hoje. A tarefa que a etapa do funil exige (item 3.1)
 *    nasce sem prazo de proposito; joga-la em "hoje" faria a agenda inventar um
 *    compromisso que ninguem marcou.
 *
 * Sobre fuso: o dia comeca onde o **usuario** esta, e nao onde o servidor roda.
 * O inicio da semana chega como `AAAA-MM-DD` e o deslocamento em minutos vem do
 * navegador — mesmo raciocinio das metas, que recebem `AAAA-MM` justamente para
 * nao existir fuso a errar. Calcular os limites em UTC no servidor colocaria a
 * tarefa de sabado as 22h (domingo 01h UTC) no dia errado, e ninguem entenderia
 * por que ela sumiu do sabado.
 */

export type DiaDaAgenda = {
  /** `AAAA-MM-DD` do dia, no fuso de quem pediu. */
  dia: string;
  /** Instante em que o dia comeca, em UTC — e o que a consulta usa. */
  inicio: Date;
  /** Instante em que o dia termina (exclusivo). */
  fim: Date;
};

/** Milissegundos num dia. */
const DIA = 24 * 60 * 60 * 1000;

/**
 * Os sete dias da semana que comeca em `inicio`, no fuso de quem pediu.
 *
 * `offsetMinutos` e o que `Date.prototype.getTimezoneOffset()` devolve no
 * navegador: minutos a SUBTRAIR do horario local para chegar ao UTC (no Brasil,
 * 180). Recebe-lo em vez de adivinhar e o que faz o dia da agenda coincidir com
 * o dia do calendario na parede de quem esta olhando.
 */
export function diasDaSemana(inicio: string, offsetMinutos: number): DiaDaAgenda[] {
  const [ano, mes, dia] = inicio.split('-').map(Number);
  if (!ano || !mes || !dia) throw new Error(`Data invalida: ${inicio}`);

  // Meia-noite local do primeiro dia, expressa em UTC.
  const base = Date.UTC(ano, mes - 1, dia) + offsetMinutos * 60 * 1000;

  return Array.from({ length: 7 }, (_, i) => {
    const comeco = base + i * DIA;
    const local = new Date(comeco - offsetMinutos * 60 * 1000);
    return {
      dia: local.toISOString().slice(0, 10),
      inicio: new Date(comeco),
      fim: new Date(comeco + DIA),
    };
  });
}

/**
 * A segunda-feira da semana que contem `data`, no fuso de quem pediu.
 *
 * Semana comeca na **segunda**, e nao no domingo: a agenda e de trabalho, e a
 * semana comercial brasileira comeca na segunda. Domingo fica no fim, onde
 * (espera-se) nao tem nada.
 */
export function segundaDaSemana(data: Date, offsetMinutos: number): string {
  const local = new Date(data.getTime() - offsetMinutos * 60 * 1000);
  // `getUTCDay` do horario ja deslocado: 0 = domingo, 1 = segunda.
  const diaDaSemana = local.getUTCDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return new Date(local.getTime() - recuo * DIA).toISOString().slice(0, 10);
}

export type ItemDaAgenda = {
  id: string;
  titulo: string;
  tipo: string;
  prazo: Date | null;
  concluidoEm: Date | null;
  obrigatoria?: boolean;
};

export type Agenda<T extends ItemDaAgenda> = {
  /**
   * Venceu antes da semana e ninguem concluiu.
   *
   * Faixa propria porque e o trabalho mais urgente que existe, e uma agenda que
   * so mostra a semana corrente o esconderia.
   */
  atrasadas: T[];
  dias: Array<{ dia: string; itens: T[] }>;
  /**
   * Pendentes sem prazo. Contadas, e nao distribuidas.
   *
   * Nao cabem em dia nenhum — e inventar um dia para elas faria a agenda afirmar
   * um compromisso que ninguem marcou.
   */
  semPrazo: T[];
  /** Quantos itens a semana tem, sem contar atrasadas nem sem prazo. */
  totalNaSemana: number;
};

/**
 * Distribui os itens nos dias da semana.
 *
 * Item concluido **continua aparecendo** no dia dele: a agenda serve tambem para
 * olhar para tras ("o que eu fiz na terca?"), e esconder o concluido faria a
 * semana passada parecer vazia. Quem esta concluido, porem, nunca entra em
 * atrasadas — atraso e sobre compromisso ainda em aberto.
 */
export function montarAgenda<T extends ItemDaAgenda>(itens: T[], dias: DiaDaAgenda[]): Agenda<T> {
  if (dias.length === 0) {
    return { atrasadas: [], dias: [], semPrazo: [], totalNaSemana: 0 };
  }

  const comeco = dias[0]!.inicio.getTime();
  const fim = dias[dias.length - 1]!.fim.getTime();

  const atrasadas: T[] = [];
  const semPrazo: T[] = [];
  const porDia = new Map<string, T[]>(dias.map((d) => [d.dia, []]));

  for (const item of itens) {
    if (item.prazo === null) {
      // Concluida sem prazo nao e trabalho a fazer nem atraso: sai da agenda.
      if (item.concluidoEm === null) semPrazo.push(item);
      continue;
    }

    const quando = item.prazo.getTime();

    if (quando < comeco) {
      if (item.concluidoEm === null) atrasadas.push(item);
      // Concluida antes da semana simplesmente nao pertence a esta tela.
      continue;
    }
    if (quando >= fim) continue;

    const dia = dias.find((d) => quando >= d.inicio.getTime() && quando < d.fim.getTime());
    if (dia) porDia.get(dia.dia)!.push(item);
  }

  const ordenar = (a: T, b: T) => (a.prazo?.getTime() ?? 0) - (b.prazo?.getTime() ?? 0);

  return {
    atrasadas: [...atrasadas].sort(ordenar),
    dias: dias.map((d) => ({ dia: d.dia, itens: [...porDia.get(d.dia)!].sort(ordenar) })),
    semPrazo,
    totalNaSemana: dias.reduce((total, d) => total + porDia.get(d.dia)!.length, 0),
  };
}
