/**
 * Vínculo operacional (parceiro × operação): criar, obter, mover entre etapas,
 * editar campos, notas e vendedores do PDV.
 *
 * As regras são puras (`tim.ts`, `starlink.ts`, `movimento.ts`, `auditoria.ts`);
 * aqui só a leitura, a gravação numa transação (com a auditoria campo a campo)
 * e os efeitos depois dela (liberação automática da venda TIM, início do ciclo).
 *
 * Vínculo de outra operação ou fora da carteira responde 404 — não revela que existe.
 */
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type ClasseMotivo,
  type MotivoPerdaStarlink,
  type NivelOperacao,
  type Operacao,
  type Role,
  type StatusVendedor,
  type TipoHistoricoEsteira,
} from '@prisma/client';
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
import { valoresDaLinha, type VinculoLinha } from './colunas';
import {
  CAMPO_JUSTIFICATIVA,
  diferencas,
  diferencasDoVendedor,
  mesclarVendedor,
  valorAuditavel,
  type DadosVendedor,
  type Diferenca,
} from './auditoria';
import { ETAPAS, MOTIVOS_PERDA, chaveConhecida, etapa, type ChaveEtapa, type ChaveStarlink, type ChaveTim } from './catalogo';
import type { CriarVinculoInput } from './esteiras.schemas';
import {
  MOTIVO_IMPORTACAO,
  planejarImportacao,
  type EntradaDeImportacao,
  type PlanoDeImportacao,
  type PontoDePartida,
} from './importacao';
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
import {
  CAMPOS_STARLINK_VAZIO,
  aplicarTravas,
  avaliarMudancaStarlink,
  derivarEtapaStarlink,
  perdaSemMotivo,
  type CamposStarlink,
} from './starlink';
import {
  CAMPOS_TIM_VAZIO,
  avaliarMovimentoTim,
  camposBloqueadosTim,
  deveLiberarVenda,
  efeitosDeEntradaTim,
  liberaVendaNaEdicao,
  pendenciasDeCamposTim,
  prontoDesfeito,
  prontoTim,
  type CamposTim,
} from './tim';
import { vinculoAntesDeCriar, whereDoVinculo } from './vinculo';

export type { CriarVinculoInput } from './esteiras.schemas';

const JA_NA_ESTEIRA = 'Este parceiro já está nesta esteira';

const estagioSelect = { id: true, nome: true, chave: true, tipoEtapa: true, diasParado: true, ativa: true } satisfies Prisma.FunnelStageSelect;

/** O que a leitura do vínculo carrega (card, linha e detalhe montam a partir disto). */
export const inclusao = {
  contato: { select: { id: true, nome: true, telefone: true, cpf: true, cidade: true, uf: true } },
  conta: { select: { id: true, nome: true, cnpj: true, cidade: true, uf: true } },
  estagio: { select: estagioSelect },
  estagioAntesDaSaida: { select: { chave: true } },
  responsavel: { select: { id: true, nome: true } },
  funil: { select: { id: true, estagios: { select: estagioSelect, orderBy: { ordem: 'asc' } } } },
  tim: true,
  starlink: true,
} satisfies Prisma.CredenciamentoInclude;

export type VinculoDb = Prisma.CredenciamentoGetPayload<{ include: typeof inclusao }>;
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
const camposDoVinculo = (v: VinculoDb): CamposTim | CamposStarlink => (v.operacao === 'TIM' ? camposTim(v) : camposStarlink(v));

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

/** Card sem os destinos (a Lista não os usa: avaliar cada destino é o custo do card). */
function montarBase(v: VinculoDb, agora: Date): Omit<VinculoResumo, 'destinos'> {
  const chave = chaveAtual(v);
  const estagio = (chave && estagioDaChave(v, chave)) || v.estagio;
  const diasNaEtapa = diasDesde(v.estagioDesde, agora.getTime());
  const tipo = chave ? etapa(chave).tipo : estagio.tipoEtapa;
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
    etapa: { chave, nome: estagio.nome, tipo, diasParado: estagio.diasParado },
    diasNaEtapa,
    parado: estaParado(diasNaEtapa, estagio.diasParado, tipo),
    ultimaInteracaoEm: v.ultimaInteracaoEm,
    etiquetas: etiquetasDoVinculo(v.operacao, camposDoVinculo(v)),
  };
}

/** Card do vínculo (Kanban, resposta das escritas): o básico mais os destinos permitidos. */
export function montarResumo(v: VinculoDb, agora = new Date()): VinculoResumo {
  const base = montarBase(v, agora);
  return { ...base, destinos: destinosDoVinculo(v, base.etapa.chave, agora) };
}

/** Linha da Lista: o card sem destinos mais o valor de cada coluna da operação. */
export function montarLinha(v: VinculoDb, agora = new Date()): VinculoLinha {
  const base = montarBase(v, agora);
  const valores = valoresDaLinha({
    ...base,
    situacao: situacaoDaEtapa(base.etapa.tipo, base.etapa.chave),
    criadoEm: v.criadoEm,
    observacoes: v.observacoes,
    campos: camposDoVinculo(v),
  });
  return { ...base, valores };
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
  const campos = camposDoVinculo(v);
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
export async function funilDaOperacao(operacao: Operacao) {
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

type FunilDaOperacao = Awaited<ReturnType<typeof funilDaOperacao>>;

/** Etapa inicial da operação no funil da organização. */
function etapaInicial(operacao: Operacao, funil: FunilDaOperacao) {
  const primeira = funil.estagios.find((e) => e.chave === ETAPAS[operacao][0]!.chave);
  if (!primeira) throw badRequest('A esteira não tem a etapa inicial configurada');
  return primeira;
}

/**
 * Um vínculo não arquivado por parceiro por operação (critério dos índices
 * parciais), conferido ANTES de criar conta ou contato.
 */
async function conferirSemVinculo(operacao: Operacao, plano: PlanoParceiro) {
  const conferir = vinculoAntesDeCriar(operacao, {
    contaId: plano.contaId,
    contaNova: plano.novaConta != null,
    contatoId: plano.contato?.id ?? null,
  });
  if (conferir) {
    const aberto = await prisma.credenciamento.findFirst({ where: whereDoVinculo(conferir), select: { id: true } });
    if (aberto) throw conflict(JA_NA_ESTEIRA);
  }
}

/** Como o vínculo nasce: manual (Novo parceiro) ou pela importação da planilha. */
type OpcoesDeCriacao = {
  tipoHistorico: TipoHistoricoEsteira;
  origemTim: 'MANUAL' | 'PLANILHA';
  /** Grava mais coisas no vínculo recém-criado, na MESMA transação (importação: campos e etapa). */
  depoisDeCriar?: (tx: ClienteDeEscrita, id: string) => Promise<void>;
};

export async function criarVinculo(operacao: Operacao, input: CriarVinculoInput): Promise<VinculoDetalhe> {
  await exigirUsuarioDaOrganizacao(input.responsavelId);
  const funil = await funilDaOperacao(operacao);
  const primeira = etapaInicial(operacao, funil);
  const plano = await planejarParceiro(input);
  await conferirSemVinculo(operacao, plano);
  const id = await criarComPlano(operacao, funil.id, primeira.id, plano, input, { tipoHistorico: 'MOVIMENTO', origemTim: 'MANUAL' });
  return montarDetalhe(await recarregar(id));
}

/** Cria conta/contato que faltam e o vínculo na etapa inicial, numa transação. Devolve o id. */
async function criarComPlano(
  operacao: Operacao,
  funilId: string,
  primeiraId: string,
  plano: PlanoParceiro,
  input: CriarVinculoInput,
  opcoes: OpcoesDeCriacao,
): Promise<string> {
  const agora = new Date();
  // A consulta acima não fecha a corrida; o índice fecha, e a colisão vira a mesma resposta.
  // Conta e contato novos nascem na mesma transação do vínculo: nada fica órfão.
  return prisma
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
          funilId,
          estagioId: primeiraId,
          operacao,
          responsavelId: input.responsavelId !== undefined ? input.responsavelId : contato.responsavelId,
          observacoes: input.observacoes ?? null,
          estagioDesde: agora,
          ultimaInteracaoEm: agora,
          ...(operacao === 'TIM'
            ? { tim: { create: { origem: opcoes.origemTim } } }
            : { starlink: { create: { tipoCaptacao: input.tipoCaptacao ?? null } } }),
          historico: {
            create: { paraEstagioId: primeiraId, operacao, tipo: opcoes.tipoHistorico, usuarioId: usuarioAtualOuNulo()?.id ?? null },
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
      if (opcoes.depoisDeCriar) await opcoes.depoisDeCriar(tx, criado.id);
      return criado.id;
    })
    .catch((erro: unknown) => {
      if (colidiuNoVinculoDeCredenciamento(erro)) throw conflict(JA_NA_ESTEIRA);
      throw erro;
    });
}

// ---------------------------------------------------------------------------
// Gravação (movimento, edição, nota, vendedor) — um caminho só
// ---------------------------------------------------------------------------

const erroHttp = (e: ErroDeMovimento) => new AppError(e.status, e.code, e.mensagem, e.details);
const proibido = (mensagem: string) => new AppError(400, 'TRANSICAO_PROIBIDA', mensagem);

/** Mudança de etapa: grava etapa, situação e uma linha de histórico. */
type Movimento = {
  para: EstagioDb;
  tipo: TipoHistoricoEsteira;
  motivo: string | null;
  observacao: string | null;
  motivoSituacao: string | null;
  classeMotivo: ClasseMotivo | null;
};

/** Colunas comuns do vínculo editáveis (auditadas como os campos da operação). */
type ColunasDoVinculo = {
  responsavelId?: string | null;
  observacoes?: string | null;
  motivoSituacao?: string | null;
  classeMotivo?: ClasseMotivo | null;
};

type Gravacao = {
  usuarioId: string | null;
  /** Nulo numa alteração que não muda a etapa (sem histórico). */
  movimento: Movimento | null;
  tim?: Partial<CamposTim>;
  starlink?: Partial<CamposStarlink>;
  vinculo?: ColunasDoVinculo;
  /** Linhas de auditoria além das dos campos (vendedores do PDV). */
  auditoriaExtra?: Diferenca[];
  /** Justificativa de alteração fora da regra sem mudar a etapa: vai para a auditoria. */
  justificativa?: string | null;
};

/** Uma linha de auditoria por campo que muda (operação, vínculo e extras). */
function auditoriaDaGravacao(v: VinculoDb, g: Gravacao): Diferenca[] {
  const linhas = [
    ...(g.vinculo
      ? diferencas(
          { responsavelId: v.responsavelId, observacoes: v.observacoes, motivoSituacao: v.motivoSituacao, classeMotivo: v.classeMotivo },
          g.vinculo,
        )
      : []),
    ...(g.tim ? diferencas(camposTim(v), g.tim) : []),
    ...(g.starlink ? diferencas(camposStarlink(v), g.starlink) : []),
    ...(g.auditoriaExtra ?? []),
  ];
  // Com movimento, a justificativa fica no histórico.
  if (!g.movimento && g.justificativa && linhas.length > 0) linhas.push({ campo: CAMPO_JUSTIFICATIVA, de: null, para: g.justificativa });
  return linhas;
}

const json = (v: unknown) => {
  const valor = valorAuditavel(v);
  return valor === null ? Prisma.DbNull : (valor as Prisma.InputJsonValue);
};

/**
 * Grava uma alteração do vínculo numa transação: colunas comuns, campos da
 * operação, etapa/situação/histórico (se houver movimento) e a auditoria campo
 * a campo. Toda gravação conta como interação (`ultimaInteracaoEm`).
 */
async function gravar(tx: ClienteDeEscrita, v: VinculoDb, g: Gravacao, agora: Date) {
  const auditoria = auditoriaDaGravacao(v, g);
  const m = g.movimento;
  await tx.credenciamento.update({
    where: { id: v.id },
    data: {
      ultimaInteracaoEm: agora,
      ...g.vinculo,
      ...(m
        ? {
            estagioId: m.para.id,
            estagioDesde: agora,
            ...mudancaDeSituacao({
              de: { id: v.estagioId, tipo: v.estagio.tipoEtapa, chave: v.estagio.chave },
              para: { tipo: m.para.tipoEtapa, chave: m.para.chave },
              motivo: m.motivoSituacao,
              classe: m.classeMotivo,
              agora,
            }),
          }
        : {}),
    },
  });
  if (g.tim && (Object.keys(g.tim).length > 0 || !v.tim)) {
    await tx.credenciamentoTim.upsert({
      where: { credenciamentoId: v.id },
      create: { credenciamentoId: v.id, ...g.tim },
      update: g.tim,
    });
  }
  if (g.starlink && (Object.keys(g.starlink).length > 0 || !v.starlink)) {
    await tx.credenciamentoStarlink.upsert({
      where: { credenciamentoId: v.id },
      create: { credenciamentoId: v.id, ...g.starlink },
      update: g.starlink,
    });
  }
  if (m) {
    await tx.credenciamentoHistorico.create({
      data: {
        credenciamentoId: v.id,
        deEstagioId: v.estagioId,
        paraEstagioId: m.para.id,
        operacao: v.operacao,
        tipo: m.tipo,
        motivo: m.motivo,
        observacao: m.observacao,
        usuarioId: g.usuarioId,
        segundosNoEstagio: Math.max(0, Math.round((agora.getTime() - v.estagioDesde.getTime()) / 1000)),
      },
    });
  }
  if (auditoria.length > 0) {
    await tx.credenciamentoAuditoria.createMany({
      data: auditoria.map((d) => ({
        credenciamentoId: v.id,
        operacao: v.operacao,
        campo: d.campo,
        de: json(d.de),
        para: json(d.para),
        usuarioId: g.usuarioId,
      })),
    });
  }
}

/** Falha no ciclo não desfaz o movimento: a listagem e o agendador criam o ciclo depois. */
async function iniciarCicloSemFalhar(id: string) {
  try {
    await iniciarCiclos(id);
  } catch (erro) {
    console.error('[ciclo-parceiro] não iniciou o ciclo', erro);
  }
}

/**
 * TIM em Pós-cred que ficou "pronto": a venda é liberada sozinha (5 → 6), como
 * movimento AUTOMATICO em transação própria. Devolve o vínculo relido.
 */
async function liberarVendaSePronta(atual: VinculoDb, agora: Date): Promise<VinculoDb> {
  if (atual.operacao !== 'TIM') return atual;
  const chave = chaveAtual(atual);
  const campos = camposTim(atual);
  if (!chave || !deveLiberarVenda(chave as ChaveTim, campos)) return atual;
  const liberada = estagioDaChave(atual, 'TIM_VENDA_LIBERADA');
  if (!liberada?.ativa) return atual;
  await prisma.$transaction((tx) =>
    gravar(
      tx,
      atual,
      {
        usuarioId: null,
        movimento: {
          para: liberada,
          tipo: 'AUTOMATICO',
          motivo: 'Venda liberada automaticamente: parceiro pronto',
          observacao: null,
          motivoSituacao: null,
          classeMotivo: null,
        },
        tim: efeitosDeEntradaTim('TIM_VENDA_LIBERADA', campos, agora),
      },
      agora,
    ),
  );
  return recarregar(atual.id);
}

/**
 * Depois de gravar: liberação automática da venda (quando quem gravou pede —
 * mover para Pós-cred, ou edição em que o "pronto" virou verdadeiro), ciclo do
 * parceiro e o detalhe.
 */
async function concluir(id: string, agora: Date, liberarVenda: boolean): Promise<VinculoDetalhe> {
  const relido = await recarregar(id);
  const atual = liberarVenda ? await liberarVendaSePronta(relido, agora) : relido;
  // Ciclo do parceiro: a mesma regra de `iniciarCiclos` (TIM em Acompanhamento, Starlink em Pronto p/ venda).
  if (estagioIniciaCiclo(atual.estagio)) await iniciarCicloSemFalhar(id);
  return montarDetalhe(atual);
}

const texto = (v: string | null | undefined): string | null => v?.trim() || null;

/** Justificativa quando houver; senão o motivo da saída. Os dois juntos: o motivo vai para a observação. */
const textosDoHistorico = (justificativa: string | null, motivoSaida: string | null) => ({
  motivo: justificativa ?? motivoSaida,
  observacao: justificativa && motivoSaida ? motivoSaida : null,
});

/**
 * Avalia uma mudança de campos Starlink (travas já aplicadas em `depois`) e
 * lança o erro HTTP se não pode gravar. Perda: `motivoSituacao` e `classeMotivo`
 * acompanham o motivo da perda (Nurture/Descartado).
 */
function avaliarGravacaoStarlink(
  antes: CamposStarlink,
  depois: CamposStarlink,
  ctx: { justificativa: string | null; perfil: Role; nivel: NivelOperacao | undefined; motivo: string | null },
) {
  // Perdido sem motivo cairia em Descartado sem situação (ex.: limpar o motivo de um Nurture).
  if (perdaSemMotivo(depois)) throw erroHttp({ status: 400, code: 'EXIGE_MOTIVO', mensagem: 'Informe o motivo da perda' });
  const avaliacao = avaliarMudancaStarlink(antes, depois);
  const rotuloPerda = depois.motivoPerda ? MOTIVOS_PERDA[depois.motivoPerda].rotulo : null;
  const erro = errosDeMovimento(avaliacao, { ...ctx, motivo: ctx.motivo ?? rotuloPerda });
  if (erro) throw erroHttp(erro);
  if (avaliacao.resultado === 'PROIBIDO') throw proibido(avaliacao.motivo); // já tratado; estreita o tipo
  const perdido = depois.perdido === true && depois.motivoPerda != null;
  return {
    avaliacao,
    motivoSituacao: perdido ? (ctx.motivo ?? rotuloPerda) : null,
    classeMotivo: perdido ? MOTIVOS_PERDA[depois.motivoPerda!].classe : null,
  };
}

// ---------------------------------------------------------------------------
// Movimento
// ---------------------------------------------------------------------------

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

  let gravacao: Gravacao;

  if (operacao === 'TIM') {
    const de = chaveAtual(v);
    if (!de) throw proibido('A etapa atual não tem chave; sincronize a estrutura da esteira');
    const campos = camposTim(v);
    const avaliacao = avaliarMovimentoTim(de as ChaveTim, input.paraChave as ChaveTim, campos, {
      perfil,
      agora,
      antesDaSaida: chaveConhecida(v.estagioAntesDaSaida?.chave) ? (v.estagioAntesDaSaida!.chave as ChaveTim) : null,
    });
    const erro = errosDeMovimento(avaliacao, { justificativa, perfil, nivel, motivo });
    if (erro) throw erroHttp(erro);
    if (avaliacao.resultado === 'PROIBIDO') throw proibido(avaliacao.motivo); // já tratado; estreita o tipo
    gravacao = {
      usuarioId: usuario.id,
      movimento: {
        para,
        tipo: tipoDoHistorico(avaliacao),
        ...textosDoHistorico(justificativa, motivo),
        motivoSituacao: motivo,
        classeMotivo: null,
      },
      // Efeitos calculados sobre os campos de ANTES da gravação.
      tim: efeitosDeEntradaTim(input.paraChave as ChaveTim, campos, agora),
    };
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
    const { avaliacao, motivoSituacao, classeMotivo } = avaliarGravacaoStarlink(antes, depois, { justificativa, perfil, nivel, motivo });
    gravacao = {
      usuarioId: usuario.id,
      movimento: {
        para,
        tipo: tipoDoHistorico(avaliacao),
        ...textosDoHistorico(justificativa, motivoSituacao),
        motivoSituacao,
        classeMotivo,
      },
      starlink: depois,
    };
  }

  await prisma.$transaction((tx) => gravar(tx, v, gravacao, agora));
  // Entrar em Pós-cred já "pronto" libera a venda (5 → 6).
  return concluir(id, agora, true);
}

// ---------------------------------------------------------------------------
// Edição de campos
// ---------------------------------------------------------------------------

/** Responsável informado tem de ser usuário desta organização (a extensão do Prisma isola). */
async function exigirResponsavel(responsavelId: string | null | undefined) {
  if (!responsavelId) return;
  const existe = await prisma.user.findFirst({ where: { id: responsavelId }, select: { id: true } });
  if (!existe) throw badRequest('O responsável precisa ser um usuário desta organização');
}

export type EditarCamposInput = {
  campos: Partial<CamposTim> | Partial<CamposStarlink>;
  responsavelId?: string | null;
  observacoes?: string | null;
  justificativa?: string;
};

/**
 * Edita campos da operação, responsável e observações. TIM: matrícula só a partir
 * de Credenciamento OK; sistema indo a Sim sem vendedor ativo é exceção autorizada;
 * a etapa não muda (salvo a liberação automática da venda). Starlink: a etapa é
 * derivada dos campos — se muda, grava histórico igual a mover.
 */
export async function editarCampos(operacao: Operacao, id: string, input: EditarCamposInput): Promise<VinculoDetalhe> {
  const v = await carregarVisivel(operacao, id);
  await exigirResponsavel(input.responsavelId);

  const usuario = usuarioAtual();
  const perfil = usuario.perfil as Role;
  const nivel = (await acessoDoUsuarioAtual())[operacao];
  const agora = new Date();
  const justificativa = texto(input.justificativa);
  const vinculo: ColunasDoVinculo = semIndefinidos({
    responsavelId: input.responsavelId,
    observacoes: input.observacoes === undefined ? undefined : texto(input.observacoes),
  });
  const avisosExtras: Aviso[] = [];
  let gravacao: Gravacao;
  let liberarVenda = false;

  if (operacao === 'TIM') {
    const chave = chaveAtual(v) as ChaveTim | null;
    const antes = camposTim(v);
    const patch = semIndefinidos(input.campos as Partial<CamposTim>);
    const bloqueados = camposBloqueadosTim(chave, antes, patch);
    if (bloqueados.length > 0) {
      throw new AppError(400, 'CAMPO_BLOQUEADO', 'A matrícula SAPPDV só pode ser preenchida a partir de Credenciamento OK', {
        campos: bloqueados,
      });
    }
    const depois: CamposTim = { ...antes, ...patch };
    const vendedoresAtivos = await prisma.pdvVendedor.count({ where: { credenciamentoId: v.id, status: 'ATIVO' } });
    const pendencias = pendenciasDeCamposTim(antes, depois, vendedoresAtivos);
    if (pendencias.length > 0) {
      const erro = errosDeMovimento({ resultado: 'EXCECAO', pendencias }, { justificativa, perfil, nivel });
      if (erro) throw erroHttp(erro);
    }
    if (prontoDesfeito(chave, antes, depois)) avisosExtras.push('PRONTO_DESFEITO');
    liberarVenda = liberaVendaNaEdicao(chave, antes, depois);
    gravacao = { usuarioId: usuario.id, movimento: null, tim: patch, vinculo, justificativa: pendencias.length > 0 ? justificativa : null };
  } else {
    const antes = camposStarlink(v);
    const depois = aplicarTravas(antes, semIndefinidos(input.campos as Partial<CamposStarlink>));
    const { avaliacao, motivoSituacao, classeMotivo } = avaliarGravacaoStarlink(antes, depois, { justificativa, perfil, nivel, motivo: null });
    const destino = derivarEtapaStarlink(depois);
    const para = estagioDaChave(v, destino);
    if (!para) throw proibido(`A etapa ${etapa(destino).nome} não está configurada nesta esteira`);
    // Compara com o cache gravado: também corrige um `estagioId` desatualizado.
    const muda = para.id !== v.estagioId;
    // Perdido continua perdido na mesma coluna, com outro motivo: a situação acompanha o motivo.
    const trocouMotivo = !muda && motivoSituacao != null && depois.motivoPerda !== antes.motivoPerda;
    gravacao = {
      usuarioId: usuario.id,
      movimento: muda
        ? { para, tipo: tipoDoHistorico(avaliacao), ...textosDoHistorico(justificativa, motivoSituacao), motivoSituacao, classeMotivo }
        : null,
      starlink: depois,
      vinculo: trocouMotivo ? { ...vinculo, motivoSituacao, classeMotivo } : vinculo,
      justificativa: avaliacao.resultado === 'LIVRE' ? null : justificativa,
    };
  }

  // Nada mudou: não grava (nem conta como interação).
  if (!gravacao.movimento && auditoriaDaGravacao(v, gravacao).length === 0) return montarDetalhe(v);

  await prisma.$transaction((tx) => gravar(tx, v, gravacao, agora));
  const detalhe = await concluir(id, agora, liberarVenda);
  return avisosExtras.length > 0 ? { ...detalhe, avisos: [...detalhe.avisos, ...avisosExtras] } : detalhe;
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

/**
 * Nota do vínculo (por operação). Conta como interação; na Starlink, a primeira
 * nota carimba `primeiroContatoEm` — o card sai de Aguardando para Em atendimento,
 * gravado como MOVIMENTO pelo mesmo caminho de mover.
 */
export async function adicionarNota(operacao: Operacao, id: string, textoNota: string): Promise<VinculoDetalhe> {
  const v = await carregarVisivel(operacao, id);
  const usuario = usuarioAtual();
  const agora = new Date();
  let gravacao: Gravacao = { usuarioId: usuario.id, movimento: null };

  if (operacao === 'STARLINK') {
    const antes = camposStarlink(v);
    if (antes.primeiroContatoEm == null) {
      const depois = aplicarTravas(antes, { primeiroContatoEm: agora });
      const para = estagioDaChave(v, derivarEtapaStarlink(depois));
      gravacao = {
        ...gravacao,
        starlink: depois,
        movimento:
          para && para.id !== v.estagioId
            ? {
                para,
                tipo: 'MOVIMENTO',
                motivo: 'Primeiro contato registrado por nota',
                observacao: null,
                motivoSituacao: null,
                classeMotivo: null,
              }
            : null,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.credenciamentoNota.create({ data: { credenciamentoId: v.id, autorId: usuario.id, texto: textoNota } });
    await gravar(tx, v, gravacao, agora);
  });
  // Nota não libera a venda: o "pronto" não muda.
  return concluir(id, agora, false);
}

// ---------------------------------------------------------------------------
// Vendedores do PDV (só TIM)
// ---------------------------------------------------------------------------

/** Omitido na atualização mantém o valor atual; `null` explícito limpa (ver `mesclarVendedor`). */
export type SalvarVendedorInput = { id?: string; nome: string; cpf?: string | null; telefone?: string | null; status?: StatusVendedor };

const dadosDoVendedor = (p: DadosVendedor): DadosVendedor => ({ nome: p.nome, cpf: p.cpf, telefone: p.telefone, status: p.status });

/** Grava o vendedor (novo se `antes` é nulo) com a auditoria, na mesma transação. */
async function gravarVendedor(v: VinculoDb, vendedorId: string, antes: DadosVendedor | null, depois: DadosVendedor) {
  const auditoriaExtra = diferencasDoVendedor(vendedorId, antes, depois);
  if (auditoriaExtra.length === 0) return;
  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    // `tim: {}` cria a linha 1:1 se faltar (o vendedor referencia `credenciamentos_tim`).
    await gravar(tx, v, { usuarioId: usuarioAtual().id, movimento: null, tim: {}, auditoriaExtra }, agora);
    if (antes) await tx.pdvVendedor.update({ where: { id: vendedorId }, data: depois });
    else await tx.pdvVendedor.create({ data: { id: vendedorId, credenciamentoId: v.id, ...depois } });
  });
}

async function vendedorDoVinculo(v: VinculoDb, vendedorId: string) {
  const vendedor = await prisma.pdvVendedor.findFirst({ where: { id: vendedorId, credenciamentoId: v.id } });
  if (!vendedor) throw notFound('Vendedor não encontrado');
  return vendedor;
}

/** Cria (sem `id`) ou atualiza um vendedor do PDV. */
export async function salvarVendedor(operacao: 'TIM', id: string, dados: SalvarVendedorInput): Promise<VinculoDetalhe> {
  const v = await carregarVisivel(operacao, id);
  if (dados.id) {
    const atual = dadosDoVendedor(await vendedorDoVinculo(v, dados.id));
    await gravarVendedor(v, dados.id, atual, mesclarVendedor(atual, dados));
  } else {
    await gravarVendedor(v, randomUUID(), null, mesclarVendedor(null, dados));
  }
  return montarDetalhe(await recarregar(id));
}

/** "Remover" vendedor: marca INATIVO, preservando o histórico. */
export async function inativarVendedor(operacao: 'TIM', id: string, vendedorId: string): Promise<VinculoDetalhe> {
  const v = await carregarVisivel(operacao, id);
  const atual = await vendedorDoVinculo(v, vendedorId);
  await gravarVendedor(v, atual.id, dadosDoVendedor(atual), { ...dadosDoVendedor(atual), status: 'INATIVO' });
  return montarDetalhe(await recarregar(id));
}

// ---------------------------------------------------------------------------
// Importação por planilha (spec 6.4)
// ---------------------------------------------------------------------------

export type { EntradaDeImportacao } from './importacao';
export type ResultadoDaImportacao = 'CRIADO' | 'ATUALIZADO';

/** O que vale para o lote inteiro: calculado uma vez por requisição, não por linha. */
export type ContextoDeImportacao = {
  operacao: Operacao;
  previa: boolean;
  funil: FunilDaOperacao;
  carteira: Prisma.CredenciamentoWhereInput;
  usuarioId: string | null;
  /** Responsáveis já conferidos neste lote (defesa em profundidade sem repetir consulta). */
  responsaveisConferidos: Set<string>;
};

export async function contextoDeImportacao(operacao: Operacao, previa: boolean): Promise<ContextoDeImportacao> {
  const [funil, carteira] = await Promise.all([funilDaOperacao(operacao), filtroDe(politicaCredenciamentos)]);
  return { operacao, previa, funil, carteira, usuarioId: usuarioAtualOuNulo()?.id ?? null, responsaveisConferidos: new Set() };
}

const gravacaoDoPlano = (plano: PlanoDeImportacao<EstagioDb>, usuarioId: string | null): Gravacao => ({
  usuarioId,
  movimento: plano.movimento
    ? {
        para: plano.movimento.para,
        tipo: 'IMPORTACAO',
        motivo: MOTIVO_IMPORTACAO,
        observacao: plano.movimento.motivoSituacao,
        motivoSituacao: plano.movimento.motivoSituacao,
        classeMotivo: plano.movimento.classeMotivo,
      }
    : null,
  ...(plano.tim ? { tim: plano.tim } : {}),
  ...(plano.starlink ? { starlink: plano.starlink } : {}),
  vinculo: plano.vinculo,
});

const pontoDoVinculo = (v: VinculoDb): PontoDePartida<EstagioDb> => ({
  operacao: v.operacao,
  chave: chaveAtual(v),
  estagioId: v.estagioId,
  estagios: v.funil.estagios,
  tim: camposTim(v),
  starlink: camposStarlink(v),
});

/**
 * Vínculo DESTA operação do parceiro, na carteira do usuário: pelo CNPJ; sem
 * CNPJ, pelo CPF e depois pelo telefone normalizado (spec 6.4). O vínculo da
 * outra operação nunca é tocado.
 */
async function acharVinculoDoParceiro(ctx: ContextoDeImportacao, p: EntradaDeImportacao['parceiro']): Promise<VinculoDb | null> {
  const buscar = (where: Prisma.CredenciamentoWhereInput) =>
    prisma.credenciamento.findFirst({
      where: { AND: [ctx.carteira, { operacao: ctx.operacao, arquivadoEm: null }, where] },
      include: inclusao,
      orderBy: { criadoEm: 'asc' },
    });
  if (p.cnpj) return buscar({ conta: { is: { cnpj: p.cnpj } } });
  if (p.cpf) {
    const porCpf = await buscar({ contato: { cpf: p.cpf } });
    if (porCpf) return porCpf;
  }
  if (p.telefone) {
    const normalizado = numeroNormalizado(p.telefone);
    return buscar({ contato: normalizado ? { telefoneNormalizado: normalizado } : { telefone: p.telefone } });
  }
  return null;
}

/** Grava o plano (se algo muda) na transação dada. Devolve se houve movimento. */
async function gravarPlano(tx: ClienteDeEscrita, v: VinculoDb, g: Gravacao, agora: Date): Promise<boolean> {
  if (!g.movimento && auditoriaDaGravacao(v, g).length === 0) return false;
  await gravar(tx, v, g, agora);
  return g.movimento != null;
}

/**
 * Importa uma linha: cria ou atualiza o vínculo desta operação (idempotente).
 * Na prévia faz as mesmas leituras e validações e não grava nada. Erro de
 * regra (etapa impossível, saída TIM, CNPJ fora da carteira…) é lançado: é o
 * erro da linha. O cadastro central de um parceiro existente não é alterado.
 */
export async function importarVinculo(ctx: ContextoDeImportacao, entrada: EntradaDeImportacao): Promise<ResultadoDaImportacao> {
  const { operacao, funil, usuarioId } = ctx;
  const agora = new Date();
  // O id vem de `usuariosCitados` (consulta sob o tenant); conferir de novo é defesa em profundidade.
  if (entrada.responsavelId && !ctx.responsaveisConferidos.has(entrada.responsavelId)) {
    await exigirUsuarioDaOrganizacao(entrada.responsavelId);
    ctx.responsaveisConferidos.add(entrada.responsavelId);
  }

  const existente = await acharVinculoDoParceiro(ctx, entrada.parceiro);
  if (existente) {
    const gravacao = gravacaoDoPlano(planejarImportacao(pontoDoVinculo(existente), entrada, agora), usuarioId);
    if (!ctx.previa) {
      const moveu = await prisma.$transaction((tx) => gravarPlano(tx, existente, gravacao, agora));
      if (moveu && estagioIniciaCiclo(gravacao.movimento!.para)) await iniciarCicloSemFalhar(existente.id);
    }
    return 'ATUALIZADO';
  }

  const { nome, cnpj, cpf, telefone, cidade, uf } = entrada.parceiro;
  if (!nome) throw badRequest('Informe o nome do parceiro para cadastrá-lo');
  const primeira = etapaInicial(operacao, funil);
  // Planeja sobre o vínculo como ele nasce, antes de criar qualquer coisa.
  const inicio: PontoDePartida<EstagioDb> = {
    operacao,
    chave: ETAPAS[operacao][0]!.chave,
    estagioId: primeira.id,
    estagios: funil.estagios,
    tim: { ...CAMPOS_TIM_VAZIO, origem: 'PLANILHA' },
    starlink: CAMPOS_STARLINK_VAZIO,
  };
  const planoInicial = planejarImportacao(inicio, entrada, agora);

  const input: CriarVinculoInput = {
    nome,
    empresa: cnpj ? nome : undefined,
    cnpj,
    cpf,
    telefone,
    cidade,
    uf,
    responsavelId: entrada.responsavelId,
  };
  const plano = await planejarParceiro(input);
  await conferirSemVinculo(operacao, plano);
  if (ctx.previa) return 'CRIADO';

  // Vínculo, campos e etapa numa transação só: erro não deixa card pela metade.
  const id = await criarComPlano(operacao, funil.id, primeira.id, plano, input, {
    tipoHistorico: 'IMPORTACAO',
    origemTim: 'PLANILHA',
    depoisDeCriar: async (tx, novoId) => {
      const criado = await tx.credenciamento.findUniqueOrThrow({ where: { id: novoId }, include: inclusao });
      // Replaneja sobre o vínculo gravado (mesmo resultado, com os campos reais para a auditoria).
      await gravarPlano(tx, criado, gravacaoDoPlano(planejarImportacao(pontoDoVinculo(criado), entrada, agora), usuarioId), agora);
    },
  });
  if (planoInicial.movimento && estagioIniciaCiclo(planoInicial.movimento.para)) await iniciarCicloSemFalhar(id);
  return 'CRIADO';
}
