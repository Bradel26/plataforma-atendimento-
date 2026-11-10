/**
 * "outubro de 2026" a partir do mês curto ("2026-10") ou do instante ISO que a
 * API devolve ("2026-10-01T00:00:00.000Z"). Só os 7 primeiros caracteres
 * importam, e a data é montada em UTC para o fuso não puxar para o mês anterior.
 */
export const mesPorExtenso = (mes: string) =>
  new Date(`${mes.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
