import {
  LABEL_APROVACAO_DESCONTO,
  LABEL_CAMPO_AUDITADO,
  moeda,
  type CampoAuditado,
  type EventoAuditoria,
  type ValorAuditado,
} from '../../../lib/types';

/**
 * Como cada valor da trilha de auditoria vira texto (item 3.2).
 *
 * Mora numa funcao pura e testada porque este e o ponto em que a auditoria pode
 * mentir sem quebrar: um valor formatado com a regra errada — o total lido como
 * quantidade, o nulo virando zero — produz uma linha plausivel e falsa. E a
 * trilha existe justamente para ser acreditada.
 */

/** Nulo vira travessao, nunca zero nem vazio. */
const VAZIO = '—';

export function descreverValor(campo: CampoAuditado | null, valor: ValorAuditado): string {
  /*
   * `null` primeiro, e sem passar por nenhuma formatacao.
   *
   * "Nao havia valor" e diferente de "o valor era zero", e a regra vale para toda
   * a plataforma: `moeda(null)` daria "R$ 0,00" e afirmaria um preco que ninguem
   * escreveu.
   */
  if (valor === null) return VAZIO;

  if (typeof valor === 'object') {
    return 'id' in valor
      ? valor.nome
      : `${valor.quantidade} item(ns) · ${moeda(valor.total)}`;
  }

  switch (campo) {
    case 'VALOR_INFORMADO':
      return typeof valor === 'number' ? moeda(valor) : String(valor);
    case 'MESES_RECORRENCIA':
      return `${valor} ${Number(valor) === 1 ? 'mes' : 'meses'}`;
    case 'PREVISAO_FECHAMENTO':
      return new Date(String(valor)).toLocaleDateString('pt-BR');
    case 'APROVACAO_DESCONTO':
      return LABEL_APROVACAO_DESCONTO[valor as keyof typeof LABEL_APROVACAO_DESCONTO] ?? String(valor);
    default:
      return String(valor);
  }
}

/**
 * O rotulo da linha: o nome do campo, ou "Etapa" para o historico de estagio.
 *
 * O `??` no fim nao e defensivo por gosto — ele conserta um defeito real. Esta
 * uniao no front e sempre mais estreita que o enum da API, e o TypeScript nao
 * avisa: `LABEL_CAMPO_AUDITADO[campo]` devolve `undefined` para um valor que o
 * servidor conhece e a tela ainda nao. Foi o que aconteceu quando condicao de
 * pagamento e prazo de entrega entraram: a linha do historico apareceu como
 * ": — → 10 dias uteis", sem dizer de que campo falava. Mostrar o codigo cru
 * mantem a linha legivel e deixa a falta visivel.
 */
export function rotuloDoEvento(e: EventoAuditoria): string {
  if (e.tipo === 'ETAPA') return 'Etapa';
  if (!e.campo) return 'Alteracao';
  return LABEL_CAMPO_AUDITADO[e.campo] ?? e.campo;
}

/**
 * A frase da mudanca.
 *
 * Entrada no funil (etapa sem origem) nao e "de — para Prospeccao": e uma
 * entrada, e chamar de mudanca faria parecer que alguem mexeu em algo que nao
 * existia.
 */
export function fraseDoEvento(e: EventoAuditoria): string {
  const para = descreverValor(e.campo, e.para);
  if (e.tipo === 'ETAPA' && e.de === null) return `entrou em ${para}`;
  return `${descreverValor(e.campo, e.de)} → ${para}`;
}
