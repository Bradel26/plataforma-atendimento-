import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { limitar } from '../../http/middleware/rate-limit';
import { validateBody } from '../../http/middleware/validate';
import { notFound, unauthorized } from '../../lib/errors';
import { organizacaoPorSlug } from '../../lib/organizacao';
import { comOrganizacao } from '../../lib/tenant';
import { verifyWebchatToken } from '../../lib/tokens';
import { historico, iniciarSessao, mensagemDoCliente } from './webchat.service';

export const webchatRoutes = Router();

const iniciarSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.string().email('Informe um email valido').optional(),
  telefone: z.string().trim().min(8).max(20).optional(),
  assunto: z.string().trim().max(140).optional(),
  filaId: z.string().uuid().optional(),
  /**
   * Aceite do aviso de privacidade. Obrigatorio: o visitante digita nome,
   * telefone e o problema dele antes de existir qualquer relacao — sem aviso na
   * entrada, a coleta comeca sem o titular saber para que.
   */
  aceiteLgpd: z.literal(true, { message: 'E necessario aceitar o aviso de privacidade' }),
  /** Slug da organizacao dona do widget. Ausente = organizacao inicial. */
  organizacao: z.string().trim().min(1).max(60).optional(),
});

const mensagemSchema = z.object({
  conteudo: z.string().trim().min(1, 'Escreva uma mensagem').max(4000),
});

/** Le o token de sessao do visitante (header Authorization: Bearer <sessaoToken>). */
function sessao(req: { headers: { authorization?: string } }) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized('Sessao do webchat ausente');
  return verifyWebchatToken(header.slice('Bearer '.length).trim());
}

/** Publico: o visitante nao tem conta na plataforma. */
webchatRoutes.post(
  '/sessoes',
  // Rota publica que cria contato e conversa: sem limite, um script enche a
  // fila de atendimento com lixo.
  limitar({ nome: 'webchat-sessao', janelaSegundos: 600, maximo: 20 }),
  validateBody(iniciarSchema),
  asyncHandler(async (req, res) => {
    const organizacaoId = await organizacaoPorSlug(req.body.organizacao);
    res
      .status(201)
      .json(await comOrganizacao(organizacaoId, () => iniciarSessao(req.body)));
  }),
);

webchatRoutes.get(
  '/conversa',
  asyncHandler(async (req, res) => {
    const { conversaId, org } = sessao(req);
    res.json({ conversa: await comOrganizacao(org, () => historico(conversaId)) });
  }),
);

webchatRoutes.post(
  '/mensagens',
  limitar({ nome: 'webchat-mensagem', janelaSegundos: 60, maximo: 60 }),
  validateBody(mensagemSchema),
  asyncHandler(async (req, res) => {
    const { conversaId, org } = sessao(req);
    res.status(201).json({
      mensagem: await comOrganizacao(org, () => mensagemDoCliente(conversaId, req.body.conteudo)),
    });
  }),
);
