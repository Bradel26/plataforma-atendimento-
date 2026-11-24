/**
 * "Precisam de contato" (CRM > Acompanhamentos).
 *
 * Definicao: parceiro em fluxo (sem excecao, fora da etapa ATIVO) que NAO tem
 * responsavel OU nunca teve conversa. A uniao esconde a causa: numa base
 * importada em lote todos entram so por "sem responsavel". Por isso a lista
 * vem acompanhada desta decomposicao, que fecha: total = so sem responsavel +
 * so sem conversa + os dois.
 */
export type ParceiroParaContato = { semResponsavel: boolean; semConversa: boolean };

export type ResumoPrecisamDeContato = {
  total: number;
  semResponsavel: number;
  semConversa: number;
  somenteSemResponsavel: number;
  somenteSemConversa: number;
  semResponsavelENemConversa: number;
};

export function resumirPrecisamDeContato(parceiros: ParceiroParaContato[]): ResumoPrecisamDeContato {
  const r: ResumoPrecisamDeContato = {
    total: 0,
    semResponsavel: 0,
    semConversa: 0,
    somenteSemResponsavel: 0,
    somenteSemConversa: 0,
    semResponsavelENemConversa: 0,
  };
  for (const p of parceiros) {
    if (!p.semResponsavel && !p.semConversa) continue;
    r.total += 1;
    if (p.semResponsavel) r.semResponsavel += 1;
    if (p.semConversa) r.semConversa += 1;
    if (p.semResponsavel && p.semConversa) r.semResponsavelENemConversa += 1;
    else if (p.semResponsavel) r.somenteSemResponsavel += 1;
    else r.somenteSemConversa += 1;
  }
  return r;
}
