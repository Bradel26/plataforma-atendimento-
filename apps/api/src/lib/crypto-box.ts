import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env, isProd } from '../env';

/**
 * Cifragem de segredos guardados no banco (access token e app secret dos canais).
 *
 * O banco e o backup dele saem da maquina — dump em ferramenta de BI, copia num
 * notebook, provedor gerenciado. Token da Meta em texto claro nesse caminho e o
 * bastante para alguem enviar mensagem no nome da empresa.
 *
 * Formato: `v1:<iv-hex>:<tag-hex>:<cifrado-hex>` com AES-256-GCM. O GCM detecta
 * alteracao no texto cifrado — sem isso, trocar bytes no banco passaria batido.
 *
 * Valor sem o prefixo `v1:` e tratado como texto claro de versao anterior e
 * devolvido como esta: dado ja gravado continua funcionando e volta cifrado na
 * proxima gravacao.
 */
const PREFIXO = 'v1';

/**
 * Sem SECRETS_KEY, deriva do segredo do JWT. Serve para desenvolvimento; em
 * producao a chave e obrigatoria, porque derivar de outro segredo amarra a
 * rotacao dos dois (trocar o JWT tornaria os segredos de canal ilegiveis).
 */
function chave() {
  if (env.SECRETS_KEY) return Buffer.from(env.SECRETS_KEY, 'hex');
  return scryptSync(env.JWT_ACCESS_SECRET, 'plataforma-atendimento:segredos', 32);
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
    // Chave trocada ou registro corrompido. Devolver vazio faz o canal responder
    // "nao configurado" em vez de tentar autenticar com lixo na Graph API.
    console.error('[crypto] nao foi possivel decifrar um segredo de canal — confira SECRETS_KEY');
    return '';
  }
}

/** Avisa uma vez no arranque quando a producao esta sem chave dedicada. */
export function avisarChaveDerivada() {
  if (isProd && !env.SECRETS_KEY) {
    console.warn(
      '[crypto] SECRETS_KEY ausente: segredos de canal cifrados com chave derivada do JWT. ' +
        'Defina SECRETS_KEY (openssl rand -hex 32) antes de rotacionar os segredos do JWT.',
    );
  }
}
