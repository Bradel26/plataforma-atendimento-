/**
 * Aritmetica pura do painel do vendedor (item §16 do modelo de CRM auditado).
 *
 * Consulta fina, agregacao pura — mesmo padrao de `crm/metas.ts`.
 */

/**
 * Conversao = ganhas / (ganhas + perdidas), so entre oportunidades que tiveram
 * desfecho no periodo. Nula quando nao houve nenhum fechamento: zero por cento
 * afirmaria que o vendedor perdeu tudo que fechou, e aqui nao fechou nada para medir.
 */
export function conversao(ganhas: number, perdidas: number): number | null {
  const total = ganhas + perdidas;
  return total === 0 ? null : ganhas / total;
}
