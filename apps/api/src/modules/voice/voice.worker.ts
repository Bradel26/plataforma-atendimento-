import { ErroPermanente, registrarHandler } from '../../lib/fila';
import { prisma } from '../../lib/prisma';
import { limiteBytes, salvar, tipoAceito } from '../../lib/storage';
import { TIPO_GRAVACAO, obterConfig } from './voice.service';
import { twilio } from './twilio.provider';

/**
 * Traz a gravacao para o storage da plataforma.
 *
 * A URL do provedor exige credencial e some quando a conta e encerrada ou a
 * retencao dele expira. Guardar so o link seria perder a gravacao justamente
 * quando ela e necessaria — auditoria, reclamacao, processo.
 */
registrarHandler<{ chamadaId: string; url: string }>(TIPO_GRAVACAO, async ({ chamadaId, url }) => {
  const chamada = await prisma.call.findUnique({ where: { id: chamadaId } });
  if (!chamada) throw new ErroPermanente('chamada nao encontrada');
  if (chamada.gravacaoUrl?.startsWith('/api/arquivos/')) return;

  const config = await obterConfig();
  if (!config.contaSid || !config.authToken) throw new ErroPermanente('voz sem credencial configurada');

  const resposta = await fetch(url, {
    headers: twilio.headersDeDownload({
      contaSid: config.contaSid,
      authToken: config.authToken,
      numeroPadrao: config.numeroPadrao,
      urlWebhook: config.urlWebhook,
    }),
  });

  // 401/403/404 nao mudam de opiniao na terceira tentativa; 5xx pode.
  if ([401, 403, 404].includes(resposta.status)) {
    throw new ErroPermanente(`provedor recusou a gravacao (HTTP ${resposta.status})`);
  }
  if (!resposta.ok) throw new Error(`download da gravacao falhou (HTTP ${resposta.status})`);

  const tipo = (resposta.headers.get('content-type') ?? 'audio/mpeg').split(';')[0]!.trim();
  if (!tipoAceito(tipo)) throw new ErroPermanente(`tipo de gravacao nao aceito: ${tipo}`);

  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (buffer.length > limiteBytes) throw new ErroPermanente('gravacao acima do limite de upload');

  const arquivo = await salvar({ buffer, nome: `chamada-${chamada.idExterno}`, tipo });
  await prisma.call.update({ where: { id: chamadaId }, data: { gravacaoUrl: arquivo.url } });
});
