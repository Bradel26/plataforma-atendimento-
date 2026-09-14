import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  type AnyMessageContent,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { toDataURL } from 'qrcode';
import { criarAuthStatePersistido } from './autenticacaoPostgres.js';
import { bancoDeSessaoPg } from './banco.js';
import { config } from './config.js';

/**
 * A sessao do WhatsApp Web: o unico lugar do sistema que fala com o WhatsApp.
 *
 * Ela e um processo LONGO por natureza — o pareamento vale por semanas, mas so
 * enquanto o socket viver. E o motivo de a ponte ser um servico separado da API:
 * a API reinicia a cada deploy, e a sessao nao sobrevive a isso.
 *
 * ## O ciclo que a tela mostra
 *
 *   sem credencial   -> QRCODE       (esperando alguem escanear)
 *   escaneou         -> CONECTADO
 *   caiu             -> DESCONECTADO, e tenta voltar sozinha
 *   deslogou no cel  -> QRCODE de novo, com as credenciais apagadas
 *
 * A reconexao e automatica em tudo, MENOS quando o WhatsApp diz `loggedOut`:
 * nesse caso as credenciais nao valem mais e insistir so gera erro em loop. Ali
 * a sessao volta para o QR e espera uma pessoa.
 */

export type Situacao = 'CONECTADO' | 'DESCONECTADO' | 'QRCODE' | 'CONECTANDO';

export type Sessao = {
  nome: string;
  sock: WASocket | null;
  situacao: Situacao;
  detalhe: string | null;
  /** QR ja em PNG data URL: a tela so precisa jogar num `img`. */
  qr: string | null;
  numero: string | null;
  /** Evita duas partidas simultaneas quando duas chamadas chegam juntas. */
  iniciando: Promise<void> | null;
};

const sessoes = new Map<string, Sessao>();

/* Baileys e falante demais para log de operacao: so o que impede de funcionar. */
const logger = pino({ level: process.env.PONTE_LOG ?? 'warn' });

/** Vira nome de pasta: barra ou ".." sairiam do diretorio de dados. */
function nomeValido(nome: string) {
  return /^[a-zA-Z0-9_-]{1,60}$/.test(nome);
}

/** O numero em digitos vira o endereco que o WhatsApp entende. */
export function jid(numero: string) {
  return numero + '@s.whatsapp.net';
}

/** So os digitos de um jid, sem sufixo nem id de aparelho. */
export function numeroDoJid(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const antesDaArroba = valor.split('@')[0] ?? '';
  const digitos = (antesDaArroba.split(':')[0] ?? '').replace(/\D/g, '');
  return digitos.length >= 10 ? digitos : null;
}

async function limparCredenciais(nome: string) {
  await bancoDeSessaoPg.apagar(nome);
}

/**
 * Quem trata a mensagem que chega. Injetado por `main.ts`.
 *
 * A sessao nao importa `plataforma.ts` direto para nao criar um ciclo com o
 * servidor, e para o teste conseguir observar o que ela emite sem subir rede.
 */
let aoReceber: ((sessao: Sessao, msg: unknown) => void) | null = null;

export function quandoReceber(handler: (sessao: Sessao, msg: unknown) => void) {
  aoReceber = handler;
}

/**
 * Quem avisa a plataforma que a sessao caiu ou voltou. Mesma tecnica de
 * `aoReceber`: hook injetavel, para nao criar dependencia circular com
 * `plataforma.ts` e para o teste conseguir observar sem rede.
 */
let aoMudarStatus: ((sessao: Sessao) => void) | null = null;

export function quandoMudarStatus(handler: (sessao: Sessao) => void) {
  aoMudarStatus = handler;
}

async function conectar(sessao: Sessao) {
  const { state, saveCreds } = await criarAuthStatePersistido(sessao.nome, bancoDeSessaoPg);

  /*
   * A versao do WhatsApp Web vem de FORA, e nao da constante embutida no
   * Baileys.
   *
   * O servidor do WhatsApp recusa cliente velho com "Connection Failure" antes
   * mesmo de emitir o QR — verificado aqui: com a versao embutida da 6.17.16 a
   * sessao entra em loop de reconexao e nunca mostra nada para escanear. Como a
   * biblioteca e publicada mais devagar que o WhatsApp muda, a constante nasce
   * vencida.
   *
   * Se a busca falhar (rede, endpoint fora), segue com a embutida: pode ser que
   * ainda sirva, e nao subir a sessao seria pior que tentar.
   */
  let versao: [number, number, number] | undefined;
  try {
    versao = (await fetchLatestBaileysVersion()).version;
  } catch (err) {
    console.warn('[ponte] nao consegui descobrir a versao do WhatsApp Web; uso a embutida:', err);
  }

  const sock = makeWASocket({
    version: versao,
    auth: state,
    // O QR sai pela API, nao pelo terminal: quem escaneia esta na tela de
    // Canais, e nao com acesso ao console do servidor.
    printQRInTerminal: false,
    logger,
    // O nome aparece em "Aparelhos conectados" no celular. Dizer o que e ajuda
    // quem for auditar a lista a nao desconectar o atendimento por engano.
    browser: Browsers.ubuntu('Plataforma de Atendimento'),
    // Sem isso a sessao fica online o tempo todo e marca conversa como lida.
    markOnlineOnConnect: false,
  });

  sessao.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    if (u.qr) {
      sessao.situacao = 'QRCODE';
      sessao.detalhe = 'aguardando leitura do QR Code';
      // Falha ao desenhar nao derruba nada: a tela continua dizendo "gerando".
      toDataURL(u.qr, { margin: 1, width: 320 })
        .then((png) => {
          sessao.qr = png;
        })
        .catch((err) => {
          console.error('[ponte] nao consegui desenhar o QR:', err);
        });
    }

    if (u.connection === 'open') {
      sessao.situacao = 'CONECTADO';
      sessao.detalhe = null;
      // QR usado nao serve mais, e guardado seria um convite a parear de novo.
      sessao.qr = null;
      sessao.numero = numeroDoJid(sock.user?.id);
      console.log('[ponte] sessao "' + sessao.nome + '" conectada' + (sessao.numero ? ' como ' + sessao.numero : ''));
      aoMudarStatus?.(sessao);
    }

    if (u.connection === 'close') {
      const erro = u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
      const motivo = erro?.output?.statusCode;
      const deslogado = motivo === DisconnectReason.loggedOut;

      sessao.sock = null;
      sessao.iniciando = null;
      sessao.situacao = 'DESCONECTADO';
      sessao.detalhe = deslogado
        ? 'o aparelho desconectou esta sessao — escaneie o QR de novo'
        : 'conexao caiu (' + (motivo ?? 'sem codigo') + '); tentando voltar';
      aoMudarStatus?.(sessao);

      if (deslogado) {
        /*
         * Credencial invalidada no celular. As chaves em disco viraram lixo, e
         * reconectar com elas repetiria o erro para sempre — entao a proxima
         * partida comeca do zero, pedindo QR.
         */
        console.warn('[ponte] sessao "' + sessao.nome + '" deslogada pelo aparelho');
        void limparCredenciais(sessao.nome).then(() => reiniciar(sessao, 2_000));
        return;
      }

      reiniciar(sessao, 3_000);
    }
  });

  sock.ev.on('messages.upsert', (evento) => {
    // `notify` e mensagem nova. Os outros tipos sao carga de historico, e
    // reentregariam conversas antigas como se tivessem acabado de chegar.
    if (evento.type !== 'notify') return;
    for (const msg of evento.messages) aoReceber?.(sessao, msg);
  });
}

function reiniciar(sessao: Sessao, espera: number) {
  setTimeout(() => {
    sessao.iniciando = null;
    void garantirNoAr(sessao.nome).catch((err) => {
      console.error('[ponte] falhei ao reconectar "' + sessao.nome + '":', err);
    });
  }, espera).unref();
}

/** Devolve a sessao, subindo o socket se ainda nao houver um. */
export async function garantirNoAr(nome: string): Promise<Sessao> {
  if (!nomeValido(nome)) throw new Error('Nome de sessao invalido: "' + nome + '"');

  let sessao = sessoes.get(nome);
  if (!sessao) {
    sessao = { nome, sock: null, situacao: 'CONECTANDO', detalhe: null, qr: null, numero: null, iniciando: null };
    sessoes.set(nome, sessao);
  }

  if (sessao.sock) return sessao;

  /*
   * Duas requisicoes simultaneas nao podem abrir dois sockets para o mesmo
   * numero: o segundo derruba o primeiro, e a sessao fica piscando entre
   * conectado e caido sem nunca estabilizar.
   */
  if (!sessao.iniciando) {
    const alvo = sessao;
    alvo.situacao = 'CONECTANDO';
    alvo.iniciando = conectar(alvo).catch((err) => {
      alvo.iniciando = null;
      alvo.situacao = 'DESCONECTADO';
      alvo.detalhe = err instanceof Error ? err.message : 'falha ao iniciar a sessao';
      throw err;
    });
  }

  await sessao.iniciando;
  return sessao;
}

export function situacaoDe(sessao: Sessao) {
  return {
    connected: sessao.situacao === 'CONECTADO',
    status: sessao.situacao,
    detalhe: sessao.detalhe,
    numero: sessao.numero,
  };
}

/** O QR atual, ou nulo quando nao ha o que escanear (conectada ou subindo). */
export function qrDe(sessao: Sessao) {
  return { qr: sessao.qr, conectado: sessao.situacao === 'CONECTADO', status: sessao.situacao };
}

/**
 * Desfaz o pareamento e volta para o QR.
 *
 * E o botao "trocar de numero" da tela. Faz logout de verdade no aparelho antes
 * de apagar as chaves: apagar sem deslogar deixaria a plataforma orfa na lista
 * de aparelhos conectados do celular, ocupando uma das vagas.
 */
export async function desconectar(nome: string) {
  if (!nomeValido(nome)) throw new Error('Nome de sessao invalido: "' + nome + '"');

  const sessao = sessoes.get(nome);

  if (sessao?.sock) {
    try {
      await sessao.sock.logout();
    } catch {
      // Logout falha quando a sessao ja estava caida. Segue para a limpeza: o
      // objetivo e poder parear de novo, e isso a limpeza garante sozinha.
    }
    sessao.sock = null;
  }

  await limparCredenciais(nome);
  sessoes.delete(nome);
}

/** Erro que o servidor traduz em 503 em vez de 500. */
export class SessaoIndisponivel extends Error {
  readonly http = 503;
}

async function enviar(nome: string, destino: string, conteudo: AnyMessageContent) {
  const sessao = await garantirNoAr(nome);

  if (!sessao.sock || sessao.situacao !== 'CONECTADO') {
    // O estado vai dentro do erro: "sessao desconectada" sozinho faria o agente
    // repetir o envio, quando o que resolve e alguem escanear o QR.
    throw new SessaoIndisponivel(
      'A sessao "' +
        nome +
        '" nao esta conectada (' +
        sessao.situacao.toLowerCase() +
        (sessao.detalhe ? ': ' + sessao.detalhe : '') +
        ')',
    );
  }

  const enviada = await sessao.sock.sendMessage(jid(destino), conteudo);
  return enviada?.key?.id ?? null;
}

export function enviarTexto(nome: string, destino: string, texto: string) {
  return enviar(nome, destino, { text: texto });
}

export function enviarArquivo(
  nome: string,
  destino: string,
  arquivo: { buffer: Buffer; nome: string; tipo: string; legenda?: string },
) {
  const legenda = arquivo.legenda || undefined;

  /*
   * O WhatsApp trata cada midia como um tipo proprio: imagem mandada como
   * documento chega como anexo para baixar, e audio como documento nao toca.
   * Entao o MIME decide a forma, e o que nao for reconhecido vira documento —
   * o unico que aceita qualquer coisa.
   */
  if (arquivo.tipo.startsWith('image/')) {
    return enviar(nome, destino, { image: arquivo.buffer, caption: legenda });
  }
  if (arquivo.tipo.startsWith('video/')) {
    return enviar(nome, destino, { video: arquivo.buffer, caption: legenda });
  }
  if (arquivo.tipo.startsWith('audio/')) {
    return enviar(nome, destino, { audio: arquivo.buffer, mimetype: arquivo.tipo });
  }

  return enviar(nome, destino, {
    document: arquivo.buffer,
    mimetype: arquivo.tipo,
    fileName: arquivo.nome,
    caption: legenda,
  });
}

/** O que ja foi pareado, para a tela nao precisar adivinhar nomes. */
export function listar() {
  return [...sessoes.values()].map((s) => ({ nome: s.nome, ...situacaoDe(s) }));
}
