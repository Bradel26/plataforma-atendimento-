import { Router } from 'express';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { AppError, notFound, unauthorized } from '../../lib/errors';
import { ORGANIZACAO_INICIAL, comOrganizacao } from '../../lib/tenant';
import { verifyAccessToken } from '../../lib/tokens';
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
  if (mensagem) return { tipo: null, nome: null };

  // Gravacao de chamada tambem e arquivo servido por aqui.
  const chamada = await prisma.call.findFirst({ where: { gravacaoUrl: url }, select: { id: true } });
  return chamada ? { tipo: null, nome: null } : null;
}

/**
 * Serve o arquivo por link assinado.
 *
 * Duas rotas para a mesma coisa: a nova, com a organizacao no caminho, e a
 * antiga sem prefixo — os arquivos que ja estao no disco pertencem a
 * organizacao inicial, e recusa-los seria perder anexo de conversa real.
 *
 * A rota e publica porque o `<img src>` do painel e do webchat nao manda header:
 * a assinatura E a credencial, e ela cobre a chave inteira, incluindo a
 * organizacao. Um link de uma empresa nao pode ser reescrito para virar link de
 * outra sem quebrar a assinatura.
 *
 * Quando VEM sessao, ela e conferida: token de outra organizacao recebe 404,
 * mesmo com o link correto em maos. E o caso que o `smoke:tenant` exercita.
 */
const servir = asyncHandler(async (req, res) => {
    const org = typeof req.params.org === 'string' ? req.params.org : null;
    const chave = [org, param(req, 'ano'), param(req, 'mes'), param(req, 'nome')]
      .filter(Boolean)
      .join('/');
    const t = typeof req.query.t === 'string' ? req.query.t : undefined;
    if (!assinaturaValida(chave, t)) throw unauthorized('Link do arquivo invalido ou expirado');

    // A organizacao sai da propria chave: sem isso a rota nao teria contexto e
    // toda consulta abaixo lancaria. Quem escolheu a chave foi a assinatura, nao
    // quem pede.
    const organizacaoDoArquivo = org ?? ORGANIZACAO_INICIAL;

    // Sessao presente e de outra organizacao: 404, e nao 403 — dizer "proibido"
    // confirmaria que o arquivo existe.
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const usuario = verifyAccessToken(header.slice('Bearer '.length).trim());
        if (usuario.org !== organizacaoDoArquivo) throw notFound('Arquivo nao encontrado');
      } catch (err) {
        // Token invalido nao impede o acesso por link assinado — ele so nao
        // acrescenta permissao. Mas o 404 de organizacao errada tem de subir.
        if (err instanceof AppError && err.status === 404) throw err;
      }
    }

    return comOrganizacao(organizacaoDoArquivo, async () => {

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
    });
});

arquivosRoutes.get('/:org/:ano/:mes/:nome', servir);
arquivosRoutes.get('/:ano/:mes/:nome', servir);
