import type { Channel } from '@prisma/client';
import { limiteBytes, salvar, tipoAceito } from '../../lib/storage';
import type { MensagemNormalizada } from './meta.types';
import { obterConfig } from './channels.service';

const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * Traz o binario do anexo para o storage da plataforma.
 *
 * Os dois canais entregam a midia de formas diferentes:
 *   - WhatsApp Cloud API: manda so um `media id`; o binario exige duas chamadas
 *     autenticadas (metadados e download).
 *   - Messenger e Instagram: mandam URL pronta, mas **temporaria**. Guardar so a
 *     URL significa histórico com imagem quebrada semanas depois.
 *
 * Nunca lanca. Anexo que nao baixou nao pode impedir a mensagem de existir: o
 * texto do cliente e o mais importante, e a Meta reentrega webhook sem 200.
 */
export async function baixarAnexo(
  canal: Channel,
  dados: Pick<MensagemNormalizada, 'tipoAnexo' | 'anexoUrl' | 'anexoIdExterno' | 'anexoNome'>,
): Promise<{ url: string | null; motivo?: string }> {
  if (dados.tipoAnexo === 'TEXTO') return { url: null };
  if (!dados.anexoIdExterno && !dados.anexoUrl) return { url: null, motivo: 'mensagem sem anexo localizavel' };

  try {
    const config = await obterConfig(canal);
    const token = config?.accessToken ?? null;

    const origem = dados.anexoIdExterno
      ? await metadadosCloudApi(dados.anexoIdExterno, token)
      : { url: dados.anexoUrl!, tipo: null as string | null, tamanho: null as number | null };

    if (origem.tamanho !== null && origem.tamanho > limiteBytes) {
      return { url: null, motivo: `anexo de ${Math.round(origem.tamanho / 1024 / 1024)} MB acima do limite` };
    }

    // A URL de download da Cloud API tambem exige o token; a do Messenger, nao.
    const resposta = await fetch(origem.url, {
      headers: dados.anexoIdExterno && token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resposta.ok) return { url: null, motivo: `download recusado (HTTP ${resposta.status})` };

    const tipo = origem.tipo ?? resposta.headers.get('content-type') ?? '';
    if (!tipoAceito(tipo.split(';')[0]!.trim().toLowerCase())) {
      return { url: null, motivo: `tipo nao aceito: ${tipo || 'desconhecido'}` };
    }

    const buffer = Buffer.from(await resposta.arrayBuffer());
    const salvo = await salvar({ buffer, nome: dados.anexoNome ?? nomePadrao(dados.tipoAnexo), tipo });
    return { url: salvo.url };
  } catch (err) {
    return { url: null, motivo: err instanceof Error ? err.message : 'erro desconhecido' };
  }
}

async function metadadosCloudApi(mediaId: string, token: string | null) {
  if (!token) throw new Error('canal sem access token configurado');

  const resposta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  const dados = (await resposta.json().catch(() => ({}))) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
    error?: { message?: string };
  };
  if (!resposta.ok || !dados.url) {
    throw new Error(`metadados recusados (HTTP ${resposta.status}): ${dados.error?.message ?? 'sem detalhe'}`);
  }
  return { url: dados.url, tipo: dados.mime_type ?? null, tamanho: dados.file_size ?? null };
}

const nomePadrao = (tipo: MensagemNormalizada['tipoAnexo']) =>
  ({ IMAGEM: 'imagem', AUDIO: 'audio', VIDEO: 'video', ARQUIVO: 'arquivo', TEXTO: 'arquivo' })[tipo];
