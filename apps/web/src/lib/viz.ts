/**
 * Paleta de dados.
 *
 * Fixa de proposito: a cor da marca (--brand-primary) e customizavel por cliente
 * no White Label, entao usa-la como cor de serie quebraria a legibilidade sempre
 * que alguem escolhesse um tom proximo do vizinho. A marca fica no cromo da
 * interface (botoes, menu ativo); os dados usam esta paleta validada.
 *
 * Os componentes usam SERIES e ESTADO, que sao *referencias* a variaveis CSS.
 * Assim a cor troca com o tema sem nenhum componente saber que existe tema. Os
 * valores concretos de cada tema estao em index.css, e um teste compara os dois
 * arquivos para nao divergirem.
 */

/**
 * Modo claro. Ordem fixa, nunca ciclada. Validada para daltonismo na lista de
 * pares adjacentes (pior par CVD dE 9.1, visao normal 19.6) sobre superficie
 * branca. Tres tons ficam abaixo de 3:1 de contraste, o que obriga rotulo
 * visivel em cada barra — e por isso que BarList sempre mostra nome e valor.
 */
export const SERIES_CLARO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const;

/**
 * Modo escuro. Nao e a paleta clara com filtro: cada cor foi recolocada na faixa
 * de luminosidade do modo escuro (OKLCH L 0.62) preservando matiz e croma, e o
 * conjunto foi validado contra a superficie escura (#151d2b) — banda de
 * luminosidade, piso de croma, separacao para daltonismo e contraste, todos
 * passando.
 */
export const SERIES_ESCURO = ['#3986e5', '#d95821', '#009f6c', '#bd7400', '#c75d87', '#33a02e'] as const;

export const ESTADO_CLARO = {
  bom: '#1baf7a',
  atencao: '#eda100',
  grave: '#e34948',
  neutro: '#94a3b8',
  info: '#2a78d6',
} as const;

export const ESTADO_ESCURO = {
  bom: '#14ac77',
  atencao: '#ca8000',
  grave: '#f15653',
  neutro: '#8593a8',
  info: '#4693f3',
} as const;

/** O que os componentes usam: troca de valor com o tema. */
export const SERIES = [
  'var(--serie-1)',
  'var(--serie-2)',
  'var(--serie-3)',
  'var(--serie-4)',
  'var(--serie-5)',
  'var(--serie-6)',
] as const;

/** Cores de estado — reservadas, nunca usadas como serie. */
export const ESTADO = {
  bom: 'var(--estado-bom)',
  atencao: 'var(--estado-atencao)',
  grave: 'var(--estado-grave)',
  neutro: 'var(--estado-neutro)',
  info: 'var(--estado-info)',
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
