/**
 * Vencimento e status de garantia (item 5.1).
 *
 * Regra de origem (treinamento Philco, `ANALISE-CRM.md`): a garantia LEGAL e
 * de 90 dias, a CONTRATUAL soma mais 270 (360 no total), e o COMPRESSOR tem 10
 * anos — mas a CONTRATUAL **so vale** com instalador credenciado Philco e nota
 * fiscal apresentada. Sem os dois, o componente nunca chegou a existir, e isso
 * e diferente de "venceu".
 *
 * Os prazos em si (`prazoDias`) nao sao constantes aqui: cada componente traz
 * o proprio prazo, porque a base instalada pode um dia guardar equipamento de
 * outra marca com outra regra. O que e fixo e a logica de estados.
 */

export type TipoGarantia = 'LEGAL' | 'CONTRATUAL' | 'COMPRESSOR' | 'OUTRA';

export type ComponenteGarantiaFatos = {
  tipo: TipoGarantia;
  prazoDias: number;
  /** Herda a data de instalacao do produto quando o componente nao tem a propria. */
  dataInicio: Date | null;
};

export type CondicoesDeInstalacao = {
  /** Nulo = nao informado — estado proprio, diferente de "nao credenciado". */
  instaladorCredenciado: boolean | null;
  notaFiscalNumero: string | null;
};

export type StatusGarantia =
  /** Dentro do prazo. */
  | 'VIGENTE'
  /** Prazo encerrado. */
  | 'VENCIDA'
  /** Sem data de inicio: nao ha como calcular vencimento nenhum. */
  | 'SEM_DATA_INICIO'
  /** CONTRATUAL cujo instalador credenciado ainda nao foi informado. */
  | 'REQUISITO_NAO_INFORMADO'
  /** CONTRATUAL sem instalador credenciado ou sem nota fiscal: nunca existiu. */
  | 'NAO_APLICAVEL';

export type ResultadoGarantia = {
  status: StatusGarantia;
  /** Nulo sempre que o status nao permitir calcular uma data. */
  vencimento: Date | null;
};

const UM_DIA_MS = 86_400_000;

export function statusDaGarantia(
  componente: ComponenteGarantiaFatos,
  condicoes: CondicoesDeInstalacao,
  agora: Date = new Date(),
): ResultadoGarantia {
  if (componente.tipo === 'CONTRATUAL') {
    if (condicoes.instaladorCredenciado === null) {
      return { status: 'REQUISITO_NAO_INFORMADO', vencimento: null };
    }
    if (condicoes.instaladorCredenciado === false || !condicoes.notaFiscalNumero) {
      return { status: 'NAO_APLICAVEL', vencimento: null };
    }
  }

  if (!componente.dataInicio) {
    return { status: 'SEM_DATA_INICIO', vencimento: null };
  }

  const vencimento = new Date(componente.dataInicio.getTime() + componente.prazoDias * UM_DIA_MS);
  return {
    status: vencimento.getTime() < agora.getTime() ? 'VENCIDA' : 'VIGENTE',
    vencimento,
  };
}
