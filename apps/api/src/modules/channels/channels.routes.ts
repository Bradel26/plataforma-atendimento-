import { Router } from 'express';
import { z } from 'zod';
import type { Channel } from '@prisma/client';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { organizacaoAtual } from '../../lib/tenant';
import {
  CANAIS_EXTERNOS,
  listarCanais,
  obterConfig,
  salvarCanal,
  type CanalExterno,
} from './channels.service';
import { AVISO_NAO_OFICIAL, modoEfetivo } from './whatsapp.modo';
import { estadoDaPonte } from './whatsapp.ponte';
import { estadoDaIa, salvarIa } from '../bots/ia.service';

export const channelsRoutes = Router();

channelsRoutes.use(requireAuth);

const salvarSchema = z
  .object({
    ativo: z.boolean().optional(),
    phoneNumberId: z.string().trim().max(60).nullable().optional(),
    wabaId: z.string().trim().max(60).nullable().optional(),
    pageId: z.string().trim().max(60).nullable().optional(),
    igUserId: z.string().trim().max(60).nullable().optional(),
    accessToken: z.string().trim().min(10).nullable().optional(),
    appSecret: z.string().trim().min(10).nullable().optional(),
    verifyToken: z.string().trim().min(6).nullable().optional(),
    filaId: z.string().uuid().nullable().optional(),
    /*
     * WhatsApp nos dois modos.
     *
     * `modo` nulo limpa a escolha (volta ao oficial, que e o efetivo do nulo).
     * O segredo da ponte tem minimo de 16 caracteres pelo mesmo motivo do
     * segredo da IA: e uma chave HMAC, e chave curta se quebra por forca bruta
     * enquanto ninguem olha.
     */
    modo: z.enum(['OFICIAL', 'NAO_OFICIAL']).nullable().optional(),
    ponteUrl: z.string().trim().url().max(300).nullable().optional(),
    ponteToken: z.string().trim().min(8).max(200).nullable().optional(),
    ponteSegredo: z
      .string()
      .trim()
      .min(16, 'Use um segredo de ao menos 16 caracteres')
      .max(200)
      .nullable()
      .optional(),
    ponteSessao: z.string().trim().max(60).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

const canalDaRota = (valor: string): CanalExterno => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_EXTERNOS as readonly string[]).includes(canal)) throw notFound('Canal nao suportado');
  return canal as CanalExterno;
};

/**
 * A ponte de IA vale para qualquer canal, nao so os da Meta: um agente
 * respondendo no webchat e o caso mais facil de testar, e o e-mail nao tem
 * credencial de Graph API nenhuma.
 */
const CANAIS_IA = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL'] as const;

const canalDeIa = (valor: string): Channel => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_IA as readonly string[]).includes(canal)) throw notFound('Canal nao suportado para IA');
  return canal as Channel;
};

const iaSchema = z
  .object({
    iaAtiva: z.boolean().optional(),
    iaUrlWebhook: z.string().trim().url().max(300).nullable().optional(),
    iaSegredo: z.string().trim().min(16, 'Use um segredo de ao menos 16 caracteres').max(200).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

/**
 * Estado da sessao da ponte nao oficial.
 *
 * Diagnostico, e por isso **nunca falha**: ponte fora do ar responde
 * DESCONHECIDO com o motivo, e nao 500. Uma tela de configuracao que quebra
 * porque o diagnostico quebrou impede justamente quem esta tentando arrumar.
 *
 * Existe porque a sessao do WhatsApp Web CAI — o QR expira, o container
 * reinicia, o celular perde a rede. Sem esta tela, o sintoma que chega e "o
 * cliente mandou mensagem e ninguem viu", que ninguem liga a uma sessao caida.
 */
channelsRoutes.get(
  '/whatsapp/ponte/estado',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    const config = await obterConfig('WHATSAPP');

    /*
     * O caminho que a PONTE deve chamar, montado aqui.
     *
     * Ele leva o id da organizacao, e o front nao o conhece — nem deveria ter de
     * conhecer para escrever uma URL. Vem so o caminho: o host quem sabe e o
     * navegador, que pode estar atras de tunel ou de dominio proprio.
     *
     * O id na URL nao e segredo: ele diz *para quem* e a mensagem, e a assinatura
     * com `ponteSegredo` e que diz *se pode*.
     */
    const caminhoWebhook = `/api/webhooks/ponte/whatsapp/${organizacaoAtual()}`;

    if (!config || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({
        estado: { situacao: 'DESCONHECIDO', detalhe: 'o WhatsApp nao esta no modo nao oficial' },
        aviso: AVISO_NAO_OFICIAL,
        caminhoWebhook,
      });
      return;
    }
    res.json({ estado: await estadoDaPonte(config), aviso: AVISO_NAO_OFICIAL, caminhoWebhook });
  }),
);

channelsRoutes.get(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json({ canais: await listarCanais(), suportados: CANAIS_EXTERNOS });
  }),
);

channelsRoutes.put(
  '/:canal',
  requireRole('ADMIN'),
  validateBody(salvarSchema),
  asyncHandler(async (req, res) => {
    res.json({ canal: await salvarCanal(canalDaRota(param(req, 'canal')), req.body) });
  }),
);

/**
 * Estado e configuracao da ponte com o motor de IA externo.
 *
 * Rota propria e nao campo no PUT do canal: quem liga a IA nao esta mexendo em
 * credencial da Meta, e o canal WEBCHAT — o mais provavel para o primeiro teste
 * — nao passa pela validacao daquele PUT.
 */
channelsRoutes.get(
  '/:canal/ia',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    res.json({ ia: await estadoDaIa(canalDeIa(param(req, 'canal'))) });
  }),
);

channelsRoutes.put(
  '/:canal/ia',
  requireRole('ADMIN'),
  validateBody(iaSchema),
  asyncHandler(async (req, res) => {
    res.json({ ia: await salvarIa(canalDeIa(param(req, 'canal')), req.body) });
  }),
);
