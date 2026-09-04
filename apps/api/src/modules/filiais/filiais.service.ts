import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { z } from 'zod';
import type { atualizarFilialSchema, criarFilialSchema } from './filiais.schemas';

function serialize(filial: {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  ativa: boolean;
  criadoEm: Date;
}) {
  return {
    id: filial.id,
    nome: filial.nome,
    cidade: filial.cidade,
    uf: filial.uf,
    ativa: filial.ativa,
    criadoEm: filial.criadoEm,
  };
}

export async function listarFiliais() {
  const filiais = await prisma.filial.findMany({ orderBy: { nome: 'asc' } });
  return filiais.map(serialize);
}

export async function criarFilial(input: z.infer<typeof criarFilialSchema>) {
  const existente = await prisma.filial.findFirst({ where: { nome: input.nome } });
  if (existente) throw conflict('Ja existe uma filial com este nome');

  const filial = await prisma.filial.create({ data: input });
  return serialize(filial);
}

export async function atualizarFilial(id: string, input: z.infer<typeof atualizarFilialSchema>) {
  const atual = await prisma.filial.findUnique({ where: { id } });
  if (!atual) throw notFound('Filial nao encontrada');

  if (input.nome && input.nome !== atual.nome) {
    const nomeEmUso = await prisma.filial.findFirst({ where: { nome: input.nome } });
    if (nomeEmUso) throw conflict('Ja existe uma filial com este nome');
  }

  const filial = await prisma.filial.update({ where: { id }, data: input });
  return serialize(filial);
}

/**
 * A filial tem de existir NESTA organizacao. Sem esta checagem, um `filialId`
 * invalido ou de outra organizacao bateria direto no FK do Postgres e viraria
 * 500 em vez de um erro claro — mesma classe de furo ja corrigida no item 5.1
 * (produtos-instalados) e ja evitada aqui com `gestorId` em `users.service.ts`.
 */
export async function exigirFilialDaOrganizacao(filialId: string) {
  const filial = await prisma.filial.findFirst({ where: { id: filialId } });
  if (!filial) throw notFound('Filial nao encontrada');
}

export async function removerFilial(id: string) {
  const atual = await prisma.filial.findUnique({ where: { id } });
  if (!atual) throw notFound('Filial nao encontrada');
  // SetNull nas contas e usuarios: remover a filial nao apaga quem estava
  // classificado nela, so tira a classificacao.
  await prisma.filial.delete({ where: { id } });
}
