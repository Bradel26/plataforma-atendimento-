import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconeMais, IconeSorriso } from './icones';

/** Botao quadrado so com icone, usado na barra de ferramentas do campo de resposta. */
export const BOTAO_ICONE =
  'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';

/** Abre/fecha um painel flutuante; fecha ao clicar fora e com Esc. */
export function usePopover() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);
  return { aberto, setAberto, ref };
}

const GRUPOS_EMOJI: Array<{ nome: string; itens: string[] }> = [
  {
    nome: 'Rostos',
    itens: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥳', '🤗', '🤔', '😐', '🙄', '😏', '😴', '😌', '😢', '😭', '😤', '😡', '😱', '😳', '🥺', '😬'],
  },
  { nome: 'Gestos', itens: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '👋', '✌️', '🤞', '👌', '💪', '🤙', '👀'] },
  {
    nome: 'Símbolos',
    itens: ['❤️', '💙', '💚', '💛', '🧡', '💜', '🔥', '✨', '⭐', '🎉', '🎁', '✅', '❌', '⚠️', '❓', '❗', '💯', '📞', '📱', '💬', '📎', '📅', '⏰', '💰', '📍', '🚀'],
  },
];

/** Seletor de emoji: clica e o emoji e inserido onde estava o cursor do campo de texto. */
export function BotaoEmoji({
  desabilitado,
  aoEscolher,
}: {
  desabilitado?: boolean;
  aoEscolher: (emoji: string) => void;
}) {
  const { aberto, setAberto, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => setAberto((v) => !v)}
        aria-label="Inserir emoji"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title="Emoji"
        className={BOTAO_ICONE}
      >
        <IconeSorriso tamanho={19} />
      </button>
      {aberto && (
        <div
          role="dialog"
          aria-label="Escolher emoji"
          className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          {GRUPOS_EMOJI.map((grupo) => (
            <div key={grupo.nome} className="mb-1">
              <p className="px-1 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{grupo.nome}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {grupo.itens.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    // mouseDown: nao tira o foco do campo de texto antes de inserir.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => aoEscolher(emoji)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition hover:bg-slate-100"
                    aria-label={`Emoji ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type ItemMenuMais = {
  chave: string;
  rotulo: string;
  icone: ReactNode;
  desabilitado?: boolean;
  aoSelecionar: () => void;
};

/** Botao "+": menu com as acoes extras do campo de resposta. */
export function BotaoMais({ itens, desabilitado }: { itens: ItemMenuMais[]; desabilitado?: boolean }) {
  const { aberto, setAberto, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => setAberto((v) => !v)}
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Mais opções"
        className={`${BOTAO_ICONE} border border-slate-200 bg-slate-100`}
      >
        <IconeMais tamanho={19} />
      </button>
      {aberto && (
        <div
          role="menu"
          aria-label="Mais opções"
          className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {itens.map((item) => (
            <button
              key={item.chave}
              type="button"
              role="menuitem"
              disabled={item.desabilitado}
              onClick={() => {
                setAberto(false);
                item.aoSelecionar();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-slate-500">{item.icone}</span>
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
