import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { env } from '../../env';
import { organizacaoAtualOuNula } from '../../lib/tenant';
import type { FotoPerfil } from './avatar';
import type { ConfigDaPonte } from './whatsapp.ponte';
import { getWhatsAppProvider } from './whatsapp-provider.factory';

/**
 * Foto de perfil do WhatsApp, guardada em arquivo como o Whatsbot Pro faz.
 *
 * - Foto recente em disco responde sem perguntar ao WhatsApp.
 * - Foto velha e atualizada; se a nova busca falha, a antiga continua valendo.
 * - Sem foto, o resultado negativo vale por pouco tempo, para uma foto que
 *   aparece depois (a pessoa respondeu, liberou a privacidade) ser achada logo.
 */
const VALIDADE_MS = 6 * 60 * 60_000;
const SEM_FOTO_MS = 30_000;

const emVoo = new Map<string, Promise<FotoPerfil | null>>();
const semFotoAte = new Map<string, number>();

function tipoPorBytes(b: Buffer): FotoPerfil['contentType'] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 4).toString('latin1') === '\x89PNG') return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function arquivoDe(digitos: string) {
  const org = organizacaoAtualOuNula() ?? 'sem-organizacao';
  const nome = createHash('sha256').update(`${org}:${digitos}`).digest('hex').slice(0, 40);
  return join(resolve(process.cwd(), env.STORAGE_DIR), 'avatares', org, `${nome}.img`);
}

async function lerDoDisco(digitos: string): Promise<{ foto: FotoPerfil; idadeMs: number } | null> {
  try {
    const caminho = arquivoDe(digitos);
    const [buffer, info] = await Promise.all([readFile(caminho), stat(caminho)]);
    const contentType = tipoPorBytes(buffer);
    return contentType ? { foto: { buffer, contentType }, idadeMs: Date.now() - info.mtimeMs } : null;
  } catch {
    return null;
  }
}

async function gravarNoDisco(digitos: string, foto: FotoPerfil) {
  try {
    const caminho = arquivoDe(digitos);
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, foto.buffer);
  } catch {
    // Disco indisponivel nao pode derrubar a foto: ela segue valendo so em memoria.
  }
}

export async function fotoDoNumero(config: ConfigDaPonte, telefone: string): Promise<FotoPerfil | null> {
  const digitos = telefone.replace(/\D/g, '');
  const provider = getWhatsAppProvider();
  if (!provider.fetchAvatar) return null;

  const guardada = await lerDoDisco(digitos);
  if (guardada && guardada.idadeMs < VALIDADE_MS) return guardada.foto;

  const chave = `${provider.constructor.name}:${config.ponteSessao ?? 'linha'}:${digitos}`;
  if ((semFotoAte.get(chave) ?? 0) > Date.now()) return guardada?.foto ?? null;

  let busca = emVoo.get(chave);
  if (!busca) {
    busca = provider
      .fetchAvatar(config, digitos)
      .catch(() => null)
      .then(async (foto) => {
        if (foto) {
          semFotoAte.delete(chave);
          await gravarNoDisco(digitos, foto);
        } else {
          semFotoAte.set(chave, Date.now() + SEM_FOTO_MS);
          if (semFotoAte.size > 2000) semFotoAte.delete(semFotoAte.keys().next().value!);
        }
        return foto;
      })
      .finally(() => emVoo.delete(chave));
    emVoo.set(chave, busca);
  }
  return (await busca) ?? guardada?.foto ?? null;
}
