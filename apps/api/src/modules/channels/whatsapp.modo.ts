import type { ModoWhatsApp } from '@prisma/client';

/**
 * WhatsApp nos dois modos: Cloud API oficial e ponte nao oficial.
 *
 * ## Por que a ponte e externa, e nao uma biblioteca aqui dentro
 *
 * O modo nao oficial funciona conectando-se ao WhatsApp Web como se fosse um
 * navegador (Baileys, WPPConnect e afins). A plataforma **nao embute** essa
 * biblioteca, e a escolha nao e de gosto:
 *
 * - a sessao vive de QR Code, reconexao e estado em disco — coisas de processo
 *   longo, que morreriam a cada `deploy` da API;
 * - a biblioteca acompanha mudancas do protocolo do WhatsApp e quebra sozinha;
 *   embutida, ela pararia a plataforma inteira quando quebrasse;
 * - e o risco de bloqueio pertence ao numero, nao ao sistema: mante-lo num
 *   processo separado permite desligar a ponte sem tocar no atendimento.
 *
 * Entao a plataforma fala HTTP com a ponte, do mesmo jeito que fala com o motor
 * de IA externo — e a ponte fala com o WhatsApp.
 *
 * ## O aviso
 *
 * O modo nao oficial **viola os termos de uso do WhatsApp**, e o numero pode ser
 * bloqueado sem aviso nem recurso. Isso esta no schema, aqui, na tela de
 * configuracao e no SCOPE.md. Nao e para desencorajar quem decidiu: e para que a
 * decisao seja tomada por quem tem autoridade para toma-la, em vez de descoberta
 * no dia em que o numero da empresa para de funcionar.
 */

/** Nulo = canal configurado antes de o modo existir. Era oficial, e continua. */
export function modoEfetivo(modo: ModoWhatsApp | null | undefined): ModoWhatsApp {
  return modo ?? 'OFICIAL';
}

export type CredenciaisDoCanal = {
  ativo: boolean;
  accessToken: string | null;
  phoneNumberId: string | null;
  ponteUrl: string | null;
  ponteToken: string | null;
  ponteSessao?: string | null;
};

/**
 * O que falta para este canal conseguir enviar, ou nulo se esta pronto.
 *
 * Devolve a frase que o usuario le. Cada modo exige credenciais diferentes, e
 * dizer "canal nao configurado" para os dois faria quem esta no modo nao oficial
 * procurar um token da Meta que ele nunca vai ter.
 */
export function impedimentoDeEnvio(
  modo: ModoWhatsApp | null | undefined,
  c: CredenciaisDoCanal,
  /**
   * `WhatsAppProvider.credenciaisPorLinha`. Sem ele vale o da Ponte Baileys
   * (`true`): a linha precisa de endereco e token proprios. Com `false`
   * (WPPConnect), a conexao e global e a linha so precisa da sessao.
   */
  opcoes: { credenciaisPorLinha?: boolean } = {},
): string | null {
  if (!c.ativo) return 'O canal WhatsApp esta inativo';

  if (modoEfetivo(modo) === 'OFICIAL') {
    if (!c.accessToken) return 'Falta o token de acesso da Cloud API';
    if (!c.phoneNumberId) return 'Falta o phone number id da Cloud API';
    return null;
  }

  if (opcoes.credenciaisPorLinha === false) {
    if (!c.ponteSessao) return 'Falta a sessao do WhatsApp desta linha';
    return null;
  }

  if (!c.ponteUrl) return 'Falta o endereco da ponte nao oficial';
  if (!c.ponteToken) return 'Falta o token de autenticacao na ponte';
  return null;
}

/**
 * Numero no formato que os dois modos entendem: so digitos, com pais.
 *
 * A Cloud API aceita `+55 11 99999-9999` e devolve `5511999999999`; a ponte
 * espera `5511999999999@c.us` ou o numero cru, dependendo da implementacao. O
 * denominador comum e o numero em digitos, e a normalizacao mora aqui para os
 * dois caminhos nao divergirem no que consideram "o mesmo contato".
 *
 * **Nao adivinha o nono digito.** Numero antigo de oito digitos e devolvido como
 * esta: inserir um 9 seria inventar um numero que pode ser de outra pessoa, e
 * quem tem base antiga precisa corrigir o cadastro, nao receber um palpite.
 *
 * Devolve nulo quando nao da para afirmar que e um telefone — e nulo aqui vira
 * recusa com mensagem, nunca um envio para endereco improvisado.
 */
export function numeroNormalizado(bruto: string | null | undefined): string | null {
  if (!bruto) return null;

  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length < 10) return null;
  // Mais de 15 digitos nao e telefone em nenhum plano de numeracao (E.164).
  if (digitos.length > 15) return null;

  // Numero brasileiro sem o pais: 10 ou 11 digitos comecando por DDD valido.
  if (digitos.length <= 11) return `55${digitos}`;
  return digitos;
}

export type EstadoDaPonte = {
  /** `conectado` so quando a ponte afirma que a sessao esta de pe. */
  situacao: 'CONECTADO' | 'DESCONECTADO' | 'DESCONHECIDO';
  /** O que a ponte disse, para a tela mostrar sem traduzir errado. */
  detalhe: string | null;
  /** Numero conectado (so digitos, com pais), quando o provider sabe informar. */
  telefone?: string | null;
};

/**
 * Le a resposta de estado da ponte.
 *
 * Cada ponte responde diferente (`{connected:true}`, `{status:'CONNECTED'}`,
 * `{state:'open'}`), e ler apenas uma forma faria a plataforma dizer
 * "desconectado" para uma sessao viva. Entao aceita as formas conhecidas e, para
 * o que nao reconhece, responde **DESCONHECIDO** em vez de escolher um dos dois
 * extremos.
 *
 * Desconhecido nao e desconectado: a tela diz "nao foi possivel confirmar", e o
 * envio continua sendo tentado. Bloquear o atendimento porque nao entendemos o
 * formato do diagnostico seria trocar um problema pequeno por um grande.
 */
export function lerEstadoDaPonte(corpo: unknown): EstadoDaPonte {
  if (corpo === null || typeof corpo !== 'object') {
    return { situacao: 'DESCONHECIDO', detalhe: null };
  }

  const c = corpo as Record<string, unknown>;
  const detalhe =
    typeof c.detalhe === 'string'
      ? c.detalhe
      : typeof c.message === 'string'
        ? c.message
        : typeof c.status === 'string'
          ? c.status
          : typeof c.state === 'string'
            ? c.state
            : null;

  if (c.connected === true || c.conectado === true) return { situacao: 'CONECTADO', detalhe };
  if (c.connected === false || c.conectado === false) return { situacao: 'DESCONECTADO', detalhe };

  const texto = (typeof c.status === 'string' ? c.status : typeof c.state === 'string' ? c.state : '')
    .trim()
    .toUpperCase();

  if (['CONNECTED', 'OPEN', 'ONLINE', 'READY', 'CONECTADO'].includes(texto)) {
    return { situacao: 'CONECTADO', detalhe };
  }
  if (['DISCONNECTED', 'CLOSE', 'CLOSED', 'OFFLINE', 'QRCODE', 'PAIRING', 'DESCONECTADO'].includes(texto)) {
    return { situacao: 'DESCONECTADO', detalhe };
  }

  return { situacao: 'DESCONHECIDO', detalhe };
}

/**
 * Onde a ponte recebe cada operacao.
 *
 * Caminhos por convencao, com a sessao no fim quando existe. Nao ha padrao entre
 * as pontes, entao o endereco base e configuravel e os caminhos sao fixos — quem
 * usa uma ponte diferente aponta um proxy fino para ca, que e menos trabalho que
 * a plataforma tentar adivinhar cinco dialetos.
 */
export function enderecosDaPonte(base: string, sessao: string | null | undefined) {
  const raiz = base.replace(/\/+$/, '');
  const sufixo = sessao ? `/${encodeURIComponent(sessao)}` : '';
  return {
    texto: `${raiz}/mensagens${sufixo}`,
    arquivo: `${raiz}/arquivos${sufixo}`,
    estado: `${raiz}/estado${sufixo}`,
    /*
     * `qr` e `desconectar` sao o pareamento pela tela, e nem toda ponte os tem
     * — quem usa uma de terceiro (Evolution API e afins) responde 404 aqui, e o
     * lado da plataforma trata isso como "esta ponte nao sabe parear", nao como
     * defeito. Por isso continuam sendo caminho por convencao como os outros.
     */
    qr: `${raiz}/qr${sufixo}`,
    desconectar: `${raiz}/desconectar${sufixo}`,
  };
}

/** O aviso que a tela mostra. Uma frase, sem rodeio e sem sermao. */
export const AVISO_NAO_OFICIAL =
  'O modo nao oficial se conecta como WhatsApp Web e viola os termos de uso do WhatsApp: ' +
  'o numero pode ser bloqueado sem aviso. Use um numero que a operacao possa perder.';
