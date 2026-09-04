import type { Oportunidade } from '../../lib/types';

export type SinalDeAcao = { texto: string; tom: 'alerta' | 'neutro' };

/**
 * O que o cartao do funil avisa sobre o proximo passo.
 *
 * Sao dois avisos diferentes, com gravidade diferente, e a ordem importa:
 *
 * - **Tarefa atrasada** (ambar): existe proximo passo marcado e o prazo passou.
 *   E o unico dos dois em que alguem descumpriu um compromisso, entao ganha a
 *   cor e vem primeiro. Um cartao pode ter tarefa atrasada *e* outras em dia; o
 *   atraso e o que precisa aparecer.
 * - **Etapa exige tarefa** (cinza): a etapa em que o cartao esta tem tarefa
 *   obrigatoria em aberto (item 3.1). Vem antes de "sem proxima acao" porque e
 *   mais especifico — existe proximo passo, e ele e conhecido — e fica cinza, e
 *   nao ambar, porque ninguem descumpriu nada: a tarefa acabou de ser criada na
 *   entrada da etapa e nao tem prazo.
 * - **Sem proxima acao** (cinza): nao existe nenhuma tarefa com prazo em aberto.
 *   Nao e falha de ninguem ainda — e um lembrete —, por isso cinza e nao ambar.
 *
 * Nao ha limiar de dias aqui de proposito. Um numero como "parado ha mais de 14
 * dias" seria inventado: ha negocio que legitimamente dorme um mes e ha ciclo que
 * apodrece em tres dias. Os dois cronometros do cartao mostram *quanto tempo*
 * faz; este sinal responde a pergunta que nao depende de arbitrio — **existe
 * proximo passo marcado?**
 *
 * `agora` entra por parametro para o teste nao depender do relogio da maquina.
 */
export function sinalDeAcao(o: Oportunidade, agora: number = Date.now()): SinalDeAcao | null {
  if (o.proximoPrazo && new Date(o.proximoPrazo).getTime() < agora) {
    return { texto: 'Tarefa atrasada', tom: 'alerta' };
  }
  /*
   * A tarefa da etapa vem antes de "sem proxima acao", e a ordem nao e estetica:
   * a tarefa criada na entrada da etapa **nao tem prazo** de proposito, entao ela
   * nao entra em `tarefasAbertas` (que conta so o que tem prazo). Sem esta linha,
   * um cartao barrado por tarefa obrigatoria mostraria "sem proxima acao" —
   * exatamente o contrario da verdade, e no cartao que mais precisa do aviso.
   */
  if (o.tarefaDaEtapaPendente && o.tarefaDaEtapaPendente.length > 0) {
    return { texto: 'Etapa exige tarefa', tom: 'neutro' };
  }
  // `undefined` e "a API nao mandou o campo" — versao antiga, ou uma tela que
  // monta a oportunidade a mao. Nesse caso nao ha o que afirmar, e um aviso
  // errado e pior que aviso nenhum: quem ve "sem proxima acao" num cartao que
  // tem tarefa deixa de confiar no aviso nos cartoes em que ele esta certo.
  if (o.tarefasAbertas === 0) return { texto: 'Sem proxima acao', tom: 'neutro' };
  return null;
}
