import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Channel } from '@prisma/client';
import { prisma, prismaSemIsolamento } from '../../lib/prisma';
import { semOrganizacao } from '../../lib/tenant';
import { badRequest, notFound } from '../../lib/errors';
import { cifrar, decifrar } from '../../lib/crypto-box';

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

/**
 * Valida o que `salvarCanal`/`criarNumero`/`atualizarNumero` tem em comum:
 * fila existe, dono existe (e e da mesma organizacao — `findUnique` de outra
 * empresa nao acha nada, a extensao do Prisma cuida disso), credencial bate com
 * o modo, e cifra o que for segredo. Devolve o que vai para o banco.
 */
async function prepararGravacao(canal: CanalExterno, atual: SalvarCanalInput | null, input: SalvarNumeroInput) {
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

  if (gravado) {
    await prisma.channelConfig.update({ where: { id: gravado.id }, data: paraGravar });
  } else {
    await prisma.channelConfig.create({ data: { canal, ...paraGravar } });
  }

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
  await prisma.channelConfig.create({ data: { canal, ...paraGravar } });

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
  const paraGravar = await prepararGravacao(gravado.canal as CanalExterno, aberto(gravado), input);
  await prisma.channelConfig.update({ where: { id }, data: paraGravar });

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
