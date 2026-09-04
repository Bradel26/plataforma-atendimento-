/**
 * Ciclo de vida do contato (item E.4): o "funil Leads -> Suspects" da demonstracao.
 *
 * **Derivado, e nao digitado.** Esta e a decisao inteira do item, e ela e o que
 * evita a doenca classica desse campo em CRM: um seletor "Lead / Suspect /
 * Cliente" que alguem preenche uma vez e nunca mais atualiza. Seis meses depois
 * a base tem "leads" com contrato assinado e "clientes" que nunca compraram, e o
 * relatorio por ciclo de vida vira ficcao com aparencia de dado.
 *
 * A plataforma **ja sabe** a resposta: se existe oportunidade ganha, se existe
 * negociacao aberta, se houve conversa. Guardar uma segunda versao disso numa
 * coluna cria duas verdades que divergem — e a que a tela mostra e sempre a
 * errada, porque e a que ninguem mantem.
 *
 * O preco de derivar e assumido: nao ha como marcar a mao "este e cliente
 * antigo, de antes da plataforma". Quando essa necessidade aparecer, ela entra
 * como *fato* (uma oportunidade ganha historica), e nao como rotulo — o fato
 * responde tambem "quanto ele comprou", que o rotulo nunca responderia.
 */

/**
 * Os degraus, do mais avancado para o menos.
 *
 * A ordem e a precedencia: um contato satisfaz varios ao mesmo tempo (quem
 * comprou tambem conversou), e vale o mais avancado. Sem uma ordem explicita, o
 * mesmo contato apareceria em degrau diferente conforme a ordem dos `if`.
 */
export const CICLOS = ['CLIENTE', 'EM_NEGOCIACAO', 'PERDIDO', 'QUALIFICADO', 'CONTATADO', 'LEAD'] as const;

export type CicloDeVida = (typeof CICLOS)[number];

/**
 * Os fatos que a plataforma tem sobre um contato. Todos contagens, e nao datas:
 * nenhum degrau depende de "quantos dias faz".
 */
export type FatosDoContato = {
  oportunidadesGanhas: number;
  oportunidadesAbertas: number;
  oportunidadesPerdidas: number;
  /** Leads em fase de qualificacao ou adiante, ainda em aberto. */
  leadsQualificados: number;
  /** Leads em qualquer fase, inclusive NOVO. */
  leads: number;
  conversas: number;
};

/**
 * Em que degrau este contato esta, pelos fatos.
 *
 * A escada, e o porque de cada degrau vir onde vem:
 *
 * - **CLIENTE** — tem oportunidade ganha. Compra e o fato mais forte que existe
 *   sobre uma relacao comercial, e ele nao expira: cliente que sumiu continua
 *   sendo alguem que ja comprou. Um degrau "INATIVO" precisaria de um limiar de
 *   dias que eu escolheria sozinho, e "sem comprar ha 90 dias" e uma frase sobre
 *   ar-condicionado muito diferente do que e sobre software.
 * - **EM_NEGOCIACAO** — tem negociacao aberta agora. Vem antes de PERDIDO porque
 *   descreve o presente; quem tem uma proposta em analise e uma perda antiga e,
 *   hoje, uma negociacao.
 * - **PERDIDO** — perdeu e nao tem nada aberto. Existe separado de QUALIFICADO
 *   porque campanha para quem disse "nao" e campanha diferente, e junta-los faria
 *   a lista de qualificados prometer mais do que tem.
 * - **QUALIFICADO** — lead que passou da triagem, sem oportunidade nenhuma.
 * - **CONTATADO** — houve conversa, ou existe lead ainda na entrada ("suspect"
 *   da demonstracao): alguem sabe que essa pessoa existe e ja falou com ela.
 * - **LEAD** — cadastro e mais nada. E o degrau de quem entrou por importacao ou
 *   pelo widget e nunca teve conversa.
 */
export function cicloDeVida(f: FatosDoContato): CicloDeVida {
  if (f.oportunidadesGanhas > 0) return 'CLIENTE';
  if (f.oportunidadesAbertas > 0) return 'EM_NEGOCIACAO';
  if (f.oportunidadesPerdidas > 0) return 'PERDIDO';
  if (f.leadsQualificados > 0) return 'QUALIFICADO';
  if (f.conversas > 0 || f.leads > 0) return 'CONTATADO';
  return 'LEAD';
}

export type DegrauDoFunil = {
  ciclo: CicloDeVida;
  total: number;
  /**
   * Fracao do total, ou nulo quando nao ha contato nenhum.
   *
   * Nulo e nao zero: "0%" afirmaria que ninguem esta neste degrau, quando o que
   * se sabe e que nao existe base para calcular fracao.
   */
  fracao: number | null;
};

/**
 * O funil de ciclo de vida: quantos contatos em cada degrau.
 *
 * **Nao e um funil de conversao**, e a diferenca importa para nao ler o grafico
 * errado: isto e uma foto de *onde cada contato esta hoje*, e nao um fluxo de
 * quantos passaram de um degrau para o outro no periodo. Um contato aparece em
 * exatamente um degrau, e a soma dos degraus e o total da base — o que nao
 * acontece num funil de fluxo.
 *
 * Sai sempre com os seis degraus, inclusive os vazios: degrau que desaparece
 * quando esta em zero faz a escada mudar de forma a cada leitura, e some
 * justamente quando a informacao ("nao temos nenhum qualificado") importa.
 */
export function funilDeCicloDeVida(ciclos: CicloDeVida[]): { total: number; degraus: DegrauDoFunil[] } {
  const total = ciclos.length;
  const contagem = new Map<CicloDeVida, number>(CICLOS.map((c) => [c, 0]));
  for (const c of ciclos) contagem.set(c, (contagem.get(c) ?? 0) + 1);

  return {
    total,
    degraus: CICLOS.map((ciclo) => {
      const quantos = contagem.get(ciclo) ?? 0;
      return { ciclo, total: quantos, fracao: total === 0 ? null : quantos / total };
    }),
  };
}
