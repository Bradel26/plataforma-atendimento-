import type { Canal, Oportunidade, Temperatura } from '../../lib/types';

/**
 * Temperatura e origem no cartao do funil (item esquecido do plano).
 *
 * Duas regras governam este modulo, e as duas existem para o cartao nao afirmar
 * o que ninguem disse:
 *
 * 1. **Nulo nao vira degrau.** Oportunidade sem temperatura nao mostra etiqueta
 *    nenhuma — nao mostra "Fria". As 83 oportunidades que existiam antes desta
 *    coluna nunca foram lidas por ninguem, e pinta-las de frias seria inventar
 *    uma leitura em nome do vendedor. O mesmo vale para origem: ausencia e
 *    "nao registrada", e nao "veio do site".
 * 2. **A cor nunca carrega a informacao sozinha.** As tres etiquetas trazem a
 *    palavra escrita. Quem nao distingue os tons — e quem imprime o quadro — le
 *    o mesmo que todo mundo.
 *
 * Sobre os tons: ambar esta reservado neste projeto para *compromisso
 * descumprido* (ver `sinalDeAcao`), e negocio frio nao e compromisso
 * descumprido — ninguem prometeu nada. Por isso frio e morno ficam cinza, e so
 * "quente" ganha o tom da marca: e o unico degrau que muda a fila de hoje.
 */
export type { Temperatura };

export type EtiquetaDoCartao = {
  /** O que aparece escrito. Nunca so a cor. */
  texto: string;
  tom: 'neutro' | 'marca';
  /** Explicacao no hover, para o numero da etapa nao ser confundido com isto. */
  titulo: string;
};

export const LABEL_TEMPERATURA: Record<Temperatura, string> = {
  FRIA: 'Fria',
  MORNA: 'Morna',
  QUENTE: 'Quente',
};

/** Rotulo de cada canal de origem, no mesmo vocabulario de lead e contato. */
export const LABEL_CANAL_ORIGEM: Record<Canal, string> = {
  WEBCHAT: 'Webchat',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  EMAIL: 'E-mail',
  VOZ: 'Telefone',
};

/**
 * As etiquetas de leitura do cartao, em ordem fixa: temperatura antes de origem.
 *
 * Ordem fixa e nao "as que existirem primeiro": o olho do vendedor varre cem
 * cartoes na mesma posicao, e etiqueta que troca de lugar conforme o que esta
 * preenchido obriga a ler cada cartao de novo.
 */
export function etiquetasDoCartao(o: Pick<Oportunidade, 'temperatura' | 'canalOrigem'>): EtiquetaDoCartao[] {
  const etiquetas: EtiquetaDoCartao[] = [];

  if (o.temperatura) {
    etiquetas.push({
      texto: LABEL_TEMPERATURA[o.temperatura],
      tom: o.temperatura === 'QUENTE' ? 'marca' : 'neutro',
      titulo:
        'Temperatura: a leitura de quem esta na negociacao. Nao e a probabilidade da etapa — ' +
        'quando as duas discordam, a discordancia e a informacao.',
    });
  }

  if (o.canalOrigem) {
    etiquetas.push({
      texto: LABEL_CANAL_ORIGEM[o.canalOrigem],
      tom: 'neutro',
      titulo: 'Origem: por onde este negocio chegou.',
    });
  }

  return etiquetas;
}

/**
 * Temperatura e probabilidade da etapa discordam?
 *
 * Nao existe limiar inventado aqui. A comparacao e feita **contra as etapas do
 * proprio funil**: "etapa avancada" e a etapa de maior probabilidade entre as
 * que o funil tem, e nao um numero como 70% que eu teria escolhido sozinho e que
 * estaria errado em qualquer funil configurado de outro jeito.
 *
 * A discordancia que interessa e uma so: **negocio frio na etapa mais avancada
 * do funil**. Esse e o cartao que infla a previsao — a etapa diz que esta perto
 * de fechar, e quem esta na negociacao diz que esfriou. O contrario (quente numa
 * etapa inicial) e so otimismo comum, e nao muda decisao nenhuma.
 *
 * Retorna nulo quando falta informacao para comparar: sem temperatura, sem
 * probabilidade, ou funil com uma unica etapa (onde "mais avancada" nao
 * significa nada).
 */
export function discordanciaDaTemperatura(
  temperatura: Temperatura | null | undefined,
  probabilidadeDaEtapa: number | null | undefined,
  probabilidadesDoFunil: number[],
): string | null {
  if (temperatura !== 'FRIA') return null;
  if (typeof probabilidadeDaEtapa !== 'number') return null;
  if (probabilidadesDoFunil.length < 2) return null;

  const maior = Math.max(...probabilidadesDoFunil);
  if (probabilidadeDaEtapa < maior) return null;

  return 'Fria na etapa mais avancada do funil';
}
