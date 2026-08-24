import { Badge } from '../../components/ui';
import type { ConversaResumo } from '../../lib/types';

function horaCurta(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  return mesmoDia
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function previa(conversa: ConversaResumo) {
  const m = conversa.ultimaMensagem;
  if (!m) return 'Sem mensagens';
  const prefixo = m.autor === 'AGENTE' ? 'Voce: ' : m.autor === 'SISTEMA' ? '' : '';
  return `${prefixo}${m.conteudo}`;
}

export function ListaConversas({
  conversas,
  selecionadaId,
  onSelecionar,
  carregando,
}: {
  conversas: ConversaResumo[];
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  carregando: boolean;
}) {
  if (carregando && conversas.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Carregando conversas...</p>;
  }

  if (conversas.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Nenhuma conversa nesta aba.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {conversas.map((c) => {
        const ativa = c.id === selecionadaId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelecionar(c.id)}
              className={`w-full px-4 py-3 text-left transition ${
                ativa ? 'bg-[var(--brand-primary)]/8' : 'hover:bg-slate-50'
              }`}
              style={ativa ? { borderLeft: '3px solid var(--brand-primary)' } : { borderLeft: '3px solid transparent' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-800">{c.contato.nome}</span>
                <span className="shrink-0 text-xs text-slate-400">{horaCurta(c.ultimaMensagemEm)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">{previa(c)}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Badge tom="neutro">{c.canal}</Badge>
                {c.fila && <Badge tom="neutro">{c.fila.nome}</Badge>}
                {c.agente && <Badge tom="marca">{c.agente.nome}</Badge>}
                {c.naoLidas > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                    {c.naoLidas}
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
