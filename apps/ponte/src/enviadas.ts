/**
 * Ids de mensagens que a PLATAFORMA mandou por esta ponte.
 *
 * Com o espelhamento do celular ligado, tudo que sai do numero volta como
 * `fromMe` — inclusive o que a propria plataforma enviou. Sem esta memoria, a
 * resposta do atendente apareceria duas vezes: a dele e uma "enviada por outro
 * dispositivo". A API tambem deduplica pelo idExterno; esta e a primeira trava.
 */
const VALIDADE_MS = 10 * 60_000;
const LIMITE = 5_000;
const enviadas = new Map<string, number>();

export function lembrarEnviadaPelaPlataforma(id: string, agora = Date.now()): void {
  enviadas.set(id, agora + VALIDADE_MS);
  if (enviadas.size > LIMITE) {
    for (const [chave, expira] of enviadas) {
      if (expira <= agora || enviadas.size > LIMITE) enviadas.delete(chave);
      if (enviadas.size <= LIMITE) break;
    }
  }
}

export function foiEnviadaPelaPlataforma(id: string, agora = Date.now()): boolean {
  const expira = enviadas.get(id);
  if (expira === undefined) return false;
  if (expira <= agora) {
    enviadas.delete(id);
    return false;
  }
  return true;
}
