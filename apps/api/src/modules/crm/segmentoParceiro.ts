export const SEGMENTOS_PARCEIRO = ['TIM', 'STARLINK'] as const;
export type SegmentoParceiro = (typeof SEGMENTOS_PARCEIRO)[number];

const normalizar = (valor: string) =>
  valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleUpperCase('pt-BR');

/**
 * Resolve o segmento explícito ou identifica a origem gravada nas observações
 * pelas importações: "Fonte: CONTATOS STARLINK", "Fonte: ... TIM",
 * "Importado da carteira PDV TIM". Só a origem conta: "último contato" ou
 * "estimativa" no resto do texto não fazem do contato um parceiro TIM.
 *
 * O backfill da migration 20261005193000_segmento_parceiro repete estas regras
 * em SQL; mudou aqui, mude lá.
 */
export function identificarSegmentoParceiro(
  informado?: string | null,
  observacoes?: string | null,
): SegmentoParceiro | null {
  const valor = normalizar(informado ?? '').trim();
  if (valor === 'TIM' || valor === 'STARLINK') return valor;

  const texto = normalizar(observacoes ?? '');
  // O valor da "Fonte:" vai até o próximo separador da observação.
  const fonte = /FONTE\s*:([^;\n|]*)/.exec(texto)?.[1] ?? '';
  if (/\bSTARLINK\b/.test(fonte)) return 'STARLINK';
  if (/\bTIM\b/.test(fonte)) return 'TIM';

  if (/\bIMPORTAD[OA]\b[^;\n|]{0,80}\bSTARLINK\b|\bCONTATOS?\s+STARLINK\b/.test(texto)) return 'STARLINK';
  if (/\bIMPORTAD[OA]\b[^;\n|]{0,80}\bTIM\b|\bCARTEIRA\b[^;\n|]{0,40}\bTIM\b|\bPDV\s+TIM\b|\bCONTATOS?\s+TIM\b/.test(texto)) {
    return 'TIM';
  }
  return null;
}
