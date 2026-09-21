import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type Channel } from '@prisma/client';
import { prisma, prismaSemIsolamento } from '../../lib/prisma';
import { semOrganizacao } from '../../lib/tenant';
import { badRequest, conflict, notFound, serviceUnavailable } from '../../lib/errors';
import { cifrar, decifrar } from '../../lib/crypto-box';
import { modoEfetivo } from './whatsapp.modo';
import { obterConfigGlobalPonte } from '../../config/ponte.config';

export const CANAIS_EXTERNOS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'] as const;
export type CanalExterno = (typeof CANAIS_EXTERNOS)[number];

/** Mascara segredos: a API nunca devolve token nem app secret em claro. */
const mascarar = (valor: string | null) =>
  valor ? `${valor.slice(0, 4)}${'*'.repeat(Math.max(4, valor.length - 8))}${valor.slice(-4)}` : null;

/**
 * Campos cifrados em repouso. `verifyToken` entra na lista porque quem o tem
 * consegue passar pela verificacao do webhook e assinar o canal em outro lugar;
 * `iaSegredo` porque com ele se forja uma entrega para o motor de IA.
 */
const SEGREDOS = [
  'accessToken',
  'appSecret',
  'verifyToken',
  'iaSegredo',
  // Credenciais da ponte nao oficial. `ponteToken` autentica a plataforma NA
  // ponte (quem o tem manda mensagem pelo numero da empresa) e `ponteSegredo`
  // assina o que a ponte manda para ca (quem o tem injeta mensagem na conversa
  // de um cliente). Os dois valem exatamente o que vale o accessToken da Meta.
  'ponteToken',
  'ponteSegredo',
] as const;

/**
 * O que `salvarCanal` cifra. `iaSegredo` fica de fora porque nao entra por esta
 * rota — ele e gravado por `salvarIa`, que cifra por conta propria. Duas listas
 * em vez de uma para o tipo de entrada nao ter de aceitar um campo que a rota
 * de canal nao recebe.
 */
const SEGREDOS_DO_CANAL = ['accessToken', 'appSecret', 'verifyToken', 'ponteToken', 'ponteSegredo'] as const;

type ComSegredos = {
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  iaSegredo: string | null;
  ponteToken: string | null;
  ponteSegredo: string | null;
};

/** Decifra os segredos de um registro lido do banco. */
function aberto<T extends ComSegredos>(config: T): T {
  const copia = { ...config };
  for (const campo of SEGREDOS) {
    const valor = copia[campo];
    if (valor) copia[campo] = decifrar(valor) as T[typeof campo];
  }
  return copia;
}

export async function listarCanais() {
  const canais = await prisma.channelConfig.findMany({
    include: { fila: { select: { id: true, nome: true } }, dono: { select: { id: true, nome: true } } },
    // Numero sem dono (a linha compartilhada / historica) primeiro, depois as
    // linhas pessoais por nome — e o `id` so para desempate estavel.
    orderBy: [{ canal: 'asc' }, { donoId: 'asc' }, { id: 'asc' }],
  });

  return canais.map(aberto).map((c) => ({
    id: c.id,
    canal: c.canal,
    ativo: c.ativo,
    /// Rotulo da linha. Cai no numero em si quando ninguem deu nome — a tela
    /// nao pode mostrar "null" onde so ha um numero, o caso mais comum hoje.
    nome: c.nome ?? c.phoneNumberId ?? c.pageId ?? null,
    dono: c.dono,
    phoneNumberId: c.phoneNumberId,
    wabaId: c.wabaId,
    pageId: c.pageId,
    igUserId: c.igUserId,
    fila: c.fila,
    atualizadoEm: c.atualizadoEm,
    accessTokenMascarado: mascarar(c.accessToken),
    appSecretMascarado: mascarar(c.appSecret),
    /*
     * Modo do WhatsApp e o que a ponte tem configurado (item do WhatsApp nos
     * dois modos).
     *
     * `modo` sai nulo nos outros canais, e a tela trata nulo do WhatsApp como
     * OFICIAL — o canal que ja existia foi configurado antes de a pergunta
     * existir, e reescrever isso seria afirmar uma escolha que ninguem fez.
     */
    modo: c.modo,
    ponteUrl: c.ponteUrl,
    ponteSessao: c.ponteSessao,
    ponteTokenMascarado: mascarar(c.ponteToken),
    ponteSegredoMascarado: mascarar(c.ponteSegredo),
    /// Ultimo status que a ponte avisou para esta linha (ver ponte.routes.ts:/status).
    /// Nulo fora do modo nao oficial ou antes do primeiro aviso — a tela so
    /// mostra o badge quando ha algo para mostrar.
    ponteStatus: c.ponteStatus,
    ponteStatusEm: c.ponteStatusEm,
    /*
     * Pronto para operar, por modo.
     *
     * O oficial precisa das credenciais da Meta; o nao oficial, do endereco e do
     * token da ponte MAIS o segredo de assinatura — sem o segredo a rota de
     * entrada recusa, entao um canal sem ele nao esta configurado, mesmo
     * conseguindo enviar.
     */
    configurado:
      c.canal === 'WHATSAPP' && c.modo === 'NAO_OFICIAL'
        ? Boolean(c.ponteUrl && c.ponteToken && c.ponteSegredo)
        : Boolean(c.accessToken && c.appSecret && c.verifyToken),
  }));
}

type SalvarCanalInput = {
  ativo?: boolean;
  modo?: 'OFICIAL' | 'NAO_OFICIAL' | null;
  ponteUrl?: string | null;
  ponteToken?: string | null;
  ponteSegredo?: string | null;
  ponteSessao?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  pageId?: string | null;
  igUserId?: string | null;
  accessToken?: string | null;
  appSecret?: string | null;
  verifyToken?: string | null;
  filaId?: string | null;
};

/** Campos aceitos so nas linhas pessoais — a de sempre nao tem dono nem rotulo. */
type SalvarNumeroInput = SalvarCanalInput & { nome?: string | null; donoId?: string | null };

type CredenciaisPonte = { ponteUrl: string | null; ponteToken: string | null; ponteSegredo: string | null };

/**
 * Pra cada campo da ponte, usa o que veio no input; sem isso, cai para o da
 * config compartilhada. Existe para a linha pessoal de um vendedor nao
 * precisar repetir endereco/token/segredo que ja estao na linha compartilhada
 * do mesmo canal — o admin so digita de novo quando quer uma ponte diferente.
 */
export function herdarCredenciaisDaPonte(
  input: CredenciaisPonte,
  compartilhada: CredenciaisPonte | null,
): CredenciaisPonte {
  const campo = (valor: string | null, herdado: string | null) => (valor && valor.length > 0 ? valor : herdado ?? null);
  return {
    ponteUrl: campo(input.ponteUrl, compartilhada?.ponteUrl ?? null),
    ponteToken: campo(input.ponteToken, compartilhada?.ponteToken ?? null),
    ponteSegredo: campo(input.ponteSegredo, compartilhada?.ponteSegredo ?? null),
  };
}

/**
 * Nome de sessao automatico para linha pessoal quando o admin nao informou
 * um. Determinístico (mesmo donoId sempre gera o mesmo nome) para nao gerar
 * duas sessoes diferentes para o mesmo vendedor em duas edicoes.
 */
export function gerarNomeSessao(donoId: string): string {
  return `vendedor-${donoId.slice(0, 8)}`;
}

/**
 * Valida o que `salvarCanal`/`criarNumero`/`atualizarNumero` tem em comum:
 * fila existe, dono existe (e e da mesma organizacao — `findUnique` de outra
 * empresa nao acha nada, a extensao do Prisma cuida disso), credencial bate com
 * o modo, e cifra o que for segredo. Devolve o que vai para o banco.
 */
async function prepararGravacao(
  canal: CanalExterno,
  atual: SalvarCanalInput | null,
  input: SalvarNumeroInput,
  idAtual?: string,
) {
  if (input.filaId) {
    const fila = await prisma.queue.findUnique({ where: { id: input.filaId } });
    if (!fila) throw notFound('Fila nao encontrada');
  }
  if (input.donoId) {
    const dono = await prisma.user.findUnique({ where: { id: input.donoId } });
    if (!dono) throw notFound('Usuario nao encontrado');
  }

  const futuro = { ...atual, ...input };

  /*
   * Linha pessoal de WhatsApp em modo ponte: herda da config compartilhada o
   * que o admin nao preencheu, e gera o nome de sessao quando faltar — sem
   * isso o admin teria de redigitar a mesma ponte em toda linha pessoal nova.
   * Precisa acontecer ANTES da checagem de conflito de sessao logo abaixo,
   * senao o nome gerado aqui nunca seria validado contra colisao.
   */
  if (canal === 'WHATSAPP' && futuro.modo === 'NAO_OFICIAL' && futuro.donoId) {
    const compartilhadaRegistro = await prisma.channelConfig.findFirst({ where: { canal, donoId: null } });
    const compartilhada = compartilhadaRegistro ? aberto(compartilhadaRegistro) : null;
    const herdadoDaCompartilhada = herdarCredenciaisDaPonte(
      {
        ponteUrl: futuro.ponteUrl ?? null,
        ponteToken: futuro.ponteToken ?? null,
        ponteSegredo: futuro.ponteSegredo ?? null,
      },
      compartilhada
        ? { ponteUrl: compartilhada.ponteUrl, ponteToken: compartilhada.ponteToken, ponteSegredo: compartilhada.ponteSegredo }
        : null,
    );
    // Terceiro nivel: o que nem a linha nem a compartilhada preencheram cai
    // para a config global (infraestrutura da propria API) — e o que deixa a
    // linha pessoal nascer sem nenhuma ChannelConfig compartilhada previa.
    const configGlobal = obterConfigGlobalPonte();
    const herdado = herdarCredenciaisDaPonte(herdadoDaCompartilhada, configGlobal);
    futuro.ponteUrl = herdado.ponteUrl;
    futuro.ponteToken = herdado.ponteToken;
    futuro.ponteSegredo = herdado.ponteSegredo;
    input.ponteUrl = herdado.ponteUrl;
    input.ponteToken = herdado.ponteToken;
    input.ponteSegredo = herdado.ponteSegredo;

    if (!futuro.ponteSessao) {
      const nomeGerado = gerarNomeSessao(futuro.donoId);
      futuro.ponteSessao = nomeGerado;
      input.ponteSessao = nomeGerado;
    }
  }

  /*
   * Duas linhas do mesmo canal com a mesma sessao fariam `configDoDestino`
   * escolher uma arbitrariamente por `findFirst` — a mesma classe de bug ja
   * corrigida noutro ponto deste modulo, so que aqui trancaria o vendedor
   * perdedor fora da propria linha para sempre, sem aviso nenhum.
   */
  if (futuro.ponteSessao) {
    const conflito = await prisma.channelConfig.findFirst({
      where: { canal, ponteSessao: futuro.ponteSessao, ...(idAtual ? { id: { not: idAtual } } : {}) },
      select: { id: true },
    });
    if (conflito) {
      throw badRequest(`Ja existe uma linha com a sessao "${futuro.ponteSessao}" nesta organizacao`);
    }
  }

  /*
   * O que "ativar" exige depende do MODO (item do WhatsApp nos dois modos).
   *
   * Cobrar as credenciais da Meta de quem esta no modo nao oficial faria a tela
   * pedir um token que aquela operacao nunca vai ter — e foi por isso que a
   * mensagem de erro deixou de ser uma frase so.
   */
  if (canal === 'WHATSAPP' && futuro.modo === 'NAO_OFICIAL') {
    if (futuro.ativo && !(futuro.ponteUrl && futuro.ponteToken)) {
      throw badRequest('Para ativar o modo nao oficial informe o endereco e o token da ponte');
    }
    if (futuro.ativo && !futuro.ponteSegredo) {
      // Sem segredo a rota de entrada recusa tudo: ativar assim daria um canal
      // que envia e nunca recebe, e o sintoma ("o cliente respondeu e nao
      // apareceu") e dificil de ligar a esta causa.
      throw badRequest('Informe o segredo da ponte: sem ele a plataforma nao aceita mensagem recebida');
    }
    if (futuro.ativo && futuro.donoId && !futuro.ponteSessao) {
      // Sem nome de sessao uma linha PESSOAL endereca a mesma sessao padrao da
      // ponte que a linha compartilhada usa — o vendedor pareia o proprio
      // celular no numero da empresa, ve/derruba o QR e o estado dela.
      throw badRequest(
        'Informe o nome da sessao desta linha: sem ele ela seria confundida com a linha compartilhada',
      );
    }
  } else if (futuro.ativo && !(futuro.accessToken && futuro.appSecret && futuro.verifyToken)) {
    throw badRequest('Para ativar o canal informe accessToken, appSecret e verifyToken');
  }

  if (input.modo !== undefined && input.modo !== null && canal !== 'WHATSAPP') {
    // O CHECK do banco tambem barra, mas a mensagem dele nao ajuda ninguem.
    throw badRequest('Modo oficial/nao oficial existe so no WhatsApp');
  }

  // Cifra so o que veio nesta requisicao; campo ausente nao e reescrito, e
  // campo enviado como null continua sendo limpeza explicita.
  const paraGravar = { ...input };
  for (const campo of SEGREDOS_DO_CANAL) {
    const valor = paraGravar[campo];
    if (valor) paraGravar[campo] = cifrar(valor);
  }
  return paraGravar;
}

/**
 * A checagem previa de `prepararGravacao` roda dentro da organizacao atual
 * (a extensao do Prisma escopa o `findFirst`), entao ela nunca enxerga uma
 * sessao ja usada por OUTRA organizacao — so a constraint `@@unique([canal,
 * ponteSessao])` (Fase 12.1) pega esse caso, e tambem fecha a corrida entre
 * a checagem e a escrita (duas requisicoes concorrentes podem passar as duas
 * pelo `findFirst` antes de qualquer commit).
 *
 * Traduz a violacao dessa constraint especifica num erro de dominio (409,
 * a mesma classe de "ja existe" que a checagem previa usa) em vez de deixar
 * subir como erro do Prisma nao tratado (500 generico). Nunca apaga nem
 * altera a linha que ja tinha a sessao — so recusa a escrita nova.
 */
async function comColisaoDeSessaoTratada<T>(sessao: string | null | undefined, escrever: () => Promise<T>): Promise<T> {
  try {
    return await escrever();
  } catch (erro) {
    const alvo = erro instanceof Prisma.PrismaClientKnownRequestError ? erro.meta?.target : undefined;
    // O formato de `meta.target` varia (nome da constraint como string, ou
    // array de colunas/campos) conforme driver/versao do Prisma — checa as
    // variantes plausiveis em vez de assumir uma so.
    const textoDoAlvo = typeof alvo === 'string' ? alvo : Array.isArray(alvo) ? alvo.join(',') : '';
    const colidiuNaSessao =
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === 'P2002' &&
      (textoDoAlvo.includes('ponte_sessao') || textoDoAlvo.includes('ponteSessao'));
    if (colidiuNaSessao) {
      throw conflict(
        `Ja existe uma linha usando a sessao "${sessao}" — pode ser de outra organizacao. Escolha outro nome de sessao.`,
      );
    }
    throw erro;
  }
}

/**
 * Numero compartilhado do canal — o que existia antes de linha pessoal ser
 * possivel, e continua sendo: `donoId` nulo, um so por organizacao.
 *
 * Upsert por `findFirst` e nao por chave unica: a chave que permitia upsert
 * (`organizacaoId, canal`) foi embora quando o canal passou a admitir mais de
 * um numero — ver a migration `canal_numeros_por_dono`.
 */
export async function salvarCanal(canal: CanalExterno, input: SalvarCanalInput) {
  const gravado = await prisma.channelConfig.findFirst({ where: { canal, donoId: null } });
  const atual = gravado ? aberto(gravado) : null;
  const paraGravar = await prepararGravacao(canal, atual, input);

  await comColisaoDeSessaoTratada(paraGravar.ponteSessao, () =>
    gravado
      ? prisma.channelConfig.update({ where: { id: gravado.id }, data: paraGravar })
      : prisma.channelConfig.create({ data: { canal, ...paraGravar } }),
  );

  const canais = await listarCanais();
  return canais.find((c) => c.canal === canal && !c.dono)!;
}

/**
 * Linha pessoal: numero proprio de um usuario (ex.: vendedor com WhatsApp
 * dedicado). Mensagem recebida aqui vai direto para o dono — ver
 * `configDoDestino` em inbound.service.
 */
export async function criarNumero(canal: CanalExterno, input: SalvarNumeroInput) {
  const paraGravar = await prepararGravacao(canal, null, input);
  await comColisaoDeSessaoTratada(paraGravar.ponteSessao, () =>
    prisma.channelConfig.create({ data: { canal, ...paraGravar } }),
  );

  const canais = await listarCanais();
  const criado = canais.find((c) => c.canal === canal && c.dono?.id === input.donoId);
  if (!criado) throw notFound('Numero nao encontrado apos criacao');
  return criado;
}

async function carregarNumeroOuFalhar(id: string) {
  const registro = await prisma.channelConfig.findUnique({ where: { id } });
  if (!registro) throw notFound('Numero nao encontrado');
  return registro;
}

export async function atualizarNumero(id: string, input: SalvarNumeroInput) {
  const gravado = await carregarNumeroOuFalhar(id);
  const paraGravar = await prepararGravacao(gravado.canal as CanalExterno, aberto(gravado), input, gravado.id);
  await comColisaoDeSessaoTratada(paraGravar.ponteSessao, () =>
    prisma.channelConfig.update({ where: { id }, data: paraGravar }),
  );

  const canais = await listarCanais();
  return canais.find((c) => c.id === id)!;
}

/** Conversas que apontavam para este numero perdem so a referencia (SetNull). */
export async function excluirNumero(id: string) {
  await carregarNumeroOuFalhar(id);
  await prisma.channelConfig.delete({ where: { id } });
}

/** Sempre devolve os segredos em claro — o resto do sistema nao sabe da cifra. */
export async function obterConfig(canal: Channel) {
  // Prefere a linha sem dono (a compartilhada, historica); sem ela, cai na
  // primeira do canal — installs com so linha pessoal ainda tem de onde tirar
  // verifyToken para o GET de verificacao do webhook.
  const config =
    (await prisma.channelConfig.findFirst({ where: { canal, donoId: null } })) ??
    (await prisma.channelConfig.findFirst({ where: { canal }, orderBy: { atualizadoEm: 'asc' } }));
  return config ? aberto(config) : null;
}

/** Config de uma linha especifica, por id. Usado para responder pelo MESMO numero que recebeu. */
export async function obterConfigPorId(id: string) {
  const config = await prisma.channelConfig.findUnique({ where: { id } });
  return config ? aberto(config) : null;
}

/**
 * A propria linha pessoal de WhatsApp do usuario logado — usada pela tela de
 * Atendimento para oferecer "Conectar WhatsApp" sem passar por Configuracoes.
 * Devolve so o essencial para chamar as rotas de ponte por id; nunca segredo.
 */
export async function minhaLinhaWhatsapp(usuarioId: string) {
  const config = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', donoId: usuarioId } });
  // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao): confirma que
  // donoId->canalConfigId->ponteSessao e resolvido dinamicamente a partir do
  // usuario autenticado, nunca de um valor fixo. Nao loga segredo nenhum.
  console.log(
    `[crm] minhaLinhaWhatsapp donoId=${usuarioId} canalConfigId=${config?.id ?? 'nenhum'} ponteSessao=${config?.ponteSessao ?? 'nenhum'}`,
  );
  if (!config) return null;
  return { id: config.id, ponteSessao: config.ponteSessao, modo: config.modo, ativo: config.ativo };
}

/**
 * Infraestrutura da ponte disponivel para a organizacao atual, sem exigir
 * nenhuma acao administrativa previa: a config global (`PONTE_URL`/
 * `PONTE_TOKEN`/`PONTE_SEGREDO`, infraestrutura da propria API) resolve
 * sozinha o caso comum. A linha compartilhada legada e olhada so como
 * fallback, para instalacoes antigas que configuraram a ponte por ali antes
 * desta config global existir continuarem funcionando sem mudar nada.
 */
async function infraDaPonteDisponivel(): Promise<boolean> {
  if (obterConfigGlobalPonte()) return true;

  const compartilhada = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', donoId: null } });
  // So verifica presenca (nao decifra) — string cifrada nao-vazia ja basta
  // para saber que o campo foi preenchido, e decifrar aqui seria trabalho a
  // mais so para jogar fora o valor.
  return Boolean(
    compartilhada &&
      modoEfetivo(compartilhada.modo) === 'NAO_OFICIAL' &&
      compartilhada.ponteUrl &&
      compartilhada.ponteToken &&
      compartilhada.ponteSegredo,
  );
}

/**
 * Self-service: cria a linha pessoal de WhatsApp do usuario logado na hora em
 * que ele pede para conectar — sem exigir que um ADMIN cadastre nenhuma linha
 * compartilhada antes pela tela de Canais. Reconexao (linha ja existente)
 * devolve a mesma linha em vez de criar outra, para nao violar
 * `@@unique([canal, ponteSessao])`.
 *
 * A criacao em si passa por `criarNumero`, que ja faz tudo que uma linha
 * pessoal de WhatsApp precisa sem o usuario informar nada: resolve
 * endereco/token/segredo (linha pessoal > linha compartilhada legada > config
 * global da ponte, ver `herdarCredenciaisDaPonte`/`obterConfigGlobalPonte`) e
 * gera o nome de sessao (`gerarNomeSessao`). O unico caso que este
 * self-service recusa antes de chamar `criarNumero` e quando a PONTE em si
 * nao esta configurada em lugar nenhum (`infraDaPonteDisponivel`) — nesse
 * caso a mensagem fala de indisponibilidade de infraestrutura (503), nunca
 * pede para o vendedor procurar um administrador: a Ponte e infraestrutura da
 * aplicacao, nao configuracao de negocio que um admin preenche por linha.
 *
 * Duas chamadas concorrentes deste self-service para o MESMO usuario (dois
 * cliques, duas abas) podem ambas ver `existente` nulo e ambas chegar em
 * `criarNumero` — como o nome de sessao e deterministico
 * (`gerarNomeSessao(usuarioId)` dentro de `prepararGravacao`), as duas miram
 * a mesma `ponteSessao`, e a constraint `@@unique([canal, ponteSessao])` (via
 * `comColisaoDeSessaoTratada`) recusa a segunda escrita com 409. Esse 409 tem
 * a mensagem pensada para o ADMIN da tela de Canais escolhendo outro nome de
 * sessao — nao faz sentido aqui, onde o usuario so clicou duas vezes e nao
 * tem campo nenhum de sessao para mudar. Por isso o catch abaixo: se a linha
 * ja existe apos o erro (a vencedora da corrida a criou), devolve ela em vez
 * do erro tecnico; so nao existindo (motivo diferente de auto-colisao) e que
 * o erro original sobe.
 */
export async function conectarMinhaLinhaWhatsapp(usuarioId: string) {
  // TEMP-DEBUG (auditoria WhatsApp — remover apos investigacao)
  console.log(`[crm] conectarMinhaLinhaWhatsapp usuario autenticado donoId=${usuarioId}`);
  const existente = await minhaLinhaWhatsapp(usuarioId);
  if (existente) return existente;

  if (!(await infraDaPonteDisponivel())) {
    throw serviceUnavailable(
      'A conexao com o WhatsApp esta temporariamente indisponivel. Tente novamente em alguns minutos.',
    );
  }

  try {
    await criarNumero('WHATSAPP', { donoId: usuarioId, modo: 'NAO_OFICIAL', ativo: true });
  } catch (erro) {
    const jaExiste = await minhaLinhaWhatsapp(usuarioId);
    if (jaExiste) return jaExiste;
    throw erro;
  }

  const criada = await minhaLinhaWhatsapp(usuarioId);
  if (!criada) throw notFound('Linha pessoal nao encontrada logo apos a criacao');
  return criada;
}

/**
 * Config que deveria atender esta mensagem: a linha cujo identificador exterior
 * bate, ou — sem identificador, ou sem bater nenhuma — a mesma regra de
 * `obterConfig` (compartilhada, senao a primeira do canal).
 *
 * Existe separado de `organizacaoDoWebhook` porque aquela funcao roda SEM
 * organizacao (e o que ela descobre) e so precisa do id da empresa; esta roda
 * DENTRO do contexto ja aberto e precisa da config inteira — fila, dono,
 * segredos — para decidir o destino da conversa e validar a assinatura.
 */
export async function configDoDestino(canal: Channel, identificador: string | null) {
  if (identificador) {
    const porId = await prisma.channelConfig.findFirst({
      where: {
        canal,
        OR: [
          { phoneNumberId: identificador },
          { pageId: identificador },
          { igUserId: identificador },
          // Identificador da ponte nao oficial: o nome da sessao/instancia
          // Baileys que recebeu a mensagem. Nao colide com os ids da Meta —
          // sao espacos de nomes diferentes (ids numericos da Meta vs. nome
          // livre de sessao) — entao um OR simples basta, sem checar o modo.
          { ponteSessao: identificador },
        ],
      },
    });
    if (porId) return aberto(porId);
  }
  return obterConfig(canal);
}

/**
 * Monta os campos do `Contact` a criar a partir de um contato importado da
 * ponte. Pura — nenhuma chamada ao banco — para dar para testar sem Prisma;
 * `importarContatos`, logo abaixo, decide se ja existe (findFirst) e chama o
 * `create` com o que isto devolve.
 */
export function dadosContatoImportado(
  contato: { numero: string; nome: string },
  destino: { organizacaoId: string; responsavelId: string | null },
) {
  return {
    organizacaoId: destino.organizacaoId,
    nome: contato.nome,
    telefone: contato.numero,
    canalOrigem: 'WHATSAPP' as const,
    responsavelId: destino.responsavelId,
  };
}

/**
 * Importa contatos do celular do vendedor (evento `contacts.upsert` da ponte)
 * como cadastro de `Contact` no CRM.
 *
 * So CRIA o que falta: nunca sobrescreve um contato ja cadastrado com aquele
 * telefone, o que torna a importacao segura de repetir a cada reconexao. Nao
 * abre conversa nem mensagem — so o cadastro.
 */
export async function importarContatos(
  organizacaoId: string,
  responsavelId: string | null,
  contatos: { numero: string; nome: string }[],
): Promise<number> {
  let criados = 0;
  for (const contato of contatos) {
    const existente = await prisma.contact.findFirst({
      where: { organizacaoId, telefone: contato.numero },
      select: { id: true },
    });
    if (existente) continue;

    await prisma.contact.create({ data: dadosContatoImportado(contato, { organizacaoId, responsavelId }) });
    criados += 1;
  }
  return criados;
}

/**
 * Descobre a organizacao dona de um webhook de entrada.
 *
 * A URL do webhook e compartilhada — `/api/webhooks/whatsapp` e a mesma para
 * todas as empresas —, entao o canal na rota nao identifica ninguem. Quem
 * identifica e o **id externo** que a Meta manda no corpo: `phone_number_id` no
 * WhatsApp, `page_id` no Messenger, `ig_user_id` no Instagram. Sao ids globais
 * da Meta, e e por isso que eles sao unicos no banco inteiro e nao por
 * organizacao: dois clientes nao podem cadastrar o mesmo numero.
 *
 * Roda irrestrito porque e justamente a pergunta "de quem e isto?" — nao ha
 * contexto para abrir antes da resposta.
 *
 * Sem identificador no corpo (payload de teste, canal recem-cadastrado), cai
 * para o unico canal ativo daquele tipo. Com mais de um, recusa em vez de
 * escolher: entregar a mensagem de um cliente na caixa de outro e pior do que
 * nao entregar.
 */
export async function organizacaoDoWebhook(
  canal: Channel,
  identificador: string | null,
): Promise<string | null> {
  return semOrganizacao('webhook: o id externo no corpo e que revela a organizacao', async () => {
    if (identificador) {
      const porId = await prismaSemIsolamento.channelConfig.findFirst({
        where: {
          canal,
          ativo: true,
          OR: [
            { phoneNumberId: identificador },
            { pageId: identificador },
            { igUserId: identificador },
          ],
        },
        select: { organizacaoId: true },
      });
      if (porId) return porId.organizacaoId;
    }

    const ativos = await prismaSemIsolamento.channelConfig.findMany({
      where: { canal, ativo: true },
      select: { organizacaoId: true },
      take: 2,
    });
    if (ativos.length === 1) return ativos[0]!.organizacaoId;
    if (ativos.length > 1) {
      console.warn(
        `[webhook] ${canal}: ${ativos.length}+ organizacoes com o canal ativo e nenhum id externo no corpo — mensagem descartada`,
      );
    }
    return null;
  });
}

/**
 * Valida a assinatura X-Hub-Signature-256 do webhook.
 * A Meta assina o corpo BRUTO com o App Secret — por isso a rota do webhook
 * precisa do body cru, nao do JSON ja parseado e reserializado.
 */
export function assinaturaValida(corpoBruto: Buffer, assinatura: string | undefined, appSecret: string) {
  if (!assinatura?.startsWith('sha256=')) return false;

  const esperado = createHmac('sha256', appSecret).update(corpoBruto).digest('hex');
  const recebido = assinatura.slice('sha256='.length);
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recebido, 'utf8');

  // timingSafeEqual exige tamanhos iguais.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Assina um corpo do jeito que a Meta assina — usado pelo simulador de webhook. */
export const assinar = (corpo: string, appSecret: string) =>
  `sha256=${createHmac('sha256', appSecret).update(corpo).digest('hex')}`;
