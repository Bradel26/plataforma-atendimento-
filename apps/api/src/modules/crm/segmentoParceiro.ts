export const SEGMENTOS_PARCEIRO = ['TIM', 'STARLINK'] as const;
export type SegmentoParceiro = (typeof SEGMENTOS_PARCEIRO)[number];

const normalizar = (valor: string) =>
  valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');

/** Resolve o segmento explícito ou identifica as fontes usadas nas importações. */
export function identificarSegmentoParceiro(
  informado?: string | null,
  observacoes?: string | null,
): SegmentoParceiro | null {
  const valor = normalizar(informado ?? '').trim();
  if (valor === 'TIM' || valor === 'STARLINK') return valor;

  const fonte = normalizar(observacoes ?? '');
  if (/FONTE\s*:\s*CONTATOS?\s+STARLINK|IMPORTAD[OA].{0,60}STARLINK/.test(fonte)) return 'STARLINK';
  if (/FONTE\s*:\s*.*\bTIM\b|CARTEIRA.{0,40}PDV.{0,12}\bTIM\b|PDV\s+TIM|CONTATOS\s+TIM/.test(fonte)) return 'TIM';
  return null;
}
