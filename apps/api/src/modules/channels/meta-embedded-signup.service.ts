import { env } from '../../env';
import { badRequest, conflict, serviceUnavailable } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { decifrar } from '../../lib/crypto-box';
import { atualizarNumero, criarNumero, obterConfigPorId } from './channels.service';

type MetaPhone = { id: string; display_phone_number?: string; verified_name?: string };
type MetaError = { error?: { message?: string; code?: number; error_subcode?: number } };

const credenciaisMetaConfiguradas = () => Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_WEBHOOK_VERIFY_TOKEN);
const metaConfigurada = () => Boolean(
  credenciaisMetaConfiguradas() && (env.META_EMBEDDED_SIGNUP_CONFIG_ID || env.META_EMBEDDED_SIGNUP_COEX_CONFIG_ID),
);

export function estadoDoEmbeddedSignup() {
  return {
    disponivel: metaConfigurada(),
    appId: metaConfigurada() ? env.META_APP_ID : null,
    configId: credenciaisMetaConfiguradas() && env.META_EMBEDDED_SIGNUP_CONFIG_ID ? env.META_EMBEDDED_SIGNUP_CONFIG_ID : null,
    coexistenciaConfigId: credenciaisMetaConfiguradas() && env.META_EMBEDDED_SIGNUP_COEX_CONFIG_ID
      ? env.META_EMBEDDED_SIGNUP_COEX_CONFIG_ID
      : null,
    apiVersion: metaConfigurada() ? env.META_GRAPH_API_VERSION : null,
  };
}

/** Ativa o Calling API Graph/WebRTC sem configurar SIP para a linha Cloud. */
export async function habilitarChamadasNumeroMeta(donoId: string) {
  const linha = await prisma.channelConfig.findFirst({
    where: { canal: 'WHATSAPP', donoId, ativo: true, modo: 'OFICIAL' },
  });
  if (!linha?.phoneNumberId || !linha.accessToken) {
    throw serviceUnavailable('Conecte primeiro o número pela API oficial no Atendimento.');
  }
  if (linha.espelharCelular) {
    throw conflict('Chamadas pelo painel exigem o número no modo API exclusivo, sem coexistência com o aplicativo do celular.');
  }

  await graph(`${encodeURIComponent(linha.phoneNumberId)}/settings`, decifrar(linha.accessToken), {
    method: 'POST',
    body: JSON.stringify({
      calling: {
        status: 'ENABLED',
        call_icon_visibility: 'DEFAULT',
        callback_permission_status: 'ENABLED',
      },
    }),
  });

  const atualizado = await prisma.channelConfig.update({
    where: { id: linha.id },
    data: {
      whatsappCallingHabilitado: true,
      gravarChamadasWhatsapp: true,
      transcreverChamadasWhatsapp: true,
    },
  });
  return {
    numero: {
      id: atualizado.id,
      phoneNumberId: atualizado.phoneNumberId,
      whatsappCallingHabilitado: atualizado.whatsappCallingHabilitado,
      transcreverChamadasWhatsapp: atualizado.transcreverChamadasWhatsapp,
    },
  };
}

async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const corpo = await resposta.json().catch(() => ({})) as T & MetaError;
  if (!resposta.ok) {
    const detalhe = corpo.error?.message;
    throw serviceUnavailable(`A Meta recusou a configuração do WhatsApp${detalhe ? `: ${detalhe}` : ` (HTTP ${resposta.status})`}.`);
  }
  return corpo;
}

/**
 * Finaliza o Embedded Signup de uma pessoa autenticada.
 * O code OAuth é trocado no servidor; token e segredos nunca voltam ao browser.
 * A linha antiga do mesmo dono é atualizada só depois de a Meta validar o ativo.
 */
export async function conectarNumeroMeta(input: {
  codigo: string;
  wabaId: string;
  phoneNumberId?: string;
  pin?: string;
  donoId: string;
  coexistencia?: boolean;
}) {
  if (!metaConfigurada()) {
    throw serviceUnavailable('O administrador ainda precisa configurar o app Meta e o Embedded Signup da plataforma.');
  }

  const atual = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', donoId: input.donoId } });

  const codigoUrl = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token`);
  codigoUrl.searchParams.set('client_id', env.META_APP_ID);
  codigoUrl.searchParams.set('client_secret', env.META_APP_SECRET);
  codigoUrl.searchParams.set('code', input.codigo);
  const troca = await fetch(codigoUrl, { method: 'GET' });
  const tokenJson = await troca.json() as { access_token?: string; error?: { message?: string } };
  if (!troca.ok || !tokenJson.access_token) {
    throw badRequest(`Não foi possível concluir a autorização da Meta${tokenJson.error?.message ? `: ${tokenJson.error.message}` : '.'}`);
  }
  const token = tokenJson.access_token;

  // Verifica pelo próprio WABA que o número retornado pelo fluxo pertence ao
  // ativo autorizado; não confiamos nos IDs enviados pelo navegador isoladamente.
  const phones = await graph<{ data?: MetaPhone[] }>(`${encodeURIComponent(input.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`, token);
  const phone = input.phoneNumberId
    ? phones.data?.find((item) => item.id === input.phoneNumberId)
    : phones.data?.length === 1 ? phones.data[0] : undefined;
  if (!phone) throw badRequest(input.phoneNumberId
    ? 'O número escolhido não pertence ao WhatsApp Business Account autorizado.'
    : 'A Meta não identificou qual linha conectar. O WABA tem mais de um número; tente novamente pelo fluxo oficial.');

  // O evento de coexistência pode omitir phone_number_id quando o WABA tem
  // somente uma linha. Resolva o ID pela API antes de conferir duplicidade;
  // comparar `atual.phoneNumberId` com `undefined` rejeitaria uma reconexão
  // válida e a busca com ID ausente poderia selecionar uma linha arbitrária.
  if (atual?.phoneNumberId && atual.phoneNumberId !== phone.id) {
    throw conflict('Este usuário já tem outro número oficial conectado. Remova ou migre a linha atual antes de conectar um número diferente.');
  }

  const existente = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', phoneNumberId: phone.id } });
  if (existente && existente.donoId !== input.donoId) {
    throw conflict('Este número já está conectado a outro usuário da plataforma.');
  }

  // Na coexistência a linha continua registrada no WhatsApp Business App.
  // Registrar novamente pode interromper o uso do app; só o fluxo padrão faz isso.
  if (!input.coexistencia) {
    if (!input.pin || !/^\d{6}$/.test(input.pin)) throw badRequest('Defina um PIN de segurança com 6 dígitos.');
    await graph(`${encodeURIComponent(phone.id)}/register`, token, {
      method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin: input.pin }),
    });
  }

  // A assinatura do app no WABA habilita entrega de eventos de mensagem.
  await graph(`${encodeURIComponent(input.wabaId)}/subscribed_apps`, token, { method: 'POST', body: '{}' });

  const linha = {
    nome: phone.verified_name || phone.display_phone_number || 'WhatsApp pessoal',
    donoId: input.donoId,
    modo: 'OFICIAL' as const,
    ativo: true,
    phoneNumberId: phone.id,
    wabaId: input.wabaId,
    accessToken: token,
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
    ponteUrl: null,
    ponteToken: null,
    ponteSegredo: null,
    ponteSessao: null,
    // A API exclusiva desativa o aplicativo no celular; a conexão de
    // coexistência, mantida apenas para migrações antigas, espelha mensagens.
    espelharCelular: Boolean(input.coexistencia),
    whatsappCallingHabilitado: false,
    gravarChamadasWhatsapp: !input.coexistencia,
    transcreverChamadasWhatsapp: !input.coexistencia,
  };

  let canal: Awaited<ReturnType<typeof criarNumero>>;
  try {
    canal = atual
      ? await atualizarNumero(atual.id, linha)
      : await criarNumero('WHATSAPP', linha);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw conflict('Este número WhatsApp já está conectado a outra linha ou conta da plataforma.');
    }
    throw e;
  }

  if (input.coexistencia) {
    return { canal, aviso: 'Número conectado para mensagens. A Meta não disponibiliza chamadas de voz no modo de coexistência.' };
  }

  try {
    const chamadas = await habilitarChamadasNumeroMeta(input.donoId);
    return {
      canal,
      numero: chamadas.numero,
      aviso: 'Número conectado para mensagens e chamadas pela API oficial. O aplicativo do celular foi desvinculado; gravações e transcrições serão salvas no histórico da plataforma.',
    };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'a Meta ainda não liberou chamadas para esta linha';
    return {
      canal,
      aviso: `Mensagens conectadas. A Meta ainda não habilitou chamadas para esta linha: ${motivo} Você pode tentar habilitar novamente em Telefonia.`,
    };
  }
}

/**
 * Desconecta a linha oficial do proprio usuario. O token e descartado e a linha
 * fica inativa (a linha e o historico de conversas permanecem, e uma reconexao
 * reaproveita o mesmo registro). A assinatura de webhooks no WABA so e removida
 * se nenhuma outra linha da plataforma usa o mesmo WABA.
 */
export async function desconectarNumeroMeta(donoId: string) {
  const linha = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', donoId, modo: 'OFICIAL' } });
  if (!linha || !linha.phoneNumberId) throw badRequest('Você não tem um número oficial da Meta conectado.');

  let assinaturaRemovida = false;
  if (linha.wabaId && linha.accessToken) {
    const outras = await prisma.channelConfig.count({
      where: { canal: 'WHATSAPP', wabaId: linha.wabaId, id: { not: linha.id }, ativo: true },
    });
    if (outras === 0) {
      try {
        const token = (await obterConfigPorId(linha.id))?.accessToken;
        if (token) {
          await graph(`${encodeURIComponent(linha.wabaId)}/subscribed_apps`, token, { method: 'DELETE' });
          assinaturaRemovida = true;
        }
      } catch {
        // Token ja revogado ou WABA removida: o descarte local abaixo continua valendo.
      }
    }
  }

  const canal = await atualizarNumero(linha.id, { ativo: false, accessToken: null });
  return { canal, assinaturaRemovida };
}
