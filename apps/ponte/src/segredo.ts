import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config.js';

/**
 * Cifragem das credenciais de sessao do Baileys guardadas no Postgres.
 *
 * Copia adaptada de `apps/api/src/lib/crypto-box.ts`, mas sem depender do
 * `env.ts` da API: a ponte e um processo separado, com a propria variavel de
 * chave (`PONTE_CIFRA_CHAVE`). O formato e o mesmo — `v1:<iv-hex>:<tag-hex>:
 * <cifrado-hex>` com AES-256-GCM — para o resto do raciocinio (deteccao de
 * adulteracao, IV novo a cada chamada) valer aqui tambem.
 *
 * As credenciais do WhatsApp pessoal de um vendedor sao, na pratica, a chave da
 * conta dele: quem le esse blob em claro consegue se passar por ele no
 * WhatsApp. O mesmo cuidado do token da Meta se aplica aqui.
 */
const PREFIXO = 'v1';

function chave() {
  return Buffer.from(config.cifraChave, 'hex');
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return [PREFIXO, iv.toString('hex'), cipher.getAuthTag().toString('hex'), cifrado.toString('hex')].join(':');
}

export function decifrar(valor: string): string {
  const partes = valor.split(':');
  if (partes[0] !== PREFIXO || partes.length !== 4) return valor;

  const [, ivHex, tagHex, cifradoHex] = partes as [string, string, string, string];
  try {
    const decipher = createDecipheriv('aes-256-gcm', chave(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(cifradoHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    // Chave trocada ou registro corrompido: melhor comecar a sessao do zero
    // (pede QR de novo) do que tentar autenticar o Baileys com lixo.
    console.error('[ponte] nao foi possivel decifrar a sessao — confira PONTE_CIFRA_CHAVE');
    return '';
  }
}
