/**
 * Paleta de dados.
 *
 * Fixa de proposito: a cor da marca (--brand-primary) e customizavel por cliente
 * no White Label, entao usa-la como cor de serie quebraria a legibilidade sempre
 * que alguem escolhesse um tom proximo do vizinho. A marca fica no cromo da
 * interface (botoes, menu ativo); os dados usam esta paleta validada.
 *
 * Ordem fixa, nunca ciclada. Validada para daltonismo na lista de pares
 * adjacentes (pior par CVD dE 9.1, visao normal 19.6) sobre superficie branca.
 * Tres tons ficam abaixo de 3:1 de contraste, o que obriga rotulo visivel em
 * cada barra — e por isso que BarList sempre mostra nome e valor.
 */
export const SERIES = [
  '#2a78d6', // azul
  '#eb6834', // laranja
  '#1baf7a', // agua
  '#eda100', // amarelo
  '#e87ba4', // magenta
  '#008300', // verde
] as const;

/** Cores de estado — reservadas, nunca usadas como serie. */
export const ESTADO = {
  bom: '#1baf7a',
  atencao: '#eda100',
  grave: '#e34948',
  neutro: '#94a3b8',
  info: '#2a78d6',
} as const;

/** Cor por canal, na ordem fixa da paleta. */
export const COR_CANAL: Record<string, string> = {
  WEBCHAT: SERIES[0],
  WHATSAPP: SERIES[2],
  INSTAGRAM: SERIES[4],
  FACEBOOK: SERIES[1],
  EMAIL: SERIES[3],
  VOZ: SERIES[5],
};

/** Status de presenca do agente usa a paleta de estado, nao a de series. */
export const COR_STATUS_AGENTE: Record<string, string> = {
  DISPONIVEL: ESTADO.bom,
  EM_ATENDIMENTO: ESTADO.info,
  PAUSA: ESTADO.atencao,
  OFFLINE: ESTADO.neutro,
};

/** Segundos para "1h 23m 45s", omitindo as unidades vazias a esquerda. */
export function duracao(segundos: number | null): string {
  if (segundos === null) return '—';
  if (segundos < 60) return `${segundos}s`;
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}
