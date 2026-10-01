import { useEffect, useRef, useState } from 'react';
import { obterImagemPrivada } from '../../lib/api';

const cache = new Map<string, { expiraEm: number; blob: Promise<Blob | null> }>();
const TEMPO_CACHE = 10 * 60_000;

function imagemEmCache(chave: string, caminho: string): Promise<Blob | null> {
  const agora = Date.now();
  const existente = cache.get(chave);
  if (existente && existente.expiraEm > agora) {
    cache.delete(chave);
    cache.set(chave, existente);
    return existente.blob;
  }
  if (existente) cache.delete(chave);

  const entrada = { expiraEm: agora + TEMPO_CACHE, blob: obterImagemPrivada(caminho) };
  cache.set(chave, entrada);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return entrada.blob;
}

/** Avatar privado e sob demanda; se o WhatsApp não tiver foto, mantém a inicial. */
export function AvatarConversa({ conversaId, nome, className, avatarPath }: {
  conversaId: string;
  nome: string;
  className: string;
  avatarPath?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    let cancelado = false;
    let objectUrl: string | null = null;
    const carregar = () => {
      const caminho = avatarPath ?? `/conversas/${conversaId}/avatar`;
      void imagemEmCache(caminho, caminho).then((blob) => {
        if (!blob || cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      });
    };
    const observar = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entradas) => {
          if (!entradas.some((entrada) => entrada.isIntersecting)) return;
          observar?.disconnect();
          carregar();
        });
    if (observar) observar.observe(elemento);
    else carregar();

    return () => {
      cancelado = true;
      observar?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversaId, avatarPath]);

  return (
    <span
      ref={ref}
      className={`mt-0.5 flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ${className}`}
      style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : nome.charAt(0).toUpperCase()}
    </span>
  );
}
