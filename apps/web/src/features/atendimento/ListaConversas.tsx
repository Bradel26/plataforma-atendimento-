import { Badge } from '../../components/ui';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { EtiquetasCompactas } from '../../pages/crm/Etiquetas';
import type { ConversaResumo, Previa } from '../../lib/types';

/** Silhueta de um cartao de conversa: avatar, nome+hora, previa. */
function SkeletonConversa() {
  return (
    <li className="flex items-start gap-2.5 px-4 py-3" aria-hidden="true">
      <SkeletonBloco className="mt-0.5 h-9 w-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <SkeletonBloco className="h-3 w-2/5" />
          <SkeletonBloco className="h-2.5 w-8 shrink-0" />
        </div>
        <SkeletonBloco className="h-2.5 w-4/5" />
      </div>
    </li>
  );
}

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

type Item = { tipo: 'conversa'; dado: ConversaResumo } | { tipo: 'previa'; dado: Previa };

export function ListaConversas({
  conversas,
  previas,
  onAbrirPrevia,
  selecionadaId,
  onSelecionar,
  carregando,
  temMais = false,
  onCarregarMais,
}: {
  conversas: ConversaResumo[];
  previas: Previa[];
  onAbrirPrevia: (previa: Previa) => void;
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  carregando: boolean;
  temMais?: boolean;
  onCarregarMais?: () => void;
}) {
  if (carregando && conversas.length === 0 && previas.length === 0) {
    return (
      <ul className="divide-y divide-slate-100">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonConversa key={i} />
        ))}
      </ul>
    );
  }

  // Prevista e conversa formal disputam a mesma lista, ordenadas por data —
  // e assim que o WhatsApp pessoal do vendedor mostra os dois tipos de papo
  // juntos, sem separar "ainda nao promovido" do resto.
  const itens: Item[] = [
    ...conversas.map((c): Item => ({ tipo: 'conversa', dado: c })),
    ...previas.map((p): Item => ({ tipo: 'previa', dado: p })),
  ].sort((a, b) => new Date(b.dado.ultimaMensagemEm).getTime() - new Date(a.dado.ultimaMensagemEm).getTime());

  if (itens.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Nenhuma conversa nesta aba.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {itens.map((item) => {
        if (item.tipo === 'previa') {
          const p = item.dado;
          return (
            <li key={`previa-${p.id}`}>
              <button
                type="button"
                onClick={() => onAbrirPrevia(p)}
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-slate-50"
                style={{ borderLeft: '3px solid transparent' }}
              >
                <span
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
                >
                  {p.nome.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{p.nome}</span>
                    <span className="shrink-0 text-xs text-slate-500">{horaCurta(p.ultimaMensagemEm)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{p.ultimaMensagem}</p>
                  {p.naoLidas > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                        {p.naoLidas}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        }

        const c = item.dado;
        const ativa = c.id === selecionadaId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelecionar(c.id)}
              className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition ${
                ativa ? 'bg-[var(--brand-primary)]/8' : 'hover:bg-slate-50'
              }`}
              style={ativa ? { borderLeft: '3px solid var(--brand-primary)' } : { borderLeft: '3px solid transparent' }}
            >
              {/* Iniciais, e nao foto: nenhum canal manda avatar do cliente, e um
                  circulo vazio no lugar chamaria mais atencao que a inicial. */}
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
              >
                {c.contato.nome.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{c.contato.nome}</span>
                  <span className="shrink-0 text-xs text-slate-500">{horaCurta(c.ultimaMensagemEm)}</span>
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
                {/* Linha propria, abaixo de canal e fila: aquela linha ja disputa
                    espaco com o contador de nao lidas, e uma etiqueta longa
                    empurraria o contador para fora do cartao. */}
                {c.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <EtiquetasCompactas tags={c.tags} />
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}

      {temMais && onCarregarMais && (
        <li className="p-3">
          <button
            type="button"
            onClick={onCarregarMais}
            className="w-full rounded-lg border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            Carregar conversas anteriores
          </button>
        </li>
      )}
    </ul>
  );
}
