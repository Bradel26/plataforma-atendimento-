import { createHmac } from 'node:crypto';
import { config } from './config.js';

/**
 * O caminho de volta: a ponte entrega na plataforma o que o cliente mandou.
 *
 * O corpo e o contrato de `ponte.routes.ts` — `{ numero, nome, texto,
 * idExterno, ... }` — assinado com HMAC-SHA256 no cabecalho
 * `X-Ponte-Assinatura`, no mesmo formato `sha256=<hex>` que a Meta usa. A
 * plataforma recusa sem assinatura valida, e isso e proposital: o endereco de
 * entrega e publico.
 */

export type MensagemRecebida = {
  numero: string;
  /** Nome da sessao/instancia que recebeu, para a plataforma achar a linha certa entre varias. */
  sessao: string;
  nome?: string | null;
  texto?: string;
  /** Id da mensagem no WhatsApp. E ele que impede duplicata na reentrega. */
  idExterno: string;
  anexoUrl?: string | null;
  tipoAnexo?: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO';
  anexoNome?: string | null;
};

const BASE = `${config.plataformaUrl}/api/webhooks/ponte`;

/** Espera entre as tentativas. Cresce para nao martelar plataforma reiniciando. */
const ESPERAS = [1_000, 5_000, 15_000];

function assinar(corpo: string) {
  return `sha256=${createHmac('sha256', config.segredo).update(corpo).digest('hex')}`;
}

async function tentar(
  endereco: string,
  corpo: string,
): Promise<{ ok: true } | { ok: false; motivo: string; definitivo: boolean }> {
  let resposta: Response;
  try {
    resposta = await fetch(endereco, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ponte-Assinatura': assinar(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Rede: vale reentregar, a plataforma pode estar subindo.
    return { ok: false, motivo: err instanceof Error ? err.message : 'erro de rede', definitivo: false };
  }

  if (resposta.ok) return { ok: true };

  const detalhe = await resposta.text().catch(() => '');

  /*
   * 4xx e defeito de integracao (corpo invalido, assinatura errada, organizacao
   * inexistente): reentregar nao conserta, so enche o log. Para de tentar e
   * registra alto, porque isso precisa de gente.
   *
   * 5xx e a plataforma passando mal: vale insistir.
   */
  const definitivo = resposta.status >= 400 && resposta.status < 500;
  return { ok: false, motivo: `${resposta.status} ${detalhe.slice(0, 300)}`, definitivo };
}

/**
 * POST assinado com reentrega, reaproveitado por `entregar` e `avisarStatus`.
 * Nunca lanca: quem chama decide o que fazer com `false` — para mensagem
 * recebida isso e so log (a ponte nao pode cair por causa disso); para aviso de
 * status e a mesma logica, o numero nao pode desconectar so porque a plataforma
 * estava fora do ar no instante do aviso.
 */
async function postComRetentativa(endereco: string, corpo: string, rotulo: string): Promise<boolean> {
  for (let tentativa = 0; ; tentativa += 1) {
    const r = await tentar(endereco, corpo);
    if (r.ok) return true;

    if (r.definitivo) {
      console.error(`[ponte] plataforma recusou ${rotulo}: ${r.motivo}`);
      return false;
    }

    if (tentativa >= ESPERAS.length) {
      console.error(`[ponte] desisti de ${rotulo} apos ${tentativa} tentativas: ${r.motivo}`);
      return false;
    }

    console.warn(`[ponte] falha ao entregar ${rotulo} (${r.motivo}); tento de novo`);
    await new Promise((ok) => setTimeout(ok, ESPERAS[tentativa]));
  }
}

/**
 * Entrega com reentrega. Nunca lanca: mensagem perdida vira log, e nao queda da
 * ponte — derrubar a sessao inteira porque UMA mensagem nao entrou desconectaria
 * o numero da empresa.
 */
export async function entregar(mensagem: MensagemRecebida): Promise<boolean> {
  const endereco = `${BASE}/whatsapp/${config.organizacaoId}`;
  return postComRetentativa(endereco, JSON.stringify(mensagem), `a mensagem ${mensagem.idExterno}`);
}

/**
 * Avisa a plataforma que uma sessao conectou ou caiu, para o painel de Canais
 * mostrar isso em tempo real — hoje ninguem sabia que o WhatsApp de um vendedor
 * tinha desconectado ate ele reclamar que parou de receber mensagem.
 */
export async function avisarStatus(
  sessao: string,
  status: 'CONECTADO' | 'DESCONECTADO',
  detalhe: string | null,
): Promise<boolean> {
  const endereco = `${BASE}/status/${config.organizacaoId}`;
  const corpo = JSON.stringify({ sessao, status, detalhe });
  return postComRetentativa(endereco, corpo, `o status (${status}) da sessao "${sessao}"`);
}
