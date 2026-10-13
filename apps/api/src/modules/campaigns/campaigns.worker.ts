import { readFile } from 'node:fs/promises';
import { AppError } from '../../lib/errors';
import { aguardarVaga, registrarHandler } from '../../lib/fila';
import { prisma } from '../../lib/prisma';
import { enviarArquivoParaCanal, enviarParaCanal } from '../channels/outbound.service';
import { TIPO_ITEM_CAMPANHA, renderizar } from './campaigns.service';
import { caminhoDe } from '../../lib/storage';

/** Envios por segundo, por canal. Abaixo do limite da Cloud API, com folga. */
const POR_SEGUNDO = 10;

/**
 * Um trabalho por contato da campanha.
 *
 * O item no banco e a fonte da verdade do resultado; a fila so cuida de quando
 * tentar. Por isso o handler sempre grava o desfecho no item antes de decidir se
 * lanca para a fila reagendar.
 */
registrarHandler<{ itemId: string }>(TIPO_ITEM_CAMPANHA, async ({ itemId }, ctx) => {
  const item = await prisma.campaignItem.findUnique({
    where: { id: itemId },
    include: { contato: true, campanha: { include: { anexos: { orderBy: { criadoEm: 'asc' } } } } },
  });

  // Item ja processado, campanha pausada ou apagada: nada a fazer. Pausar uma
  // campanha precisa parar o que ja estava na fila, senao o botao nao serve.
  if (!item || item.status !== 'PENDENTE' || item.campanha.status !== 'ATIVA') return;

  if (!item.contato.telefone) {
    await prisma.campaignItem.update({
      where: { id: item.id },
      data: { status: 'IGNORADO', erro: 'Contato sem telefone' },
    });
    await concluirSeVazia(item.campanhaId);
    return;
  }

  await aguardarVaga(item.campanha.canal, POR_SEGUNDO);

  try {
    if (item.campanha.anexos.length > 0 && !['WHATSAPP', 'FACEBOOK'].includes(item.campanha.canal)) {
      throw new AppError(422, 'ANEXO_NAO_SUPORTADO', `O canal ${item.campanha.canal} não aceita anexos nesta campanha`);
    }

    if (!item.textoEnviadoEm) {
      const texto = renderizar(item.campanha.mensagem, item.contato);
      if (texto.trim()) {
        await enviarParaCanal(item.campanha.canal, item.contato.telefone, texto);
        await prisma.campaignItem.update({ where: { id: item.id }, data: { textoEnviadoEm: new Date() } });
      }
    }

    for (const anexo of item.campanha.anexos) {
      if (item.anexosEnviados.includes(anexo.id)) continue;
      const chave = anexo.url.replace(/^\/api\/arquivos\//, '');
      const buffer = await readFile(caminhoDe(chave));
      await enviarArquivoParaCanal(item.campanha.canal, item.contato.telefone, {
        buffer,
        nome: anexo.nome,
        tipo: anexo.tipo,
      });
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: { anexosEnviados: { push: anexo.id } },
      });
    }

    await prisma.campaignItem.update({
      where: { id: item.id },
      data: { status: 'ENVIADO', enviadoEm: new Date(), erro: null },
    });
    await concluirSeVazia(item.campanhaId);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'Erro desconhecido';
    // Recusa da Meta e definitiva; erro de rede ou canal fora do ar, nao.
    const permanente = err instanceof AppError && ['ENVIO_RECUSADO', 'ANEXO_NAO_SUPORTADO'].includes(err.code);

    if (permanente || ctx.ultimaTentativa) {
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: { status: 'FALHOU', erro: permanente ? motivo : `${motivo} (apos ${ctx.tentativa} tentativas)` },
      });
      await concluirSeVazia(item.campanhaId);
      return;
    }

    // Continua PENDENTE com o motivo visivel enquanto a fila tenta de novo.
    await prisma.campaignItem.update({ where: { id: item.id }, data: { erro: `${motivo} (tentando de novo)` } });
    throw err;
  }
});

async function concluirSeVazia(campanhaId: string) {
  const restantes = await prisma.campaignItem.count({ where: { campanhaId, status: 'PENDENTE' } });
  if (restantes > 0) return;

  await prisma.campaign.updateMany({
    where: { id: campanhaId, status: 'ATIVA' },
    data: { status: 'CONCLUIDA', concluidaEm: new Date() },
  });
}
