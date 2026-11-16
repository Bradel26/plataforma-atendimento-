import type { ResultadoRefresh, Sessao } from './api';

/** Esperas entre tentativas quando o servico esta fora. O ultimo valor se repete. */
export const ESPERAS_DE_RECUPERACAO_MS = [2_000, 4_000, 8_000, 15_000, 30_000];

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Restaura a sessao no carregamento da pagina.
 *
 * - `ok`: devolve a sessao.
 * - `expirada` (401 confirmado): devolve `null` — vai para o login.
 * - `indisponivel` (5xx, 429, rede): NAO devolve `null`. Espera e tenta de novo
 *   ate o servico voltar (ou ate `cancelado()`). O cookie de refresh nunca e
 *   tocado por aqui: ele continua valido, e e ele que permite a recuperacao
 *   automatica sem o usuario digitar a senha de novo.
 */
export async function restaurarSessao(opcoes: {
  renovar: () => Promise<ResultadoRefresh>;
  aoIndisponivel?: (tentativa: number) => void;
  esperar?: (ms: number) => Promise<void>;
  cancelado?: () => boolean;
}): Promise<Sessao | null> {
  const { renovar, aoIndisponivel, esperar = dormir, cancelado = () => false } = opcoes;

  for (let tentativa = 0; ; tentativa++) {
    const resultado = await renovar();
    if (resultado.estado === 'ok') return resultado.sessao;
    if (resultado.estado === 'expirada') return null;
    if (cancelado()) return null;

    aoIndisponivel?.(tentativa);
    await esperar(ESPERAS_DE_RECUPERACAO_MS[Math.min(tentativa, ESPERAS_DE_RECUPERACAO_MS.length - 1)]!);
    if (cancelado()) return null;
  }
}
