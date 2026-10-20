import type { ConversaStatus, Mensagem } from '../../lib/types';

// So tons que o tema escuro remapeia em index.css (50/200/700 etc.) — outro tom
// ficaria claro sobre fundo escuro.
export const CLASSE_STATUS: Record<ConversaStatus, string> = {
  EM_ESPERA: 'bg-amber-50 text-amber-700',
  ATRIBUIDO: 'bg-blue-50 text-blue-700',
  EM_ATENDIMENTO: 'bg-emerald-50 text-emerald-700',
  AGUARDANDO_CLIENTE: 'bg-slate-100 text-slate-600',
  FINALIZADO: 'bg-slate-100 text-slate-500',
};

type MensagemMinima = Pick<Mensagem, 'autor' | 'interno' | 'criadoEm'>;

/**
 * Momento da mensagem do cliente que ainda espera resposta, ou null. Nota
 * interna e evento do sistema nao contam como resposta: o cliente nao os ve.
 */
export function clienteAguardandoDesde(status: ConversaStatus, mensagens: readonly MensagemMinima[]): string | null {
  if (status === 'FINALIZADO') return null;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i]!;
    if (m.interno || m.autor === 'SISTEMA') continue;
    return m.autor === 'CLIENTE' ? m.criadoEm : null;
  }
  return null;
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export function esperaCurta(desde: string, agora = Date.now()): string {
  const ms = Math.max(0, agora - new Date(desde).getTime());
  if (ms < MINUTO) return 'agora';
  if (ms < HORA) return `${Math.floor(ms / MINUTO)}min`;
  if (ms < DIA) return `${Math.floor(ms / HORA)}h`;
  return `${Math.floor(ms / DIA)}d`;
}

export function esperaPorExtenso(desde: string, agora = Date.now()): string {
  const ms = Math.max(0, agora - new Date(desde).getTime());
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  if (ms < MINUTO) return 'menos de um minuto';
  if (ms < HORA) return plural(Math.floor(ms / MINUTO), 'minuto', 'minutos');
  if (ms < DIA) return plural(Math.floor(ms / HORA), 'hora', 'horas');
  return plural(Math.floor(ms / DIA), 'dia', 'dias');
}

/** Rotulo do separador de dia no chat: Hoje, Ontem ou a data. */
export function rotuloDoDia(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (data.toDateString() === agora.toDateString()) return 'Hoje';
  if (data.toDateString() === ontem.toDateString()) return 'Ontem';
  return data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    ...(data.getFullYear() !== agora.getFullYear() ? { year: 'numeric' } : {}),
  });
}
