import { cloneElement, isValidElement, useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Contexto extra pra um controle sem texto visivel (icone) ou texto truncado —
 * nunca o unico lugar onde uma informacao essencial mora.
 *
 * Aparece no hover E no foco por teclado: um `title` nativo nao aparece em
 * toque nem responde a Tab, entao quem navega so com teclado nunca veria o
 * que o icone quer dizer.
 *
 * `onFocus`/`onBlur` no `<span>` que envolve o filho bastam — o React
 * propaga foco e blur de descendentes ate o ancestral que escuta, sem
 * precisar clonar um handler dentro do filho.
 */
export function Tooltip({ texto, children }: { texto: string; children: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  const id = useId();

  const alvo = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-describedby': id })
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      onFocus={() => setVisivel(true)}
      onBlur={() => setVisivel(false)}
    >
      {alvo}
      {visivel && (
        <span
          id={id}
          role="tooltip"
          /*
           * Cor fixa, fora da escala `slate-*` — essa escala e invertida no
           * tema escuro de proposito (texto vira claro, fundo vira escuro), e
           * um balao que deve ser SEMPRE um chip escuro com texto claro
           * (flutuante, independente do tema da pagina) ficaria branco sobre
           * branco se usasse `bg-slate-800` e o app estivesse no tema claro
           * remapeado ao contrario, ou texto invisivel no escuro.
           */
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1e293b] px-2 py-1 text-xs text-white shadow-lg"
        >
          {texto}
        </span>
      )}
    </span>
  );
}
