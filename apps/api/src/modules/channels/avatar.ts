export type FotoPerfil = { buffer: Buffer; contentType: 'image/jpeg' | 'image/png' | 'image/webp' };

const HOSTS_CDN_PERMITIDOS = ['whatsapp.net', 'whatsapp.com', 'fbcdn.net', 'fbsbx.com'];
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

/** Baixa apenas imagens dos CDNs usados pelo WhatsApp/Meta, evitando SSRF por URL devolvida pelo provider. */
export async function baixarFotoDePerfil(url: string): Promise<FotoPerfil | null> {
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    return null;
  }

  const hostPermitido = HOSTS_CDN_PERMITIDOS.some(
    (host) => endereco.hostname === host || endereco.hostname.endsWith(`.${host}`),
  );
  if (endereco.protocol !== 'https:' || !hostPermitido) return null;

  try {
    const resposta = await fetch(endereco, { signal: AbortSignal.timeout(8_000), redirect: 'error' });
    if (!resposta.ok) return null;
    const tipo = resposta.headers.get('content-type')?.split(';')[0]?.toLowerCase();
    if (tipo !== 'image/jpeg' && tipo !== 'image/png' && tipo !== 'image/webp') return null;

    const tamanho = Number(resposta.headers.get('content-length'));
    if (Number.isFinite(tamanho) && tamanho > TAMANHO_MAXIMO) return null;
    const buffer = Buffer.from(await resposta.arrayBuffer());
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO) return null;
    return { buffer, contentType: tipo };
  } catch {
    return null;
  }
}

/** URL de foto nas respostas dos diferentes servidores WhatsApp. */
export function urlDaFotoPerfil(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const objeto = corpo as Record<string, unknown>;
  const interno = (objeto.results ?? objeto.data ?? objeto) as Record<string, unknown> | null;
  if (!interno || typeof interno !== 'object') return null;
  const miniatura = interno.profilePicThumbObj as Record<string, unknown> | null | undefined;
  for (const valor of [interno.eurl, interno.url, interno.profile_picture, miniatura?.eurl]) {
    if (typeof valor === 'string' && valor.trim()) return valor.trim();
  }
  return null;
}
