import { Router } from 'express';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { notFound, unauthorized } from '../../lib/errors';
import { assinaturaValida, caminhoDe, podeExibirInline, tipoPorChave } from '../../lib/storage';
import { prisma } from '../../lib/prisma';

export const arquivosRoutes = Router();

/**
 * Arquivo servido tem de estar referenciado por um anexo de protocolo ou por uma
 * mensagem. Arquivo orfao no disco — upload interrompido, registro apagado — nao
 * e servido.
 */
async function registroDe(url: string) {
  const anexo = await prisma.ticketAttachment.findFirst({
    where: { url },
    select: { tipo: true, nome: true },
  });
  if (anexo) return { tipo: anexo.tipo, nome: anexo.nome };

  const mensagem = await prisma.message.findFirst({ where: { anexoUrl: url }, select: { id: true } });
  return mensagem ? { tipo: null, nome: null } : null;
}

arquivosRoutes.get(
  '/:ano/:mes/:nome',
  asyncHandler(async (req, res) => {
    const chave = `${param(req, 'ano')}/${param(req, 'mes')}/${param(req, 'nome')}`;
    const t = typeof req.query.t === 'string' ? req.query.t : undefined;
    if (!assinaturaValida(chave, t)) throw unauthorized('Link do arquivo invalido ou expirado');

    const caminho = caminhoDe(chave);
    const info = await stat(caminho).catch(() => null);
    if (!info?.isFile()) throw notFound('Arquivo nao encontrado');

    const registro = await registroDe(`/api/arquivos/${chave}`);
    if (!registro) throw notFound('Arquivo nao encontrado');

    const tipo = registro.tipo ?? tipoPorChave(chave);
    const nome = registro.nome ?? basename(caminho);

    // nosniff + Content-Disposition: um arquivo enviado por terceiro nunca deve
    // ser interpretado pelo navegador como algo diferente do que foi declarado.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', tipo);
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `${podeExibirInline(tipo) ? 'inline' : 'attachment'}; filename="${nome.replace(/"/g, '')}"`,
    );

    createReadStream(caminho).pipe(res);
  }),
);
