import { registrarHandler } from '../../lib/fila';
import { processarTimeoutFluxo } from './fluxos.service';

registrarHandler<{ runId: string; fluxoId: string | null; versao: number; noId: string }>(
  'fluxo:timeout',
  async (dados) => processarTimeoutFluxo(dados),
);
