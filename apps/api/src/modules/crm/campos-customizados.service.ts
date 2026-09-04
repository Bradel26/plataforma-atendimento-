import type { CampoCustomizado, EntidadeVisao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { desserializarValor, gerarChave, validarValorCampo } from './campos-customizados';
import type { atualizarCampoCustomizadoSchema, criarCampoCustomizadoSchema } from './campos-customizados.schemas';
import type { z } from 'zod';

function serializeDefinicao(c: CampoCustomizado) {
  return {
    id: c.id,
    entidade: c.entidade,
    nome: c.nome,
    chave: c.chave,
    tipo: c.tipo,
    opcoes: c.opcoes,
    obrigatorio: c.obrigatorio,
    valorUnico: c.valorUnico,
    secao: c.secao,
    ordem: c.ordem,
    ativo: c.ativo,
    criadoEm: c.criadoEm,
  };
}

export async function listarDefinicoes(entidade?: EntidadeVisao) {
  const campos = await prisma.campoCustomizado.findMany({
    where: entidade ? { entidade } : {},
    orderBy: [{ entidade: 'asc' }, { ordem: 'asc' }, { criadoEm: 'asc' }],
  });
  return campos.map(serializeDefinicao);
}

export async function criarDefinicao(input: z.infer<typeof criarCampoCustomizadoSchema>) {
  const chave = gerarChave(input.nome);
  if (!chave) throw badRequest('Nome nao gera uma chave valida');

  const existente = await prisma.campoCustomizado.findFirst({ where: { entidade: input.entidade, chave } });
  if (existente) throw conflict('Ja existe um campo com um nome equivalente nesta entidade');

  const campo = await prisma.campoCustomizado.create({
    data: {
      entidade: input.entidade,
      nome: input.nome,
      chave,
      tipo: input.tipo,
      opcoes: input.tipo === 'SELECAO' ? (input.opcoes ?? []) : [],
      obrigatorio: input.obrigatorio,
      valorUnico: input.valorUnico,
      secao: input.secao,
      ordem: input.ordem,
    },
  });
  return serializeDefinicao(campo);
}

export async function atualizarDefinicao(id: string, input: z.infer<typeof atualizarCampoCustomizadoSchema>) {
  const atual = await prisma.campoCustomizado.findUnique({ where: { id } });
  if (!atual) throw notFound('Campo customizado nao encontrado');

  if (input.opcoes && atual.tipo !== 'SELECAO') {
    throw badRequest('Opcoes so se aplicam a campos do tipo SELECAO');
  }

  const campo = await prisma.campoCustomizado.update({
    where: { id },
    data: {
      nome: input.nome,
      opcoes: input.opcoes,
      obrigatorio: input.obrigatorio,
      secao: input.secao,
      ordem: input.ordem,
      ativo: input.ativo,
    },
  });
  return serializeDefinicao(campo);
}

export async function removerDefinicao(id: string) {
  const atual = await prisma.campoCustomizado.findUnique({ where: { id } });
  if (!atual) throw notFound('Campo customizado nao encontrado');
  // Cascade apaga os valores gravados junto — nao ha o que fazer com valor
  // orfao de um campo que nao existe mais.
  await prisma.campoCustomizado.delete({ where: { id } });
}

/* ── Valores por registro (conta, lead ou oportunidade) ───────────────────── */

async function valoresBrutosDoRegistro(entidade: EntidadeVisao, registroId: string) {
  switch (entidade) {
    case 'CONTA':
      return prisma.valorCampoCustomizadoConta.findMany({ where: { contaId: registroId } });
    case 'LEAD':
      return prisma.valorCampoCustomizadoLead.findMany({ where: { leadId: registroId } });
    case 'OPORTUNIDADE':
      return prisma.valorCampoCustomizadoOportunidade.findMany({ where: { oportunidadeId: registroId } });
  }
}

async function upsertValor(entidade: EntidadeVisao, campoCustomizadoId: string, registroId: string, valor: string) {
  switch (entidade) {
    case 'CONTA':
      return prisma.valorCampoCustomizadoConta.upsert({
        where: { campoCustomizadoId_contaId: { campoCustomizadoId, contaId: registroId } },
        create: { campoCustomizadoId, contaId: registroId, valor },
        update: { valor },
      });
    case 'LEAD':
      return prisma.valorCampoCustomizadoLead.upsert({
        where: { campoCustomizadoId_leadId: { campoCustomizadoId, leadId: registroId } },
        create: { campoCustomizadoId, leadId: registroId, valor },
        update: { valor },
      });
    case 'OPORTUNIDADE':
      return prisma.valorCampoCustomizadoOportunidade.upsert({
        where: { campoCustomizadoId_oportunidadeId: { campoCustomizadoId, oportunidadeId: registroId } },
        create: { campoCustomizadoId, oportunidadeId: registroId, valor },
        update: { valor },
      });
  }
}

async function removerValor(entidade: EntidadeVisao, campoCustomizadoId: string, registroId: string) {
  switch (entidade) {
    case 'CONTA':
      return prisma.valorCampoCustomizadoConta.deleteMany({ where: { campoCustomizadoId, contaId: registroId } });
    case 'LEAD':
      return prisma.valorCampoCustomizadoLead.deleteMany({ where: { campoCustomizadoId, leadId: registroId } });
    case 'OPORTUNIDADE':
      return prisma.valorCampoCustomizadoOportunidade.deleteMany({
        where: { campoCustomizadoId, oportunidadeId: registroId },
      });
  }
}

/**
 * Existe OUTRO registro com este valor neste campo? Sustenta `valorUnico`.
 *
 * `exceto` ausente (criacao, sem registro proprio ainda) checa contra
 * qualquer registro; presente (edicao) exclui o proprio registro da busca —
 * sem isso, salvar de novo o mesmo valor no mesmo registro se acusaria como
 * duplicata dele mesmo.
 */
async function existeDuplicado(
  entidade: EntidadeVisao,
  campoCustomizadoId: string,
  valor: string,
  exceto?: string,
) {
  switch (entidade) {
    case 'CONTA':
      return Boolean(
        await prisma.valorCampoCustomizadoConta.findFirst({
          where: { campoCustomizadoId, valor, ...(exceto ? { contaId: { not: exceto } } : {}) },
        }),
      );
    case 'LEAD':
      return Boolean(
        await prisma.valorCampoCustomizadoLead.findFirst({
          where: { campoCustomizadoId, valor, ...(exceto ? { leadId: { not: exceto } } : {}) },
        }),
      );
    case 'OPORTUNIDADE':
      return Boolean(
        await prisma.valorCampoCustomizadoOportunidade.findFirst({
          where: { campoCustomizadoId, valor, ...(exceto ? { oportunidadeId: { not: exceto } } : {}) },
        }),
      );
  }
}

/** Campos + valor atual (ou nulo) de um registro, na ordem de exibicao. */
export async function valoresDoRegistro(entidade: EntidadeVisao, registroId: string) {
  const definicoes = await prisma.campoCustomizado.findMany({
    where: { entidade },
    orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
  });
  if (definicoes.length === 0) return [];

  const gravados = await valoresBrutosDoRegistro(entidade, registroId);
  const porCampo = new Map(gravados.map((v) => [v.campoCustomizadoId, v.valor]));

  return definicoes.map((d) => {
    const bruto = porCampo.get(d.id);
    return {
      id: d.id,
      nome: d.nome,
      chave: d.chave,
      tipo: d.tipo,
      opcoes: d.opcoes,
      obrigatorio: d.obrigatorio,
      secao: d.secao,
      ordem: d.ordem,
      ativo: d.ativo,
      valor: bruto === undefined ? null : desserializarValor(d.tipo, bruto),
    };
  });
}

type ValorPreparado = { campoId: string; valor: string };

/**
 * Valida os valores de campos customizados ANTES de tocar no registro dono.
 *
 * `brutos` ausente (`undefined`) e diferente de objeto vazio: ausente nao mexe
 * em nada dos valores ja gravados (mesmo padrao de `tags` em `accounts.routes`
 * — PATCH de outro campo nao pode apagar campo customizado em silencio);
 * `{ chave: null }` apaga o valor daquela chave.
 *
 * Em criacao (`registroId` nulo), todo campo ativo e obrigatorio da entidade
 * precisa vir preenchido — nao ha valor anterior para herdar. A checagem de
 * `valorUnico` roda aqui, ANTES de criar ou atualizar o registro: se falhar,
 * a rota nao chega a escrever nada, e nao sobra lead/conta/oportunidade
 * orfao de campo obrigatorio nem update pela metade.
 */
export async function prepararValoresDoRegistro(
  entidade: EntidadeVisao,
  registroId: string | null,
  brutos: Record<string, unknown> | undefined,
): Promise<{ paraGravar: ValorPreparado[]; paraRemover: string[] }> {
  const definicoes = await prisma.campoCustomizado.findMany({ where: { entidade, ativo: true } });
  const porChave = new Map(definicoes.map((d) => [d.chave, d]));
  const criando = registroId === null;

  if (brutos === undefined) {
    if (criando) {
      const faltando = definicoes.filter((d) => d.obrigatorio).map((d) => d.nome);
      if (faltando.length) throw badRequest(`Campo(s) obrigatorio(s) faltando: ${faltando.join(', ')}`);
    }
    return { paraGravar: [], paraRemover: [] };
  }

  const desconhecidas = Object.keys(brutos).filter((k) => !porChave.has(k));
  if (desconhecidas.length) {
    throw badRequest(`Campo(s) customizado(s) desconhecido(s) ou inativo(s): ${desconhecidas.join(', ')}`);
  }

  if (criando) {
    const faltando = definicoes
      .filter((d) => d.obrigatorio && (!(d.chave in brutos) || brutos[d.chave] === null))
      .map((d) => d.nome);
    if (faltando.length) throw badRequest(`Campo(s) obrigatorio(s) faltando: ${faltando.join(', ')}`);
  }

  const paraGravar: ValorPreparado[] = [];
  const paraRemover: string[] = [];

  for (const [chave, bruto] of Object.entries(brutos)) {
    const def = porChave.get(chave)!;

    if (bruto === null) {
      if (def.obrigatorio) throw badRequest(`${def.nome} e obrigatorio e nao pode ficar vazio`);
      paraRemover.push(def.id);
      continue;
    }

    const resultado = validarValorCampo(def.tipo, def.opcoes, bruto);
    if (!resultado.ok) throw badRequest(`${def.nome}: ${resultado.erro}`);

    if (def.valorUnico && (await existeDuplicado(entidade, def.id, resultado.valor, registroId ?? undefined))) {
      throw conflict(`Ja existe um registro com "${def.nome}" = "${resultado.valor}"`);
    }

    paraGravar.push({ campoId: def.id, valor: resultado.valor });
  }

  return { paraGravar, paraRemover };
}

/** Aplica o que `prepararValoresDoRegistro` ja validou. So gravacao, sem checagem. */
export async function confirmarValoresDoRegistro(
  entidade: EntidadeVisao,
  registroId: string,
  { paraGravar, paraRemover }: { paraGravar: ValorPreparado[]; paraRemover: string[] },
) {
  for (const campoId of paraRemover) await removerValor(entidade, campoId, registroId);
  for (const { campoId, valor } of paraGravar) await upsertValor(entidade, campoId, registroId, valor);
}
