import { readFile } from 'node:fs/promises';
import { ErroPermanente, registrarHandler } from '../../lib/fila';
import { prisma } from '../../lib/prisma';
import { caminhoDe, limiteBytes, salvar, tipoAceito } from '../../lib/storage';
import { env } from '../../env';
import { notificarChamada } from '../../realtime/hub';
import { TIPO_TRANSCRICAO_CHAMADA_WHATSAPP } from '../channels/meta-calling.service';
import { TIPO_GRAVACAO, obterConfig } from './voice.service';
import { twilio } from './twilio.provider';
import { transcricaoDisponivel } from './transcription.config';
import { analisarTranscricaoLocal } from './analise-local.service';
import { registrarAnalise } from './analise.service';

/**
 * Traz a gravacao para o storage da plataforma.
 *
 * A URL do provedor exige credencial e some quando a conta e encerrada ou a
 * retencao dele expira. Guardar so o link seria perder a gravacao justamente
 * quando ela e necessaria — auditoria, reclamacao, processo.
 */
registrarHandler<{ chamadaId: string; url: string }>(TIPO_GRAVACAO, async ({ chamadaId, url }) => {
  const chamada = await prisma.call.findUnique({ where: { id: chamadaId } });
  if (!chamada) throw new ErroPermanente('chamada não encontrada');
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
    throw new ErroPermanente(`provedor recusou a gravação (HTTP ${resposta.status})`);
  }
  if (!resposta.ok) throw new Error(`download da gravação falhou (HTTP ${resposta.status})`);

  const tipo = (resposta.headers.get('content-type') ?? 'audio/mpeg').split(';')[0]!.trim();
  if (!tipoAceito(tipo)) throw new ErroPermanente(`tipo de gravação não aceito: ${tipo}`);

  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (buffer.length > limiteBytes) throw new ErroPermanente('gravação acima do limite de upload');

  const arquivo = await salvar({ buffer, nome: `chamada-${chamada.idExterno}`, tipo });
  await prisma.call.update({ where: { id: chamadaId }, data: { gravacaoUrl: arquivo.url } });
});

registrarHandler<{ chamadaId: string; url: string }>(TIPO_TRANSCRICAO_CHAMADA_WHATSAPP, async ({ chamadaId, url }) => {
  const chamada = await prisma.call.findUnique({
    where: { id: chamadaId },
    include: { canalConfig: { select: { transcreverChamadasWhatsapp: true } } },
  });
  if (!chamada) throw new ErroPermanente('chamada não encontrada');
  let transcricao = chamada.transcricao;
  if (!chamada.canalConfig?.transcreverChamadasWhatsapp) throw new ErroPermanente('transcrição desativada para esta linha');
  if (!transcricao && !transcricaoDisponivel()) throw new ErroPermanente('provedor de transcrição indisponível ou desativado');

  if (!transcricao) {
  const chaveArquivo = url.replace(/^\/api\/arquivos\//, '').split('?')[0]!;
  const buffer = await readFile(caminhoDe(chaveArquivo));
  const tipo = tipoAceito(url.includes('.m4a') ? 'audio/mp4' : 'audio/webm') ? (url.includes('.m4a') ? 'audio/mp4' : 'audio/webm') : 'audio/webm';
  const form = new FormData();
  const local = env.TRANSCRICAO_PROVEDOR === 'local';
  form.append('model', local ? env.TRANSCRICAO_LOCAL_MODELO : 'gpt-transcribe');
  form.append('file', new Blob([new Uint8Array(buffer)], { type: tipo }), `chamada-${chamada.id}.${tipo === 'audio/mp4' ? 'm4a' : 'webm'}`);

  const resposta = await fetch(local ? env.TRANSCRICAO_LOCAL_URL : 'https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    ...(!local ? { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } } : {}),
    body: form,
  });
  const corpo = await resposta.json().catch(() => ({})) as { text?: string; error?: { message?: string } };
  if ([400, 401, 403, 404].includes(resposta.status)) {
    throw new ErroPermanente(`provedor de transcrição recusou o áudio (HTTP ${resposta.status})`);
  }
  if (!resposta.ok || !corpo.text) throw new Error(corpo.error?.message ?? `transcrição falhou (HTTP ${resposta.status})`);

  transcricao = corpo.text;
  await prisma.call.update({
    where: { id: chamada.id },
    data: {
      transcricao,
      analisadoPor: local ? `Whisper local (${env.TRANSCRICAO_LOCAL_MODELO})` : 'OpenAI gpt-transcribe',
      analisadoEm: new Date(),
    },
  });
  await notificarChamada(
    { id: chamada.id, contatoId: chamada.contatoId, transcricao },
    { agenteId: chamada.agenteId, filaId: chamada.filaId },
  );
  }

  const ollamaConfigurado = env.LIGACAO_IA_OLLAMA_URL || env.OPORTUNIDADE_IA_OLLAMA_URL;
  if (!chamada.resumo && transcricao && ollamaConfigurado) {
    const analise = await analisarTranscricaoLocal(transcricao);
    await registrarAnalise(chamada.id, {
      resumo: analise.resumo,
      sentimento: analise.sentimento,
      proximasAcoes: analise.proximasAcoes,
      motor: analise.motor,
      consumo: { unidades: analise.unidades, custo: null },
    });
    await notificarChamada(
      { id: chamada.id, contatoId: chamada.contatoId, resumo: analise.resumo, sentimento: analise.sentimento },
      { agenteId: chamada.agenteId, filaId: chamada.filaId },
    );
  }
});
