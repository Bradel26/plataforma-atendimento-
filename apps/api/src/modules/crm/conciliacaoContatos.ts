/**
 * Conciliacao dos contatos por operacao (CRM > Empresas).
 *
 * Definicao da metrica: "contato" = linha ativa de `Contact` (excluidoEm nulo,
 * dentro da politica de visibilidade). Um contato e TIM se tem `ContactOperation`
 * TIM OU `segmentoParceiro = TIM` (idem Starlink). As faixas abaixo sao
 * MUTUAMENTE EXCLUSIVAS e somam o total, ao contrario de "tim" e "starlink"
 * (que se sobrepoem quando o contato esta nas duas operacoes).
 */
export type ContagemBrutaContatos = {
  total: number;
  tim: number;
  starlink: number;
  ambas: number;
};

export type ConciliacaoContatos = {
  total: number;
  tim: number;
  starlink: number;
  somenteTim: number;
  somenteStarlink: number;
  ambas: number;
  semOperacao: number;
  /** Soma das faixas exclusivas. Deve ser igual a `total`. */
  somaFaixas: number;
  /** total - somaFaixas. Diferente de zero indica contagem inconsistente. */
  diferenca: number;
  consistente: boolean;
};

export function conciliarContatos(c: ContagemBrutaContatos): ConciliacaoContatos {
  const somenteTim = Math.max(0, c.tim - c.ambas);
  const somenteStarlink = Math.max(0, c.starlink - c.ambas);
  const semOperacao = Math.max(0, c.total - (somenteTim + somenteStarlink + c.ambas));
  const somaFaixas = somenteTim + somenteStarlink + c.ambas + semOperacao;
  const diferenca = c.total - somaFaixas;
  return {
    total: c.total,
    tim: c.tim,
    starlink: c.starlink,
    somenteTim,
    somenteStarlink,
    ambas: c.ambas,
    semOperacao,
    somaFaixas,
    diferenca,
    consistente: diferenca === 0 && c.tim <= c.total && c.starlink <= c.total && c.ambas <= Math.min(c.tim, c.starlink),
  };
}
