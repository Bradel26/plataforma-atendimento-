import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest } from '../../lib/errors';
import { limiteBytes } from '../../lib/storage';
import {
  criarFluxo, criarMidiaFluxo, desativarFluxo, excluirFluxo, listarFluxos, listarMidiasFluxo, obterFluxo, publicarFluxo, recursosDosFluxos, salvarRascunho,
} from './fluxos.service';

export const fluxosRoutes = Router();
fluxosRoutes.use(requireAuth, requireRole('ADMIN'));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: limiteBytes, files: 1 } });

const fluxoSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  canalConfigId: z.string().uuid().nullable(),
  grafo: z.object({ nodes: z.array(z.unknown()).max(100), edges: z.array(z.unknown()).max(200) }),
});

fluxosRoutes.get('/', asyncHandler(async (_req, res) => res.json({ fluxos: await listarFluxos() })));
fluxosRoutes.get('/recursos', asyncHandler(async (_req, res) => res.json(await recursosDosFluxos())));
fluxosRoutes.get('/:id/midias', asyncHandler(async (req, res) => res.json({ midias: await listarMidiasFluxo(param(req, 'id')) })));
fluxosRoutes.post('/:id/midias', upload.single('arquivo'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('Selecione um arquivo para enviar');
  const midia = await criarMidiaFluxo(param(req, 'id'), {
    buffer: req.file.buffer,
    nome: req.file.originalname,
    tipo: req.file.mimetype,
  });
  res.status(201).json({ midia });
}));
fluxosRoutes.get('/:id', asyncHandler(async (req, res) => res.json({ fluxo: await obterFluxo(param(req, 'id')) })));
fluxosRoutes.post('/novo', validateBody(z.object({ nome: z.string().trim().min(2).max(80), canalConfigId: z.string().uuid().nullable() })), asyncHandler(async (req, res) => {
  res.status(201).json({ fluxo: await criarFluxo(req.body) });
}));
fluxosRoutes.put('/:id', validateBody(fluxoSchema), asyncHandler(async (req, res) => {
  res.json({ fluxo: await salvarRascunho(param(req, 'id'), req.body) });
}));
fluxosRoutes.post('/:id/publicar', asyncHandler(async (req, res) => {
  res.json({ fluxo: await publicarFluxo(param(req, 'id')) });
}));
fluxosRoutes.post('/:id/desativar', asyncHandler(async (req, res) => {
  res.json({ fluxo: await desativarFluxo(param(req, 'id')) });
}));
fluxosRoutes.delete('/:id', asyncHandler(async (req, res) => {
  await excluirFluxo(param(req, 'id'));
  res.status(204).end();
}));
