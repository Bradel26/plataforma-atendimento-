import { createHash } from 'node:crypto';
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  getCodeFromWSError,
  makeWASocket,
  type AnyMessageContent,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { toDataURL } from 'qrcode';
import { criarAuthStatePersistido } from './autenticacaoPostgres.js';
import { bancoDeSessaoPg } from './banco.js';
import { config } from './config.js';
import { extrair } from './recebida.js';

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
  /**
   * Preenchido do momento em que a conexao cai (nao-loggedOut) ate a proxima
   * tentativa comecar — cobre o backoff INTEIRO, nao so o `conectar()` em si
   * (isso e o que `iniciando` ja cobre). Enquanto isto nao for nulo,
   * `garantirNoAr` nao pode abrir um socket por conta propria: so espera esta
   * promise, porque quem decide a hora certa de reconectar e o backoff do
   * WhatsApp, nao o polling HTTP que bateu primeiro. Ver `agendarReconexao`.
   */
  reconectando: Promise<void> | null;
};

const sessoes = new Map<string, Sessao>();

/* Baileys e falante demais para log de operacao: so o que impede de funcionar. */
const logger = pino({ level: process.env.PONTE_LOG ?? 'warn' });

/** Vira nome de pasta: barra ou ".." sairiam do diretorio de dados. */
function nomeValido(nome: string) {
  return /^[a-zA-Z0-9_-]{1,60}$/.test(nome);
}

/**
 * TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): identificador
 * curto e nao reversivel de um QR, so para o log conseguir dizer "e o mesmo
 * QR de antes" ou "mudou" sem nunca imprimir o conteudo do QR (que carrega o
 * segredo de pareamento).
 */
function hashCurto(valor: string): string {
  return createHash('sha256').update(valor).digest('hex').slice(0, 10);
}

/**
 * TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): palavras que,
 * se aparecerem no stack de um erro, fazem `stackSeguro` omiti-lo por
 * inteiro. Um stack trace normal do Baileys nunca carrega credencial —
 * mas alguma biblioteca de terceiro (ex.: erro de rede com a URL completa
 * interpolada) poderia, e o custo de checar antes de logar e minimo.
 */
const PADRAO_SENSIVEL = /token|secret|segredo|senha|password|authoriz|bearer|cookie|credential/i;

/**
 * TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): stack de um
 * erro, resumido a poucas linhas e nunca logado se contiver qualquer palavra
 * de `PADRAO_SENSIVEL`. Devolve nulo quando o valor nem e um `Error` (ex.:
 * Baileys as vezes fecha a conexao com uma string solta, nao um objeto).
 */
export function stackSeguro(erro: unknown): string | null {
  if (!(erro instanceof Error) || !erro.stack) return null;
  if (PADRAO_SENSIVEL.test(erro.stack)) return 'stack_omitido_por_seguranca';
  // Uma linha so no log: junta as primeiras frames com um separador visivel
  // em vez das quebras de linha normais do stack.
  return erro.stack.split('\n').slice(0, 4).join(' <- ');
}

/**
 * TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): diagnostico
 * seguro de `lastDisconnect.error` — o teste real da sessao pessoal
 * "vendedor-a06db3d6" fechou com `statusCode="sem codigo" motivo="desconhecido"`,
 * e o log anterior nao guardava mais nada do erro para investigar o motivo.
 *
 * O Baileys SEMPRE fecha via `new Boom(mensagem, { statusCode })`
 * (`node_modules/@whiskeysockets/baileys/lib/Socket/socket.js`), entao
 * `.output.statusCode` deveria vir preenchido — inclusive no caso de erro de
 * rede baixo nivel, via `mapWebSocketError`, que usa a MESMA funcao
 * `getCodeFromWSError` reaproveitada aqui como `statusCodeDerivado`: serve de
 * pista quando `.output.statusCode` vier vazio (ex.: `lastDisconnect.error`
 * inteiro ausente, ou um erro que nao passou pelo caminho normal do Boom).
 *
 * Nunca devolve token, segredo, QR, cookie ou conteudo de mensagem — so
 * metadados sobre o ERRO em si (nome da classe, mensagem, codigos, stack
 * filtrado por `stackSeguro`).
 */
export function descreverErroDeDesconexao(erroBruto: unknown): {
  presente: boolean;
  nome?: string;
  mensagem?: string;
  outputStatusCode?: number | null;
  dataStatusCode?: number | null;
  statusCodeDerivado?: number | null;
  causa?: string | null;
  stack?: string | null;
} {
  if (erroBruto === undefined || erroBruto === null) {
    return { presente: false };
  }

  const erro = erroBruto as Error & {
    output?: { statusCode?: number };
    data?: unknown;
    cause?: unknown;
  };

  const nome = erro?.constructor?.name ?? (erro instanceof Error ? 'Error' : typeof erro);
  const mensagem = erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : undefined;
  const outputStatusCode = typeof erro?.output?.statusCode === 'number' ? erro.output.statusCode : null;
  const dataStatusCode =
    erro?.data && typeof erro.data === 'object' && 'statusCode' in (erro.data as object)
      ? ((erro.data as { statusCode?: unknown }).statusCode as number | undefined) ?? null
      : null;
  // So chama a heuristica do Baileys quando ha um Error de verdade (e o tipo
  // que a propria funcao exige) — sem isso o fallback fica nulo, nao 500 por
  // acidente.
  const statusCodeDerivado =
    outputStatusCode ?? (erro instanceof Error ? getCodeFromWSError(erro) : null);

  return {
    presente: true,
    nome,
    mensagem,
    outputStatusCode,
    dataStatusCode,
    statusCodeDerivado,
    causa: erro?.cause !== undefined ? String(erro.cause) : null,
    stack: stackSeguro(erro),
  };
}

/**
 * Jid completo de quem ja mandou mensagem nesta sessao, por numero em digitos.
 *
 * O WhatsApp passou a endereçar parte dos contatos por "LID" (`@lid`, opaco,
 * por privacidade) em vez do numero de telefone (`@s.whatsapp.net`). Sem isto,
 * responder um desses contatos reconstruiria "<digitos>@s.whatsapp.net" — um
 * endereco que nao existe: o envio nao da erro nenhum (o WhatsApp aceita
 * qualquer jid bem formado), mas a mensagem nunca chega a lugar nenhum.
 */
const jidOriginal = new Map<string, string>();

/** Chamado ao receber uma mensagem, para a resposta poder usar o MESMO jid. */
export function lembrarJid(numero: string, jidCompleto: string) {
  jidOriginal.set(numero, jidCompleto);
}

/** O jid de destino: o original lembrado, ou o formato padrao de telefone. */
export function jid(numero: string) {
  return jidOriginal.get(numero) ?? numero + '@s.whatsapp.net';
}

/** So os digitos de um jid, sem sufixo nem id de aparelho. */
export function numeroDoJid(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const antesDaArroba = valor.split('@')[0] ?? '';
  const digitos = (antesDaArroba.split(':')[0] ?? '').replace(/\D/g, '');
  return digitos.length >= 10 ? digitos : null;
}

/** So os campos do `Contact` do Baileys que a importacao usa. */
export type ContatoBaileys = { id: string; name?: string; notify?: string };

/**
 * Decide se um contato bruto do Baileys entra na importacao, e com qual nome.
 *
 * So contato com numero de telefone de verdade (`@s.whatsapp.net`) entra: um
 * `@lid` e um endereco opaco de privacidade, sem numero por tras — mesma
 * limitacao ja documentada em `numeroDoJid` (ver `lembrarJid`/`jid` acima).
 * Nome preferido e o que o vendedor salvou no celular; na falta dele, o que a
 * propria pessoa definiu no WhatsApp; na falta dos dois, o proprio numero.
 */
export function contatoValido(c: ContatoBaileys): { numero: string; nome: string } | null {
  if (!c.id.endsWith('@s.whatsapp.net')) return null;

  const numero = numeroDoJid(c.id);
  if (!numero) return null;

  return { numero, nome: c.name ?? c.notify ?? numero };
}

/** So os campos de `Chat` do Baileys que a sincronizacao de previa usa. */
export type ChatBaileysBruto = {
  id: string;
  name?: string | null;
  unreadCount?: number | null;
};

/**
 * Decide se um chat bruto do Baileys entra no espelho de previa, e com que
 * nome/contador. Mesma regra de `contatoValido`: so numero de telefone de
 * verdade entra -- grupo (`@g.us`), broadcast e `@lid` ficam de fora.
 */
export function chatValido(c: ChatBaileysBruto): { numero: string; nome: string; naoLidas: number } | null {
  if (!c.id.endsWith('@s.whatsapp.net')) return null;

  const numero = numeroDoJid(c.id);
  if (!numero) return null;

  return { numero, nome: c.name ?? numero, naoLidas: c.unreadCount ?? 0 };
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

/**
 * Quem recebe os contatos importados do celular. Mesma tecnica de `aoReceber`
 * e `aoMudarStatus`: hook injetavel, para nao acoplar a sessao a plataforma e
 * dar para testar sem rede.
 */
let aoReceberContatos: ((sessao: Sessao, contatos: { numero: string; nome: string }[]) => void) | null = null;

export function quandoReceberContatos(
  handler: (sessao: Sessao, contatos: { numero: string; nome: string }[]) => void,
) {
  aoReceberContatos = handler;
}

export type ChatBruto = {
  numero: string;
  nome: string;
  naoLidas: number;
  ultimaMensagemEm: number;
  mensagens: { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: number }[];
};

/**
 * Quem recebe o espelho de chats sincronizado do celular. Mesma tecnica de
 * `aoReceberContatos`: hook injetavel, para a sessao nao conhecer a
 * plataforma.
 */
let aoReceberChats: ((sessao: Sessao, chats: ChatBruto[]) => void) | null = null;

export function quandoReceberChats(handler: (sessao: Sessao, chats: ChatBruto[]) => void) {
  aoReceberChats = handler;
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
  let origemVersao: 'latest' | 'fallback' = 'latest';
  try {
    versao = (await fetchLatestBaileysVersion()).version;
  } catch (err) {
    origemVersao = 'fallback';
    console.warn('[ponte] nao consegui descobrir a versao do WhatsApp Web; uso a embutida:', err);
  }
  // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao)
  console.log(
    `[ponte] whatsapp-web-version sessao="${sessao.nome}" version="${versao ? versao.join('.') : 'embutida-do-baileys'}" source="${origemVersao}"`,
  );

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

  // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao)
  console.log(`[ponte] socket.criado sessao="${sessao.nome}" timestamp="${new Date().toISOString()}"`);

  sock.ev.on('creds.update', () => {
    // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): confirma
    // se o celular chegou a entregar credenciais para ESTE socket, sem
    // logar nenhum conteudo delas.
    console.log(`[ponte] creds.update sessao="${sessao.nome}" timestamp="${new Date().toISOString()}"`);
    return saveCreds();
  });

  sock.ev.on('connection.update', (u) => {
    // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): todo
    // disparo do evento, mesmo quando `u.connection` e undefined (Baileys
    // tambem emite atualizacoes parciais so com `qr` ou so com `receivedPendingNotifications`).
    console.log(
      `[ponte] connection.update sessao="${sessao.nome}" connection="${u.connection ?? 'undefined'}" timestamp="${new Date().toISOString()}"`,
    );

    if (u.qr) {
      sessao.situacao = 'QRCODE';
      sessao.detalhe = 'aguardando leitura do QR Code';
      // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): conta
      // quantas vezes o QR foi (re)emitido e se mudou de uma vez para outra
      // — sem nunca logar o QR em si (ele carrega o segredo de pareamento).
      console.log(
        `[ponte] qr.emitido sessao="${sessao.nome}" timestamp="${new Date().toISOString()}" qrId="${hashCurto(u.qr)}"`,
      );
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

      // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): antes
      // desta linha, um close nao-loggedOut nao deixava rastro nenhum no log
      // local da Ponte (so via aviso HTTP para a API, que pode falhar em
      // silencio). Isto cobre TODO close, qualquer que seja o motivo.
      //
      // `diagnostico` usa `u.lastDisconnect?.error` BRUTO (nao o `erro`
      // acima, que ja foi estreitado para `{ output }`) — e o que permite
      // investigar o caso real de "vendedor-a06db3d6"
      // (`statusCode="sem codigo" motivo="desconhecido"`), em que
      // `.output.statusCode` veio vazio e nao havia mais nenhuma pista no log
      // sobre o que de fato aconteceu com o socket.
      console.log(
        `[ponte] connection.close sessao="${sessao.nome}" statusCode="${motivo ?? 'sem codigo'}" loggedOut=${deslogado} timestamp="${new Date().toISOString()}" diagnostico=${JSON.stringify(descreverErroDeDesconexao(u.lastDisconnect?.error))}`,
      );

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
        agendarReconexao(sessao, 2_000, () => limparCredenciais(sessao.nome));
        return;
      }

      agendarReconexao(sessao, 3_000);
    }
  });

  sock.ev.on('messages.upsert', (evento) => {
    // `notify` e mensagem nova. Os outros tipos sao carga de historico, e
    // reentregariam conversas antigas como se tivessem acabado de chegar.
    if (evento.type !== 'notify') return;
    for (const msg of evento.messages) aoReceber?.(sessao, msg);
  });

  sock.ev.on('contacts.upsert', (lista) => {
    // O Baileys dispara este evento varias vezes em pedacos (agenda inteira ao
    // conectar, depois atualizacoes incrementais) — filtra e transforma aqui
    // ANTES do hook, para quem recebe so lidar com contato ja valido.
    const validos = lista.map(contatoValido).filter((c): c is { numero: string; nome: string } => c !== null);
    if (validos.length) aoReceberContatos?.(sessao, validos);
  });

  /*
   * Carga historica completa -- dispara uma vez por conexao nova (ou quando o
   * historico do celular mudou desde a ultima vez). `messages` vem achatado
   * (todas as mensagens de todos os chats juntas), entao agrupa por
   * remetente antes de montar o lote por chat.
   */
  sock.ev.on('messaging-history.set', ({ chats, messages }) => {
    const porNumero = new Map<string, { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: number }[]>();
    for (const msg of messages) {
      const remetente = msg.key?.remoteJid ?? '';
      if (remetente.endsWith('@g.us') || remetente === 'status@broadcast' || remetente.endsWith('@broadcast')) continue;
      const numero = numeroDoJid(remetente);
      if (!numero) continue;

      const extraido = extrair(msg);
      if (!extraido || !extraido.texto) continue;

      const lista = porNumero.get(numero) ?? [];
      lista.push({
        autor: msg.key?.fromMe ? 'AGENTE' : 'CLIENTE',
        texto: extraido.texto,
        criadoEm: Number(msg.messageTimestamp ?? 0) * 1000,
      });
      porNumero.set(numero, lista);
    }

    const validos: ChatBruto[] = [];
    for (const chat of chats) {
      const info = chatValido(chat as ChatBaileysBruto);
      if (!info) continue;
      const mensagens = (porNumero.get(info.numero) ?? []).sort((a, b) => a.criadoEm - b.criadoEm);
      const ultima = mensagens[mensagens.length - 1];
      if (!ultima) continue; // chat sem nenhuma mensagem de texto reconhecida: nao ha previa util a mostrar
      validos.push({ ...info, ultimaMensagemEm: ultima.criadoEm, mensagens });
    }
    if (validos.length) aoReceberChats?.(sessao, validos);
  });

  /** Atualizacao incremental depois da carga inicial: nova mensagem, contador de nao lidas mudou. */
  sock.ev.on('chats.upsert', (lista) => {
    const validos = lista
      .map((c) => chatValido(c as ChatBaileysBruto))
      .filter((c): c is { numero: string; nome: string; naoLidas: number } => c !== null)
      .map((info) => ({ ...info, ultimaMensagemEm: Date.now(), mensagens: [] as ChatBruto['mensagens'] }));
    if (validos.length) aoReceberChats?.(sessao, validos);
  });
}

function aguardar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms).unref();
  });
}

/**
 * Agenda a reconexao automatica apos uma queda: espera `espera` ms (o backoff
 * do WhatsApp), e SO ENTAO deixa `garantirNoAr` tentar de novo.
 *
 * `sessao.reconectando` fica preenchido do inicio ao fim dessa espera — e o
 * que impede `garantirNoAr` de abrir um socket por conta propria quando o
 * polling HTTP (`GET /qr/:sessao`, `GET /estado/:sessao`) cai bem nesse
 * intervalo (ver o comentario em `garantirNoAr`). E zerado ANTES de chamar
 * `garantirNoAr` de novo, e nao depois: essa proxima chamada e a propria
 * tentativa, protegida por `iniciando`, e esperar por `reconectando` ali
 * seria esperar por si mesma.
 *
 * `antes`, quando informado, roda ANTES do backoff (ex.: apagar credenciais
 * invalidadas no caso de logout) — e o erro dele tambem so libera
 * `reconectando` no fim, para nao deixar a sessao presa nesta guarda para
 * sempre se `antes` falhar.
 */
function agendarReconexao(sessao: Sessao, espera: number, antes?: () => Promise<void>): void {
  const tentativa = (async () => {
    try {
      if (antes) await antes();
      await aguardar(espera);
    } finally {
      sessao.reconectando = null;
    }
    await garantirNoAr(sessao.nome);
  })().catch((err) => {
    console.error('[ponte] falhei ao reconectar "' + sessao.nome + '":', err);
  });

  sessao.reconectando = tentativa;
}

/** Devolve a sessao, subindo o socket se ainda nao houver um. */
export async function garantirNoAr(nome: string): Promise<Sessao> {
  if (!nomeValido(nome)) throw new Error('Nome de sessao invalido: "' + nome + '"');

  let sessao = sessoes.get(nome);
  if (!sessao) {
    // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): so
    // dispara na PRIMEIRA vez que este nome de sessao aparece neste
    // processo — confirma se o processo perdeu o estado em memoria
    // (restart) no meio de um teste, ja que `sessoes` e um Map em RAM.
    console.log(`[ponte] sessao.criada sessao="${nome}" timestamp="${new Date().toISOString()}"`);
    sessao = {
      nome,
      sock: null,
      situacao: 'CONECTANDO',
      detalhe: null,
      qr: null,
      numero: null,
      iniciando: null,
      reconectando: null,
    };
    sessoes.set(nome, sessao);
  }

  if (sessao.sock) return sessao;

  /*
   * Duas requisicoes simultaneas nao podem abrir dois sockets para o mesmo
   * numero: o segundo derruba o primeiro, e a sessao fica piscando entre
   * conectado e caido sem nunca estabilizar.
   */
  if (sessao.iniciando) {
    await sessao.iniciando;
    return sessao;
  }

  /*
   * Uma reconexao automatica ja esta agendada (aguardando o backoff do
   * WhatsApp) ou ja rodando — nao abre socket nenhum por conta propria, so
   * espera essa reconexao. Sem isto, o polling HTTP (QR/estado, a cada 5s)
   * reiniciava a sessao ANTES do backoff terminar, fazendo dois sockets
   * disputarem a mesma sessao e o WhatsApp fechar os dois de novo — o ciclo
   * que nunca deixava "vendedor-05f89eae" estabilizar em CONECTADO.
   */
  if (sessao.reconectando) {
    await sessao.reconectando;
    return sessao;
  }

  const alvo = sessao;
  alvo.situacao = 'CONECTANDO';
  alvo.iniciando = conectar(alvo).catch((err) => {
    alvo.iniciando = null;
    alvo.situacao = 'DESCONECTADO';
    alvo.detalhe = err instanceof Error ? err.message : 'falha ao iniciar a sessao';
    throw err;
  });

  await alvo.iniciando;
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
