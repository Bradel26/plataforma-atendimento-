import { readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { env } from '../../env';
import { prisma } from '../../lib/prisma';
import { remover } from '../../lib/storage';

/** Chave do storage a partir da URL guardada no banco; nulo se for link externo. */
export const chaveDe = (url: string | null) =>
  url?.startsWith('/api/arquivos/') ? url.slice('/api/arquivos/'.length) : null;

/**
 * Apaga do disco os arquivos das mensagens informadas.
 *
 * Apagar o registro sem apagar o arquivo deixa dado pessoal no disco depois de
 * o titular ter pedido eliminacao — que e exatamente o que a politica promete
 * nao fazer.
 */
export async function apagarArquivosDeMensagens(conversaIds: string[]) {
  if (conversaIds.length === 0) return 0;

  const mensagens = await prisma.message.findMany({
    where: { conversaId: { in: conversaIds }, anexoUrl: { not: null } },
    select: { anexoUrl: true },
  });

  let apagados = 0;
  for (const { anexoUrl } of mensagens) {
    const chave = chaveDe(anexoUrl);
    if (!chave) continue;
    await remover(chave);
    apagados++;
  }
  return apagados;
}

export async function apagarArquivosDeProtocolos(ticketIds: string[]) {
  if (ticketIds.length === 0) return 0;

  const anexos = await prisma.ticketAttachment.findMany({
    where: { ticketId: { in: ticketIds } },
    select: { url: true },
  });

  let apagados = 0;
  for (const { url } of anexos) {
    const chave = chaveDe(url);
    if (!chave) continue;
    await remover(chave);
    apagados++;
  }
  return apagados;
}

/**
 * Arquivos no disco que nenhum registro referencia — sobra de upload
 * interrompido ou de registro apagado por outro caminho. Sem esta varredura o
 * storage guarda dado pessoal que o banco jura ter esquecido.
 */
export async function varrerOrfaos(simulacao: boolean) {
  const raiz = resolve(process.cwd(), env.STORAGE_DIR);

  const entradas = await readdir(raiz, { recursive: true, withFileTypes: true }).catch(() => []);
  const chaves = entradas
    .filter((e) => e.isFile())
    // parentPath e relativo a raiz: "2026/08" no Windows vem com barra invertida.
    .map((e) => join(e.parentPath ?? raiz, e.name).slice(raiz.length + 1).split(sep).join('/'));

  if (chaves.length === 0) return 0;

  const urls = chaves.map((c) => `/api/arquivos/${c}`);
  const [mensagens, anexos] = await Promise.all([
    prisma.message.findMany({ where: { anexoUrl: { in: urls } }, select: { anexoUrl: true } }),
    prisma.ticketAttachment.findMany({ where: { url: { in: urls } }, select: { url: true } }),
  ]);

  const referenciados = new Set([
    ...mensagens.map((m) => m.anexoUrl),
    ...anexos.map((a) => a.url),
  ]);

  const orfaos = urls.filter((u) => !referenciados.has(u));
  if (!simulacao) {
    for (const url of orfaos) {
      const chave = chaveDe(url);
      if (chave) await remover(chave);
    }
  }
  return orfaos.length;
}
