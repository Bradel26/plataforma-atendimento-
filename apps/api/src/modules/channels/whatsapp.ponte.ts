import { AppError } from '../../lib/errors';
import {
  enderecosDaPonte,
  lerEstadoDaPonte,
  numeroNormalizado,
  type EstadoDaPonte,
} from './whatsapp.modo';

/**
 * O driver do WhatsApp nao oficial: fala HTTP com a ponte externa.
 *
 * A ponte e um processo separado (Baileys, WPPConnect e afins) que mantem a
 * sessao do WhatsApp Web. O porque de ela ser externa esta em `whatsapp.modo.ts`.
 *
 * Este arquivo e o gemeo do caminho da Graph API em `outbound.service.ts`, e
 * deliberadamente termina no mesmo tipo de resultado: quem chama nao sabe por
 * qual modo a mensagem saiu, e nao deve saber — a conversa, o historico e o
 * relatorio sao os mesmos nos dois.
 */

/** Igual ao da Graph: 15s. Ponte local costuma responder em milissegundos. */
const TEMPO_LIMITE = 15_000;

type Resultado = { idExterno: string | null };

async function chamar(url: string, token: string, corpo: FormData | Record<string, unknown>) {
  const ehForm = corpo instanceof FormData;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        // A plataforma se autentica NA ponte. Sem isso, qualquer um na mesma rede
        // manda mensagem pelo numero da empresa.
        Authorization: `Bearer ${token}`,
        ...(ehForm ? {} : { 'Content-Type': 'application/json' }),
      },
      body: ehForm ? corpo : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
  } catch (err) {
    /*
     * Ponte fora do ar e o caso COMUM deste modo, e nao a excecao: a sessao cai,
     * o container reinicia, o QR expira. A mensagem diz onde procurar, porque o
     * problema quase nunca esta na plataforma.
     */
    throw new AppError(
      502,
      'PONTE_INACESSIVEL',
      `Nao foi possivel falar com a ponte do WhatsApp: ${
        err instanceof Error ? err.message : 'erro de rede'
      }. Confira se a ponte esta de pe e se a sessao esta conectada.`,
    );
  }

  const dados = (await resposta.json().catch(() => ({}))) as {
    id?: string;
    idExterno?: string;
    key?: { id?: string };
    erro?: string;
    error?: string;
    message?: string;
  };

  if (!resposta.ok) {
    throw new AppError(
      502,
      'ENVIO_RECUSADO',
      `A ponte recusou o envio (${resposta.status}): ${
        dados.erro ?? dados.error ?? dados.message ?? 'sem detalhe'
      }`,
    );
  }

  /*
   * O id vem com nome diferente em cada ponte. Aceitar as tres formas conhecidas
   * e devolver nulo no resto e melhor que inventar um id: nulo significa "enviado,
   * sem identificador do lado do WhatsApp", e o historico ja trata isso — e um id
   * fabricado quebraria a deduplicacao de eco quando a ponte devolvesse o real.
   */
  return dados.idExterno ?? dados.id ?? dados.key?.id ?? null;
}

export type ConfigDaPonte = {
  ponteUrl: string | null;
  ponteToken: string | null;
  ponteSessao?: string | null;
};

function credenciais(config: ConfigDaPonte) {
  if (!config.ponteUrl || !config.ponteToken) {
    throw new AppError(
      503,
      'CANAL_INDISPONIVEL',
      'O WhatsApp esta no modo nao oficial, mas a ponte nao esta configurada',
    );
  }
  return {
    enderecos: enderecosDaPonte(config.ponteUrl, config.ponteSessao),
    token: config.ponteToken,
  };
}

/** Manda texto pela ponte. */
export async function enviarTextoPelaPonte(
  config: ConfigDaPonte,
  destino: string,
  texto: string,
): Promise<Resultado> {
  const { enderecos, token } = credenciais(config);

  const numero = numeroNormalizado(destino);
  if (!numero) {
    // Recusa com motivo, e nao tentativa com endereco improvisado: mensagem para
    // numero remontado pode chegar em outra pessoa.
    throw new AppError(
      400,
      'NUMERO_INVALIDO',
      `Numero "${destino}" nao parece um telefone com DDD — corrija o cadastro do contato`,
    );
  }

  return { idExterno: await chamar(enderecos.texto, token, { numero, texto }) };
}

/**
 * Manda arquivo pela ponte, em multipart.
 *
 * Ao contrario da Cloud API, nao ha upload em duas etapas: a ponte recebe o
 * binario e cuida do resto. E, ao contrario do Instagram, nao ha exigencia de URL
 * publica — o que faz este modo funcionar em instalacao sem dominio, que e
 * justamente onde ele e usado.
 */
export async function enviarArquivoPelaPonte(
  config: ConfigDaPonte,
  destino: string,
  arquivo: { buffer: Buffer; nome: string; tipo: string; legenda?: string },
): Promise<Resultado> {
  const { enderecos, token } = credenciais(config);

  const numero = numeroNormalizado(destino);
  if (!numero) {
    throw new AppError(
      400,
      'NUMERO_INVALIDO',
      `Numero "${destino}" nao parece um telefone com DDD — corrija o cadastro do contato`,
    );
  }

  const form = new FormData();
  form.append('numero', numero);
  if (arquivo.legenda) form.append('legenda', arquivo.legenda);
  form.append('arquivo', new Blob([new Uint8Array(arquivo.buffer)], { type: arquivo.tipo }), arquivo.nome);

  return { idExterno: await chamar(enderecos.arquivo, token, form) };
}

/**
 * Pergunta a ponte se a sessao esta de pe.
 *
 * Nunca lanca: o estado e diagnostico, e uma tela de configuracao que quebra
 * porque o diagnostico falhou e pior que uma que diz "nao foi possivel
 * confirmar". Ponte fora do ar responde DESCONHECIDO com o motivo no detalhe —
 * e nao DESCONECTADO, porque nao sabemos: pode ser a rede entre nos e ela.
 */
export async function estadoDaPonte(config: ConfigDaPonte): Promise<EstadoDaPonte> {
  if (!config.ponteUrl || !config.ponteToken) {
    return { situacao: 'DESCONHECIDO', detalhe: 'ponte nao configurada' };
  }

  const { enderecos, token } = credenciais(config);

  try {
    const resposta = await fetch(enderecos.estado, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resposta.ok) {
      return { situacao: 'DESCONHECIDO', detalhe: `a ponte respondeu ${resposta.status}` };
    }
    return lerEstadoDaPonte(await resposta.json().catch(() => null));
  } catch (err) {
    return {
      situacao: 'DESCONHECIDO',
      detalhe: err instanceof Error ? err.message : 'nao foi possivel falar com a ponte',
    };
  }
}
