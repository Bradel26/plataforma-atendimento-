/**
 * Vínculo operacional (parceiro × operação): criar, obter e mover entre etapas.
 *
 * As regras são puras (`tim.ts`, `starlink.ts`, `movimento.ts`); aqui só a
 * leitura, a gravação numa transação e os efeitos depois dela (liberação
 * automática da venda TIM, início do ciclo do parceiro).
 *
 * Vínculo de outra operação ou fora da carteira responde 404 — não revela que existe.
 */
import type { ClasseMotivo, MotivoPerdaStarlink, Operacao, Prisma, Role, TipoHistoricoEsteira } from '@prisma/client';
import { prisma, type ClienteDeEscrita } from '../../lib/prisma';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { colidiuNoVinculoDeCredenciamento } from '../../lib/erros-prisma';
import { exigirUsuarioDaOrganizacao, filtroDe, politicaContas, politicaContatos, politicaCredenciamentos } from '../../lib/politicas';
import { usuarioAtual, usuarioAtualOuNulo } from '../../lib/tenant';
import { apenasVisivel } from '../../lib/visibilidade';
import { ufDoTelefone } from '../../lib/ddd';
import { numeroNormalizado } from '../channels/whatsapp.modo';
import { estagioIniciaCiclo } from '../crm/cicloParceiro';
import { iniciarCiclos } from '../crm/cicloParceiro.service';
import { diasDesde } from '../crm/esteira';
import { acessoDoUsuarioAtual } from './acesso';
import { ETAPAS, MOTIVOS_PERDA, chaveConhecida, etapa, type ChaveEtapa, type ChaveStarlink, type ChaveTim } from './catalogo';
import type { CriarVinculoInput } from './esteiras.schemas';
import {
  avisosDoVinculo,
  destinosStarlink,
  destinosTim,
  errosDeMovimento,
  estaParado,
  etiquetasDoVinculo,
  mudancaDeSituacao,
  patchStarlinkParaMovimento,
  semIndefinidos,
  situacaoDaEtapa,
  tipoDoHistorico,
  type Aviso,
  type Destinos,
  type ErroDeMovimento,
  type Situacao,
} from './movimento';
import { CAMPOS_STARLINK_VAZIO, aplicarTravas, avaliarMudancaStarlink, derivarEtapaStarlink, type CamposStarlink } from './starlink';
import { CAMPOS_TIM_VAZIO, avaliarMovimentoTim, deveLiberarVenda, efeitosDeEntradaTim, prontoTim, type CamposTim } from './tim';
import type { Avaliacao } from './tipos';
import { vinculoAntesDeCriar, whereDoVinculo } from './vinculo';

export type { CriarVinculoInput } from './esteiras.schemas';

const JA_NA_ESTEIRA = 'Este parceiro já está nesta esteira';

const estagioSelect = { id: true, nome: true, chave: true, tipoEtapa: true, diasParado: true, ativa: true } satisfies Prisma.FunnelStageSelect;

const inclusao = {
  contato: { select: { id: true, nome: true, telefone: true, cpf: true, cidade: true, uf: true } },
  conta: { select: { id: true, nome: true, cnpj: true, cidade: true, uf: true } },
  estagio: { select: estagioSelect },
  estagioAntesDaSaida: { select: { chave: true } },
  responsavel: { select: { id: true, nome: true } },
  funil: { select: { id: true, estagios: { select: estagioSelect, orderBy: { ordem: 'asc' } } } },
  tim: true,
  starlink: true,
} satisfies Prisma.CredenciamentoInclude;

type VinculoDb = Prisma.CredenciamentoGetPayload<{ include: typeof inclusao }>;
type EstagioDb = VinculoDb['estagio'];

export type VinculoResumo = {
  id: string;
  operacao: Operacao;
  parceiro: {
    contatoId: string;
    contaId: string | null;
    nome: string;
    cnpj: string | null;
    cpf: string | null;
    telefone: string | null;
    cidade: string | null;
    uf: string | null;
  };
  responsavel: { id: string; nome: string } | null;
  etapa: { chave: ChaveEtapa | null; nome: string; tipo: EstagioDb['tipoEtapa']; diasParado: number | null };
  diasNaEtapa: number;
  parado: boolean;
  ultimaInteracaoEm: Date;
  etiquetas: string[];
  /** Resultado da avaliação de mover para cada etapa ativa da operação (a atual é PROIBIDO). */
  destinos: Destinos;
};

export type VinculoDetalhe = VinculoResumo & {
  campos: CamposTim | CamposStarlink;
  vendedores?: Array<{ id: string; nome: string; cpf: string | null; telefone: string | null; status: string; criadoEm: Date; atualizadoEm: Date }>;
  notas: Array<{ id: string; texto: string; autorId: string | null; criadoEm: Date }>;
  historico: Array<{
    id: string;
    tipo: TipoHistoricoEsteira;
    de: { id: string; nome: string; chave: string | null } | null;
    para: { id: string; nome: string; chave: string | null };
    motivo: string | null;
    observacao: string | null;
    usuario: { id: string; nome: string } | null;
    segundosNoEstagio: number | null;
    criadoEm: Date;
  }>;
  auditoria: Array<{ id: string; campo: string; de: unknown; para: unknown; usuarioId: string | null; criadoEm: Date }>;
  situacao: Situacao;
  motivoSituacao: string | null;
  classeMotivo: ClasseMotivo | null;
  situacaoDesde: Date | null;
  observacoes: string | null;
  criadoEm: Date;
  prontoTim?: boolean;
  avisos: Aviso[];
};

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

const camposTim = (v: VinculoDb): CamposTim => {
  if (!v.tim) return CAMPOS_TIM_VAZIO;
  const { credenciamentoId: _id, ...campos } = v.tim;
  return campos;
};
const camposStarlink = (v: VinculoDb): CamposStarlink => {
  if (!v.starlink) return CAMPOS_STARLINK_VAZIO;
  const { credenciamentoId: _id, ...campos } = v.starlink;
  return campos;
};

/**
 * Chave da etapa atual. Starlink: derivada dos campos (o `estagioId` é cache).
 * TIM: a do estágio gravado; nula se o estágio não tem chave (funil não sincronizado).
 */
function chaveAtual(v: VinculoDb): ChaveEtapa | null {
  if (v.operacao === 'STARLINK') return derivarEtapaStarlink(camposStarlink(v));
  return chaveConhecida(v.estagio.chave) ? (v.estagio.chave as ChaveEtapa) : null;
}

const estagioDaChave = (v: VinculoDb, chave: ChaveEtapa) => v.funil.estagios.find((e) => e.chave === chave) ?? null;

function destinosDoVinculo(v: VinculoDb, chave: ChaveEtapa | null, agora: Date): Destinos {
  if (!chave) return {};
  const calculados =
    v.operacao === 'TIM'
      ? destinosTim(chave as ChaveTim, camposTim(v), {
          perfil: usuarioAtual().perfil as Role,
          agora,
          antesDaSaida: chaveConhecida(v.estagioAntesDaSaida?.chave) ? (v.estagioAntesDaSaida!.chave as ChaveTim) : null,
        })
      : destinosStarlink(camposStarlink(v), agora);
  // Só as colunas que existem e estão ativas no funil da organização.
  const ativas = new Set(v.funil.estagios.filter((e) => e.ativa && e.chave).map((e) => e.chave));
  return Object.fromEntries(Object.entries(calculados).filter(([c]) => ativas.has(c))) as Destinos;
}

function montarResumo(v: VinculoDb, agora = new Date()): VinculoResumo {
  const chave = chaveAtual(v);
  const estagio = (chave && estagioDaChave(v, chave)) || v.estagio;
  const diasNaEtapa = diasDesde(v.estagioDesde, agora.getTime());
  return {
    id: v.id,
    operacao: v.operacao,
    parceiro: {
      contatoId: v.contatoId,
      contaId: v.contaId,
      nome: v.conta?.nome ?? v.contato.nome,
      cnpj: v.conta?.cnpj ?? null,
      cpf: v.contato.cpf,
      telefone: v.contato.telefone,
      cidade: v.contato.cidade ?? v.conta?.cidade ?? null,
      uf: v.contato.uf ?? v.conta?.uf ?? null,
    },
    responsavel: v.responsavel,
    etapa: { chave, nome: estagio.nome, tipo: chave ? etapa(chave).tipo : estagio.tipoEtapa, diasParado: estagio.diasParado },
    diasNaEtapa,
    parado: estaParado(diasNaEtapa, estagio.diasParado),
    ultimaInteracaoEm: v.ultimaInteracaoEm,
    etiquetas: etiquetasDoVinculo(v.operacao, v.operacao === 'TIM' ? camposTim(v) : camposStarlink(v)),
    destinos: destinosDoVinculo(v, chave, agora),
  };
}

async function montarDetalhe(v: VinculoDb): Promise<VinculoDetalhe> {
  const resumo = montarResumo(v);
  const [historico, notas, auditoria, vendedores] = await Promise.all([
    prisma.credenciamentoHistorico.findMany({
      where: { credenciamentoId: v.id },
      include: {
        deEstagio: { select: { id: true, nome: true, chave: true } },
        paraEstagio: { select: { id: true, nome: true, chave: true } },
        usuario: { select: { id: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    }),
    prisma.credenciamentoNota.findMany({ where: { credenciamentoId: v.id }, orderBy: { criadoEm: 'desc' } }),
    prisma.credenciamentoAuditoria.findMany({ where: { credenciamentoId: v.id }, orderBy: { criadoEm: 'desc' } }),
    v.operacao === 'TIM'
      ? prisma.pdvVendedor.findMany({ where: { credenciamentoId: v.id }, orderBy: { criadoEm: 'asc' } })
      : Promise.resolve(null),
  ]);

  const chave = resumo.etapa.chave;
  const campos = v.operacao === 'TIM' ? camposTim(v) : camposStarlink(v);
  const avisos: Aviso[] = !chave
    ? []
    : v.operacao === 'TIM'
      ? avisosDoVinculo({ operacao: 'TIM', chave: chave as ChaveTim, campos: campos as CamposTim })
      : avisosDoVinculo({ operacao: 'STARLINK', chave: chave as ChaveStarlink, campos: campos as CamposStarlink });

  return {
    ...resumo,
    campos,
    ...(vendedores
      ? {
          vendedores: vendedores.map((p) => ({
            id: p.id,
            nome: p.nome,
            cpf: p.cpf,
            telefone: p.telefone,
            status: p.status,
            criadoEm: p.criadoEm,
            atualizadoEm: p.atualizadoEm,
          })),
        }
      : {}),
    notas: notas.map((n) => ({ id: n.id, texto: n.texto, autorId: n.autorId, criadoEm: n.criadoEm })),
    historico: historico.map((h) => ({
      id: h.id,
      tipo: h.tipo,
      de: h.deEstagio,
      para: h.paraEstagio,
      motivo: h.motivo,
      observacao: h.observacao,
      usuario: h.usuario,
      segundosNoEstagio: h.segundosNoEstagio,
      criadoEm: h.criadoEm,
    })),
    auditoria: auditoria.map((a) => ({ id: a.id, campo: a.campo, de: a.de, para: a.para, usuarioId: a.usuarioId, criadoEm: a.criadoEm })),
    situacao: situacaoDaEtapa(resumo.etapa.tipo, chave),
    motivoSituacao: v.motivoSituacao,
    classeMotivo: v.classeMotivo,
    situacaoDesde: v.situacaoDesde,
    observacoes: v.observacoes,
    criadoEm: v.criadoEm,
    ...(v.operacao === 'TIM' ? { prontoTim: prontoTim(campos as CamposTim) } : {}),
    avisos,
  };
}

/**
 * Vínculo da operação dentro da carteira do usuário; 404 se de outra operação,
 * fora dela ou arquivado (duplicata da migração — movê-lo criaria um segundo card vivo).
 */
async function carregarVisivel(operacao: Operacao, id: string): Promise<VinculoDb> {
  const v = await prisma.credenciamento.findFirst({
    where: { AND: [apenasVisivel(id, await filtroDe(politicaCredenciamentos)), { operacao, arquivadoEm: null }] },
    include: inclusao,
  });
  if (!v) throw notFound('Vínculo não encontrado');
  return v;
}

/** Releitura depois de gravar: a visibilidade já foi conferida antes da escrita. */
async function recarregar(id: string): Promise<VinculoDb> {
  return prisma.credenciamento.findUniqueOrThrow({ where: { id }, include: inclusao });
}

export async function obterVinculo(operacao: Operacao, id: string): Promise<VinculoDetalhe> {
  return montarDetalhe(await carregarVisivel(operacao, id));
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

/** Funil ESTEIRA ativo da operação com as etapas (a sincronização de estrutura cria). */
async function funilDaOperacao(operacao: Operacao) {
  const funil = await prisma.funnel.findFirst({
    where: { tipo: 'ESTEIRA', operacao, ativo: true },
    orderBy: { criadoEm: 'asc' },
    include: { estagios: { select: estagioSelect, orderBy: { ordem: 'asc' } } },
  });
  if (!funil) throw badRequest('Esta esteira não está configurada nesta organização');
  return funil;
}

type ContatoParceiro = { id: string; contaId: string | null; responsavelId: string | null };
const contatoSelect = { id: true, contaId: true, responsavelId: true } satisfies Prisma.ContactSelect;

/**
 * Parceiro do vínculo, sem gravar nada: o que já existe e o que falta criar.
 * A criação fica para a transação do vínculo, depois da checagem de unicidade —
 * senão um 409 deixaria conta/contato órfãos para trás.
 */
type PlanoParceiro = {
  /** Contato existente; nulo quando será criado (`novoContato`). */
  contato: ContatoParceiro | null;
  /** Conta existente que identifica o parceiro; nula sem conta ou quando será criada (`novaConta`). */
  contaId: string | null;
  novaConta: { nome: string; cnpj: string; cidade: string | null; uf: string | null } | null;
  novoContato: {
    nome: string;
    telefone: string | null;
    cpf: string | null;
    email: string | null;
    cidade: string | null;
    uf: string | null;
    canalOrigem: 'PROSPECCAO_ATIVA';
  } | null;
};

/** Conta visível pelo CNPJ; CNPJ de conta fora da carteira é recusado; nula se não existe. */
async function acharConta(cnpj: string): Promise<string | null> {
  const visivel = await prisma.account.findFirst({
    where: { AND: [await filtroDe(politicaContas), { cnpj }] },
    select: { id: true },
  });
  if (visivel) return visivel.id;
  if (await prisma.account.findFirst({ where: { cnpj }, select: { id: true } })) {
    throw badRequest('Já existe uma empresa com este CNPJ fora da sua carteira');
  }
  return null;
}

/** Contato visível por CPF, senão por telefone, senão (com conta) o primeiro da conta. */
async function acharContato(input: CriarVinculoInput, contaId: string | null): Promise<ContatoParceiro | null> {
  const visivel = await filtroDe(politicaContatos);
  const buscar = (where: Prisma.ContactWhereInput) =>
    prisma.contact.findFirst({ where: { AND: [visivel, { excluidoEm: null }, where] }, select: contatoSelect, orderBy: { criadoEm: 'asc' } });

  if (input.cpf) {
    const porCpf = await buscar({ cpf: input.cpf });
    if (porCpf) return porCpf;
  }
  if (input.telefone) {
    const normalizado = numeroNormalizado(input.telefone);
    const porTelefone = await buscar(normalizado ? { telefoneNormalizado: normalizado } : { telefone: input.telefone });
    if (porTelefone) return porTelefone;
  }
  if (contaId && !input.cpf && !input.telefone) return buscar({ contaId });
  return null;
}

/**
 * Parceiro do vínculo: o contato informado, ou achado pelos dados; o que não
 * existe vira plano de criação. A conta (CNPJ) identifica o parceiro (spec 4.2).
 */
async function planejarParceiro(input: CriarVinculoInput): Promise<PlanoParceiro> {
  if (input.contaId) {
    const conta = await prisma.account.findFirst({
      where: apenasVisivel(input.contaId, await filtroDe(politicaContas)),
      select: { id: true },
    });
    if (!conta) throw notFound('Conta não encontrada');
  }

  if (input.contatoId) {
    const contato = await prisma.contact.findFirst({
      where: { AND: [apenasVisivel(input.contatoId, await filtroDe(politicaContatos)), { excluidoEm: null }] },
      select: contatoSelect,
    });
    if (!contato) throw notFound('Contato não encontrado');
    return { contato, contaId: input.contaId ?? contato.contaId ?? null, novaConta: null, novoContato: null };
  }

  const nome = (input.nome ?? input.empresa)!;
  let contaId = input.contaId ?? null;
  let novaConta: PlanoParceiro['novaConta'] = null;
  if (!contaId && input.cnpj) {
    contaId = await acharConta(input.cnpj);
    if (!contaId) novaConta = { nome: input.empresa ?? nome, cnpj: input.cnpj, cidade: input.cidade ?? null, uf: input.uf ?? null };
  }

  const existente = await acharContato(input, contaId);
  if (existente) {
    // Conta nova (CNPJ inédito) identifica o parceiro; senão a conta achada, ou a do contato.
    return { contato: existente, contaId: novaConta ? null : (contaId ?? existente.contaId ?? null), novaConta, novoContato: null };
  }

  return {
    contato: null,
    contaId,
    novaConta,
    novoContato: {
      nome: input.nome ?? nome,
      telefone: input.telefone ?? null,
      cpf: input.cpf ?? null,
      email: input.email ?? null,
      cidade: input.cidade ?? null,
      uf: input.uf ?? ufDoTelefone(input.telefone),
      canalOrigem: 'PROSPECCAO_ATIVA',
    },
  };
}

export async function criarVinculo(operacao: Operacao, input: CriarVinculoInput): Promise<VinculoDetalhe> {
  await exigirUsuarioDaOrganizacao(input.responsavelId);
  const funil = await funilDaOperacao(operacao);
  const primeira = funil.estagios.find((e) => e.chave === ETAPAS[operacao][0]!.chave);
  if (!primeira) throw badRequest('A esteira não tem a etapa inicial configurada');

  const plano = await planejarParceiro(input);

  // Um vínculo não arquivado por parceiro por operação (critério dos índices
  // parciais), conferido ANTES de criar conta ou contato.
  const conferir = vinculoAntesDeCriar(operacao, {
    contaId: plano.contaId,
    contaNova: plano.novaConta != null,
    contatoId: plano.contato?.id ?? null,
  });
  if (conferir) {
    const aberto = await prisma.credenciamento.findFirst({ where: whereDoVinculo(conferir), select: { id: true } });
    if (aberto) throw conflict(JA_NA_ESTEIRA);
  }

  const agora = new Date();
  // A consulta acima não fecha a corrida; o índice fecha, e a colisão vira a mesma resposta.
  // Conta e contato novos nascem na mesma transação do vínculo: nada fica órfão.
  const id = await prisma
    .$transaction(async (tx) => {
      const contaId = plano.novaConta
        ? (await tx.account.create({ data: plano.novaConta, select: { id: true } })).id
        : plano.contaId;
      const contato =
        plano.contato ?? (await tx.contact.create({ data: { ...plano.novoContato!, contaId }, select: contatoSelect }));

      const criado = await tx.credenciamento.create({
        data: {
          contatoId: contato.id,
          contaId,
          funilId: funil.id,
          estagioId: primeira.id,
          operacao,
          responsavelId: input.responsavelId !== undefined ? input.responsavelId : contato.responsavelId,
          observacoes: input.observacoes ?? null,
          estagioDesde: agora,
          ultimaInteracaoEm: agora,
          ...(operacao === 'TIM'
            ? { tim: { create: { origem: 'MANUAL' } } }
            : { starlink: { create: { tipoCaptacao: input.tipoCaptacao ?? null } } }),
          historico: {
            create: { paraEstagioId: primeira.id, operacao, tipo: 'MOVIMENTO', usuarioId: usuarioAtualOuNulo()?.id ?? null },
          },
        },
        select: { id: true },
      });
      // Associação de operação do cadastro central (continua servindo a Campanhas).
      await tx.contactOperation.upsert({
        where: { contatoId_operacao: { contatoId: contato.id, operacao } },
        create: { contatoId: contato.id, operacao },
        update: {},
      });
      if (contaId) {
        await tx.accountOperation.upsert({
          where: { contaId_operacao: { contaId, operacao } },
          create: { contaId, operacao },
          update: {},
        });
      }
      return criado.id;
    })
    .catch((erro: unknown) => {
      if (colidiuNoVinculoDeCredenciamento(erro)) throw conflict(JA_NA_ESTEIRA);
      throw erro;
    });

  return montarDetalhe(await recarregar(id));
}

// ---------------------------------------------------------------------------
// Movimento
// ---------------------------------------------------------------------------

const erroHttp = (e: ErroDeMovimento) => new AppError(e.status, e.code, e.mensagem, e.details);
const proibido = (mensagem: string) => new AppError(400, 'TRANSICAO_PROIBIDA', mensagem);

type Gravacao = {
  para: EstagioDb;
  tipo: TipoHistoricoEsteira;
  motivo: string | null;
  observacao: string | null;
  motivoSituacao: string | null;
  classeMotivo: ClasseMotivo | null;
  usuarioId: string | null;
  tim?: Partial<CamposTim>;
  starlink?: CamposStarlink;
};

/** Grava um movimento: etapa, situação, campos da operação e histórico. */
async function gravarMovimento(tx: ClienteDeEscrita, v: VinculoDb, g: Gravacao, agora: Date) {
  await tx.credenciamento.update({
    where: { id: v.id },
    data: {
      estagioId: g.para.id,
      estagioDesde: agora,
      ultimaInteracaoEm: agora,
      ...mudancaDeSituacao({
        de: { id: v.estagioId, tipo: v.estagio.tipoEtapa, chave: v.estagio.chave },
        para: { tipo: g.para.tipoEtapa, chave: g.para.chave },
        motivo: g.motivoSituacao,
        classe: g.classeMotivo,
        agora,
      }),
    },
  });
  if (g.tim && (Object.keys(g.tim).length > 0 || !v.tim)) {
    await tx.credenciamentoTim.upsert({
      where: { credenciamentoId: v.id },
      create: { credenciamentoId: v.id, ...g.tim },
      update: g.tim,
    });
  }
  if (g.starlink) {
    await tx.credenciamentoStarlink.upsert({
      where: { credenciamentoId: v.id },
      create: { credenciamentoId: v.id, ...g.starlink },
      update: g.starlink,
    });
  }
  await tx.credenciamentoHistorico.create({
    data: {
      credenciamentoId: v.id,
      deEstagioId: v.estagioId,
      paraEstagioId: g.para.id,
      operacao: v.operacao,
      tipo: g.tipo,
      motivo: g.motivo,
      observacao: g.observacao,
      usuarioId: g.usuarioId,
      segundosNoEstagio: Math.max(0, Math.round((agora.getTime() - v.estagioDesde.getTime()) / 1000)),
    },
  });
  // Ponto da auditoria dos campos alterados (Task 8 fornece `diferencas(antes, depois)`
  // e grava em `credenciamentoAuditoria` aqui, na mesma transação).
}

/** Falha no ciclo não desfaz o movimento: a listagem e o agendador criam o ciclo depois. */
async function iniciarCicloSemFalhar(id: string) {
  try {
    await iniciarCiclos(id);
  } catch (erro) {
    console.error('[ciclo-parceiro] não iniciou o ciclo', erro);
  }
}

const texto = (v: string | null | undefined): string | null => v?.trim() || null;

export async function moverVinculo(
  operacao: Operacao,
  id: string,
  input: { paraChave: ChaveEtapa; justificativa?: string; motivo?: string; motivoPerda?: MotivoPerdaStarlink },
): Promise<VinculoDetalhe> {
  // Trava contra mover entre fluxos: a chave tem de ser do catálogo da operação da rota.
  if (!ETAPAS[operacao].some((e) => e.chave === input.paraChave)) {
    throw proibido('Esta etapa não pertence a esta esteira');
  }
  const v = await carregarVisivel(operacao, id);
  const para = estagioDaChave(v, input.paraChave);
  if (!para || !para.ativa) throw proibido('Esta etapa não está ativa nesta esteira');

  const usuario = usuarioAtual();
  const perfil = usuario.perfil as Role;
  const nivel = (await acessoDoUsuarioAtual())[operacao];
  const agora = new Date();
  const justificativa = texto(input.justificativa);
  const motivo = texto(input.motivo);

  let avaliacao: Avaliacao;
  let gravacao: Omit<Gravacao, 'tipo' | 'motivo' | 'observacao'>;
  let camposTimDepois: CamposTim | null = null;

  if (operacao === 'TIM') {
    const de = chaveAtual(v);
    if (!de) throw proibido('A etapa atual não tem chave; sincronize a estrutura da esteira');
    const campos = camposTim(v);
    avaliacao = avaliarMovimentoTim(de as ChaveTim, input.paraChave as ChaveTim, campos, {
      perfil,
      agora,
      antesDaSaida: chaveConhecida(v.estagioAntesDaSaida?.chave) ? (v.estagioAntesDaSaida!.chave as ChaveTim) : null,
    });
    const erro = errosDeMovimento(avaliacao, { justificativa, perfil, nivel, motivo });
    if (erro) throw erroHttp(erro);
    // Efeitos calculados sobre os campos de ANTES da gravação.
    const efeitos = efeitosDeEntradaTim(input.paraChave as ChaveTim, campos, agora);
    camposTimDepois = { ...campos, ...efeitos };
    gravacao = { para, motivoSituacao: motivo, classeMotivo: null, usuarioId: usuario.id, tim: efeitos };
  } else {
    const antes = camposStarlink(v);
    const destino = input.paraChave as ChaveStarlink;
    if ((destino === 'SL_NURTURE' || destino === 'SL_DESCARTADO') && !input.motivoPerda) {
      throw erroHttp({ status: 400, code: 'EXIGE_MOTIVO', mensagem: 'Informe o motivo da perda' });
    }
    let patch: Partial<CamposStarlink>;
    try {
      patch = semIndefinidos(patchStarlinkParaMovimento(destino, antes, agora, input.motivoPerda));
    } catch (erro) {
      throw proibido(erro instanceof Error ? erro.message : 'Movimento não previsto');
    }
    const depois = aplicarTravas(antes, patch);
    if (derivarEtapaStarlink(depois) !== destino) throw proibido(`O parceiro não pode ir para ${para.nome}`);
    avaliacao = avaliarMudancaStarlink(antes, depois);
    const rotuloPerda = depois.motivoPerda ? MOTIVOS_PERDA[depois.motivoPerda].rotulo : null;
    const erro = errosDeMovimento(avaliacao, { justificativa, perfil, nivel, motivo: motivo ?? rotuloPerda });
    if (erro) throw erroHttp(erro);
    const perdido = depois.perdido === true && depois.motivoPerda != null;
    gravacao = {
      para,
      // `classeMotivo` acompanha a classe do motivo da perda (Nurture/Descartado).
      motivoSituacao: perdido ? (motivo ?? rotuloPerda) : null,
      classeMotivo: perdido ? MOTIVOS_PERDA[depois.motivoPerda!].classe : null,
      usuarioId: usuario.id,
      starlink: depois,
    };
  }

  if (avaliacao.resultado === 'PROIBIDO') throw proibido(avaliacao.motivo); // já tratado; estreita o tipo
  const tipo = tipoDoHistorico(avaliacao);
  const motivoSaida = gravacao.motivoSituacao;
  await prisma.$transaction((tx) =>
    gravarMovimento(
      tx,
      v,
      {
        ...gravacao,
        tipo,
        // Justificativa quando houver; senão o motivo da saída. Os dois juntos: motivo vai para a observação.
        motivo: justificativa ?? motivoSaida,
        observacao: justificativa && motivoSaida ? motivoSaida : null,
      },
      agora,
    ),
  );

  let atual = await recarregar(id);

  // TIM: entrar em Pós-cred já "pronto" libera a venda sozinho (5 → 6).
  if (camposTimDepois && deveLiberarVenda(input.paraChave as ChaveTim, camposTimDepois)) {
    const liberada = estagioDaChave(atual, 'TIM_VENDA_LIBERADA');
    if (liberada?.ativa) {
      const efeitos = efeitosDeEntradaTim('TIM_VENDA_LIBERADA', camposTimDepois, agora);
      const v2 = atual;
      await prisma.$transaction((tx) =>
        gravarMovimento(
          tx,
          v2,
          {
            para: liberada,
            tipo: 'AUTOMATICO',
            motivo: 'Venda liberada automaticamente: parceiro pronto',
            observacao: null,
            motivoSituacao: null,
            classeMotivo: null,
            usuarioId: null,
            tim: efeitos,
          },
          agora,
        ),
      );
      atual = await recarregar(id);
    }
  }

  // Ciclo do parceiro: a mesma regra de `iniciarCiclos` (TIM em Acompanhamento, Starlink em Pronto p/ venda).
  if (estagioIniciaCiclo(atual.estagio)) await iniciarCicloSemFalhar(id);

  return montarDetalhe(atual);
}

