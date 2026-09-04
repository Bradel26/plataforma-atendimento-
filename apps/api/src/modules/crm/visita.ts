/**
 * Check-in e check-out de visita: as regras (item 6.7 do plano em ANALISE-CRM.md).
 *
 * Vale mais para o técnico de campo que para o vendedor, como o próprio plano
 * registra: quem instala ar-condicionado precisa provar que esteve no lugar.
 *
 * Tudo o que decide fica aqui, sem banco: o que erra numa visita não quebra —
 * grava uma duração plausível e errada, ou permite um estado que a operação
 * depois não sabe explicar ("saiu sem ter chegado").
 */

export type EstadoDaVisita = 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'CONCLUIDA';

export type Visita = {
  checkinEm: Date | null;
  checkoutEm: Date | null;
};

/** Em que ponto a visita está. */
export function estadoDaVisita(v: Visita): EstadoDaVisita {
  if (v.checkinEm === null) return 'NAO_INICIADA';
  return v.checkoutEm === null ? 'EM_ANDAMENTO' : 'CONCLUIDA';
}

/**
 * Duração em minutos, ou nulo quando a visita não terminou.
 *
 * Nulo e não zero: visita em andamento **não** durou zero minuto, e um zero ali
 * entraria em qualquer média futura arrastando o número para baixo. Arredonda
 * para o minuto inteiro mais próximo, com piso de 1 para visita de segundos —
 * "0 min" descreveria mal uma visita que aconteceu.
 */
export function duracaoEmMinutos(v: Visita): number | null {
  if (v.checkinEm === null || v.checkoutEm === null) return null;
  const ms = v.checkoutEm.getTime() - v.checkinEm.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60_000));
}

/** Por que o check-in não pode acontecer, ou `null` quando pode. */
export function impedimentoDoCheckin(atividade: { tipo: string } & Visita): string | null {
  /*
   * Só VISITA tem check-in.
   *
   * Permitir em qualquer tipo pareceria generoso e produziria "check-in de
   * e-mail" — um dado que ninguém sabe ler depois, no meio dos que importam.
   */
  if (atividade.tipo !== 'VISITA') {
    return 'Check-in existe para atividade do tipo Visita';
  }
  /*
   * Check-in duas vezes é recusado, e não sobrescrito.
   *
   * Sobrescrever apagaria a hora real da chegada — que é exatamente o dado que o
   * check-in existe para guardar. Quem apertou duas vezes por engano continua com
   * a primeira hora, que é a verdadeira.
   */
  if (atividade.checkinEm !== null) return 'Esta visita já tem check-in';
  return null;
}

/** Por que o check-out não pode acontecer, ou `null` quando pode. */
export function impedimentoDoCheckout(atividade: { tipo: string } & Visita): string | null {
  if (atividade.tipo !== 'VISITA') {
    return 'Check-out existe para atividade do tipo Visita';
  }
  if (atividade.checkinEm === null) return 'Faça o check-in antes de encerrar a visita';
  if (atividade.checkoutEm !== null) return 'Esta visita já foi encerrada';
  return null;
}

/**
 * Coordenada válida, ou nula.
 *
 * O navegador manda `0,0` quando o GPS falha de certas formas, e o Golfo da
 * Guiné não é onde a visita aconteceu. Fora de faixa também cai fora: latitude
 * 91 não existe, e gravar isso poria um alfinete no mapa em lugar nenhum.
 *
 * Coordenada ausente **não** impede o check-in: o técnico pode estar num
 * subsolo, com GPS negado ou sem sinal, e recusar o registro nesse caso o
 * impediria justamente na visita mais difícil. Sem coordenada o registro vale
 * menos, mas existe — e a tela diz que ele veio sem localização.
 */
export function coordenadaValida(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Resumo do dia de quem faz visita.
 *
 * `emAndamento` é a informação operacional: uma visita com check-in e sem
 * check-out há horas costuma ser esquecimento de encerrar, não uma visita de
 * quatro horas — e quem coordena precisa ver isso sem abrir uma por uma.
 */
export function resumirVisitas(visitas: Visita[]) {
  const concluidas = visitas.filter((v) => estadoDaVisita(v) === 'CONCLUIDA');
  const duracoes = concluidas.map(duracaoEmMinutos).filter((d): d is number => d !== null);
  const soma = duracoes.reduce((a, d) => a + d, 0);

  return {
    total: visitas.length,
    naoIniciadas: visitas.filter((v) => estadoDaVisita(v) === 'NAO_INICIADA').length,
    emAndamento: visitas.filter((v) => estadoDaVisita(v) === 'EM_ANDAMENTO').length,
    concluidas: concluidas.length,
    /** Nulo quando nenhuma visita terminou — média de zero visitas não existe. */
    duracaoMediaMinutos: duracoes.length === 0 ? null : Math.round(soma / duracoes.length),
    minutosEmVisita: soma,
  };
}
