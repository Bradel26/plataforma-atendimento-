import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { env } from '../env';
import { badRequest, notFound } from './errors';
import { ORGANIZACAO_INICIAL, organizacaoAtual } from './tenant';

/**
 * Armazenamento de arquivos enviados (anexos de protocolo e midia recebida dos
 * canais).
 *
 * O driver e o disco local por padrao, o unico que funciona sem conta em nuvem.
 * Trocar por S3/MinIO/R2 e substituir as tres funcoes deste arquivo — `salvar`,
 * `caminhoDe` e `remover`; o resto do sistema so conhece a *chave* e a URL
 * `/api/arquivos/<chave>`, nunca o caminho no disco.
 */

/**
 * Lista de tipos aceitos. E uma lista fechada de proposito: SVG e HTML servidos
 * de volta ao navegador executam script no dominio da aplicacao (XSS armazenado),
 * e executaveis nao tem por que entrar.
 */
const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

/** Abertos no navegador; o resto vai como download. */
const EXIBIVEIS = ['image/', 'audio/', 'video/', 'application/pdf'];

export const tipoAceito = (tipo: string) => tipo in EXTENSAO;
export const podeExibirInline = (tipo: string) => EXIBIVEIS.some((p) => tipo.startsWith(p));
export const limiteBytes = env.UPLOAD_MAX_MB * 1024 * 1024;

/** `2026/08/<uuid>.<ext>` — barra normal ate no Windows, e parte da URL. */
/**
 * Chave de arquivo: `<organizacao>/<ano>/<mes>/<uuid>.<ext>`.
 *
 * O prefixo da organizacao e o que da fronteira ao armazenamento. A assinatura
 * do link protege contra adivinhacao, mas nao pertence a ninguem: com o caminho
 * antigo, um link valido servia venha de onde viesse.
 *
 * O formato antigo (sem prefixo) continua aceito para leitura: os arquivos que
 * ja estao no disco pertencem a organizacao inicial, e recusa-los seria perder
 * anexo de conversa que existe hoje.
 */
const CHAVE_VALIDA = /^[0-9a-f-]{36}\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;
const CHAVE_ANTIGA = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

/** Aceita a chave nova e a de antes do isolamento. */
const chaveValida = (chave: string) => CHAVE_VALIDA.test(chave) || CHAVE_ANTIGA.test(chave);

const raiz = () => resolve(process.cwd(), env.STORAGE_DIR);

export type ArquivoSalvo = {
  chave: string;
  nome: string;
  tipo: string;
  tamanho: number;
  url: string;
};

export const urlPublica = (chave: string) => `/api/arquivos/${chave}`;

export async function salvar(entrada: { buffer: Buffer; nome: string; tipo: string }): Promise<ArquivoSalvo> {
  const tipo = entrada.tipo.split(';')[0]!.trim().toLowerCase();
  if (!tipoAceito(tipo)) throw badRequest(`Tipo de arquivo nao aceito: ${tipo}`);
  if (entrada.buffer.length === 0) throw badRequest('Arquivo vazio');
  if (entrada.buffer.length > limiteBytes) {
    throw badRequest(`Arquivo acima do limite de ${env.UPLOAD_MAX_MB} MB`);
  }

  const agora = new Date();
  const pasta = `${organizacaoAtual()}/${agora.getFullYear()}/${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const chave = `${pasta}/${randomUUID()}.${EXTENSAO[tipo]}`;
  const destino = join(raiz(), ...chave.split('/'));

  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, entrada.buffer);

  // O nome original vira rotulo, nunca caminho: quem escolhe onde o arquivo
  // fica e a plataforma, e por isso "../../etc/passwd" nao chega ao disco.
  return {
    chave,
    nome: entrada.nome.replace(/[\r\n\t]/g, ' ').slice(0, 200) || `arquivo.${EXTENSAO[tipo]}`,
    tipo,
    tamanho: entrada.buffer.length,
    url: urlPublica(chave),
  };
}

/**
 * Caminho absoluto de uma chave, para leitura. Valida o formato e confere que o
 * resultado continua dentro da raiz — sem isso, `..%2f..%2f` na URL leria
 * qualquer arquivo do servidor.
 */
export function caminhoDe(chave: string) {
  if (!chaveValida(chave)) throw notFound('Arquivo nao encontrado');
  // A organizacao do caminho tem de ser a de quem pede. Sem esta linha, o
  // prefixo seria organizacao no nome e nada na pratica: a assinatura sozinha
  // liberaria o arquivo para qualquer sessao.
  const prefixo = chave.split('/')[0]!;
  if (CHAVE_VALIDA.test(chave) && prefixo !== organizacaoAtual()) {
    throw notFound('Arquivo nao encontrado');
  }
  // Chave antiga pertence a organizacao inicial — e so ela pode ler.
  if (CHAVE_ANTIGA.test(chave) && organizacaoAtual() !== ORGANIZACAO_INICIAL) {
    throw notFound('Arquivo nao encontrado');
  }
  const destino = resolve(raiz(), ...chave.split('/'));
  if (!destino.startsWith(raiz() + sep)) throw notFound('Arquivo nao encontrado');
  return destino;
}

export async function remover(chave: string) {
  await unlink(caminhoDe(chave)).catch(() => undefined);
}

/**
 * Assinatura da URL de leitura.
 *
 * A imagem do chat e carregada pelo `<img src>` do navegador, que nao manda
 * header Authorization — o token tem de viajar na propria URL. Sem isso a
 * alternativa seria servir anexo de cliente sem autenticacao nenhuma, o que a
 * LGPD nao perdoa. A assinatura vale por tempo curto e cobre a chave, entao um
 * link vazado nao vira acesso permanente nem serve para outro arquivo.
 */
const VALIDADE_MS = 60 * 60 * 1000;

export function assinar(chave: string) {
  const expira = Date.now() + VALIDADE_MS;
  return `${expira}.${hmac(chave, expira)}`;
}

export function assinaturaValida(chave: string, assinatura: string | undefined) {
  const [expira, digest] = (assinatura ?? '').split('.');
  if (!expira || !digest) return false;
  if (Number(expira) < Date.now()) return false;

  const esperado = Buffer.from(hmac(chave, Number(expira)));
  const recebido = Buffer.from(digest);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

const hmac = (chave: string, expira: number) =>
  createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${chave}.${expira}`).digest('hex');

/** URL pronta para o navegador: caminho + assinatura. */
export const urlAssinada = (url: string) => {
  const chave = url.replace(/^\/api\/arquivos\//, '');
  return chaveValida(chave) ? `${url}?t=${assinar(chave)}` : url;
};

/**
 * MIME a partir da extensao da chave. Nao e adivinhacao pelo conteudo: a
 * extensao foi escolhida por `salvar` a partir do tipo ja validado, entao o
 * caminho de volta e exato para tudo o que a plataforma aceita.
 */
export function tipoPorChave(chave: string) {
  const extensao = chave.split('.').pop()?.toLowerCase();
  const par = Object.entries(EXTENSAO).find(([, ext]) => ext === extensao);
  return par?.[0] ?? 'application/octet-stream';
}
