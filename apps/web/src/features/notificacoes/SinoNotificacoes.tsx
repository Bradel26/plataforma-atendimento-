import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarConversa } from '../atendimento/AvatarConversa';
import { textoDaPrevia } from '../atendimento/previaTexto';
import { useAuth } from '../auth/AuthProvider';
import { useNotificacoesMensagens } from './useNotificacoesMensagens';

const hora = (iso: string) => {
  const data = new Date(iso);
  return data.toDateString() === new Date().toDateString()
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/** Sino da barra superior: mostra quantas mensagens estao sem leitura e abre a conversa ao clicar. */
export function SinoNotificacoes() {
  const { temModulo } = useAuth();
  const navegar = useNavigate();
  const { conversas, total } = useNotificacoesMensagens(temModulo('atendimento'));
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
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

  if (!temModulo('atendimento')) return null;

  const abrir = (caminho: string) => {
    setAberto(false);
    navegar(caminho);
  };

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={total > 0 ? `Notificações: ${total} mensagem(ns) não lida(s)` : 'Notificações: nenhuma mensagem nova'}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title="Notificações"
        className="anel-de-foco relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações de mensagens"
          className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Mensagens não lidas</p>
            <span className="text-xs text-slate-500">{total > 0 ? `${total} nova(s)` : 'Tudo em dia'}</span>
          </div>

          {conversas.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Nenhuma mensagem nova por enquanto.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {conversas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => abrir(`/atendimento?conversa=${encodeURIComponent(c.id)}`)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <AvatarConversa conversaId={c.id} nome={c.contato.nome} className="h-9 w-9 text-xs" avatarPath={`/contatos/${c.contato.id}/avatar`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{c.contato.nome}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{hora(c.ultimaMensagemEm)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{textoDaPrevia(c.ultimaMensagem)}</span>
                    </span>
                    <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-semibold texto-sobre-cor-fixa">
                      {c.naoLidas}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => abrir('/atendimento')}
            className="block w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-slate-50"
          >
            Abrir Atendimento
          </button>
        </div>
      )}
    </div>
  );
}
