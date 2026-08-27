import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireIntegration } from '../../http/middleware/integration';
import { validateBody } from '../../http/middleware/validate';
import { badRequest } from '../../lib/errors';
import { limiteBytes } from '../../lib/storage';
import { registrarAnexoDaIa, registrarRespostaDaIa } from './ia.service';

/**
 * Rotas do motor de IA externo. Autenticadas por token de integracao, nunca por
 * sessao de usuario — quem chama aqui e maquina.
 *
 * Montadas em `/api/bots/ia` ANTES de `/api/bots` no app: `botsRoutes` aplica
 * `requireAuth` no router inteiro, e cair nele faria o plugin receber 401 com
 * um token perfeitamente valido.
 */
export const iaRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: limiteBytes, files: 1 } });

iaRoutes.use(requireIntegration('IA'));

/**
 * Confere o token sem efeito nenhum.
 *
 * Existe porque o diagnostico do plugin conferia a ponte pelo `/api/health`, que
 * e publico: ele respondia igual com token certo, errado ou vazio, e a tela
 * dizia "ponte operante" com um token que a plataforma recusaria na primeira
 * mensagem. Um endereco que exige o token transforma esse verde em verdade.
 *
 * Devolve o nome da integracao, e nao o token: serve para quem le a tela
 * descobrir QUAL token esta configurado ali, sem que a tela possa vazar o valor.
 */
iaRoutes.get(
  '/ping',
  asyncHandler(async (req, res) => {
    res.json({
      ok: true,
      integracao: req.integracao?.nome ?? null,
      escopo: req.integracao?.escopo ?? null,
    });
  }),
);

const anexoSchema = z.object({
  tipo: z.string().trim().max(20).optional(),
  url: z.string().trim().url(),
  nome: z.string().trim().max(200).nullable().optional(),
});

const mensagemSchema = z
  .object({
    canalId: z.string().trim().min(1).max(60),
    contatoId: z.string().trim().min(1).max(60),
    texto: z.string().max(4096).optional(),
    respondendoA: z.string().trim().max(120).nullable().optional(),
    anexo: anexoSchema.nullable().optional(),
  })
  .refine((d) => Boolean(d.texto?.trim()) || Boolean(d.anexo), {
    message: 'Informe texto ou anexo',
  });

/** Resposta do agente: texto, ou midia que ja tem URL publica. */
iaRoutes.post(
  '/mensagens',
  validateBody(mensagemSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await registrarRespostaDaIa(req.body));
  }),
);

/**
 * Anexo produzido pelo agente (imagem gerada, PDF montado).
 *
 * Existe separada de `/mensagens` porque multipart e JSON nao convivem no mesmo
 * corpo. Midia que ja tem URL publica vai por `/mensagens` — fazer upload de
 * algo que ja e URL e trabalho dobrado.
 */
iaRoutes.post(
  '/anexos',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    const arquivo = req.file;
    if (!arquivo) throw badRequest('Envie o arquivo no campo `arquivo`');

    const corpo = z
      .object({
        canalId: z.string().trim().min(1).max(60),
        contatoId: z.string().trim().min(1).max(60),
        texto: z.string().max(4096).optional(),
        respondendoA: z.string().trim().max(120).nullable().optional(),
      })
      .parse(req.body);

    res.status(201).json(
      await registrarAnexoDaIa(corpo, {
        buffer: arquivo.buffer,
        nome: arquivo.originalname,
        tipo: arquivo.mimetype,
      }),
    );
  }),
);
