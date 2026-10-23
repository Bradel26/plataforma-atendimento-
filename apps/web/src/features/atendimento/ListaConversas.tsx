import { Badge } from '../../components/ui';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { EtiquetasCompactas } from '../../pages/crm/Etiquetas';
import { LABEL_CONVERSA_STATUS, type ConversaResumo, type Previa } from '../../lib/types';
import { AvatarConversa } from './AvatarConversa';
import { CLASSE_STATUS, clienteAguardandoDesde, esperaCurta, esperaPorExtenso } from './apresentacao';
import { IconeRelogio, IconeWhatsapp } from './icones';
import { textoDaPrevia } from './previaTexto';

/** Silhueta de um cartao de conversa: avatar, nome+hora, previa. */
function SkeletonConversa() {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5" aria-hidden="true">
      <SkeletonBloco className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <SkeletonBloco className="h-3 w-2/5" />
          <SkeletonBloco className="h-2.5 w-8 shrink-0" />
        </div>
        <SkeletonBloco className="h-2.5 w-4/5" />
        <SkeletonBloco className="h-4 w-1/2" />
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

function SetaOrigem({ origem }: { origem: ConversaResumo['origem'] }) {
  const ativa = origem === 'ATIVO';
  const rotulo = ativa ? 'Iniciada pela empresa' : 'Iniciada pelo cliente';
  return (
    <span className="shrink-0 text-xs text-slate-400" title={rotulo} aria-label={rotulo}>
      {ativa ? '↗' : '↙'}
    </span>
  );
}

function ContadorNaoLidas({ n }: { n: number }) {
  return (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-semibold texto-sobre-cor-fixa">
      {n}
    </span>
  );
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
  usuarioId = null,
}: {
  conversas: ConversaResumo[];
  previas: Previa[];
  onAbrirPrevia: (previa: Previa) => void;
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  carregando: boolean;
  temMais?: boolean;
  onCarregarMais?: () => void;
  /** Esconde o selo do responsavel quando e o proprio usuario: repetiria o mesmo nome em todo cartao. */
  usuarioId?: string | null;
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
    return <p className="px-4 py-8 text-center text-sm text-slate-500">Nenhuma conversa nesta aba.</p>;
  }

  const agora = Date.now();

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
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
                style={{ borderLeft: '3px solid transparent' }}
              >
                <span
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
                >
                  {p.nome.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{p.nome}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{horaCurta(p.ultimaMensagemEm)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-slate-500">{p.ultimaMensagem}</p>
                    {p.naoLidas > 0 && <ContadorNaoLidas n={p.naoLidas} />}
                  </div>
                  {/*
                    Ainda nao e um atendimento formal — so um chat espelhado do
                    celular do vendedor (ver ChatPreview, Fase 11.4/11.5). O
                    badge e a unica pista visual disso; sem ele o cartao fica
                    identico ao de uma Conversation de verdade.
                  */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge tom="alerta">Prévia</Badge>
                  </div>
                </div>
              </button>
            </li>
          );
        }

        const c = item.dado;
        const ativa = c.id === selecionadaId;
        const aguardandoDesde = c.ultimaMensagem ? clienteAguardandoDesde(c.status, [c.ultimaMensagem]) : null;
        const mostrarAgente = c.agente && c.agente.id !== usuarioId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelecionar(c.id)}
              aria-current={ativa || undefined}
              // `relative`: ancora o texto sr-only (absoluto) dentro do cartao; sem
              // isso ele escapa da lista rolavel e estica a altura da pagina.
              className={`relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${
                ativa ? 'bg-[var(--brand-primary-soft)]' : 'hover:bg-slate-50'
              }`}
              style={{ borderLeft: `3px solid ${ativa ? 'var(--brand-primary)' : 'transparent'}` }}
            >
              <AvatarConversa
                conversaId={c.id}
                nome={c.contato.nome}
                avatarPath={`/contatos/${c.contato.id}/avatar`}
                // O avatar sem foto usa o mesmo tom suave do cartao selecionado; o anel o separa do fundo.
                className={`h-10 w-10 text-sm ${ativa ? 'ring-2 ring-white' : ''}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{c.contato.nome}</span>
                  <SetaOrigem origem={c.origem} />
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{horaCurta(c.ultimaMensagemEm)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13px] text-slate-500">{textoDaPrevia(c.ultimaMensagem)}</p>
                  {c.naoLidas > 0 && <ContadorNaoLidas n={c.naoLidas} />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex max-w-[9rem] items-center gap-1 text-[11px] text-slate-500" title={c.linha?.nome ?? c.canal}>
                    {c.canal === 'WHATSAPP' && <IconeWhatsapp tamanho={14} className="text-emerald-500" />}
                    <span className="truncate">{c.linha?.nome ?? c.canal}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASSE_STATUS[c.status]}`}>
                    {LABEL_CONVERSA_STATUS[c.status]}
                  </span>
                  {aguardandoDesde && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                      title={`Cliente aguardando resposta há ${esperaPorExtenso(aguardandoDesde, agora)}`}
                    >
                      <IconeRelogio tamanho={12} />
                      {esperaCurta(aguardandoDesde, agora)} sem resposta
                    </span>
                  )}
                  {/* IA desligada e o estado comum: so o leitor de tela ouve, para nao repetir um selo em todo cartao. */}
                  {c.iaAtiva === true && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">IA ON</span>
                  )}
                  {c.iaAtiva === false && <span className="sr-only">IA OFF</span>}
                  {c.fila && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" title={`Equipe: ${c.fila.nome}`}>
                      {c.fila.nome}
                    </span>
                  )}
                  {mostrarAgente && (
                    <span className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-primary)]">
                      {c.agente!.nome}
                    </span>
                  )}
                </div>
                {/* Linha propria: uma etiqueta longa empurraria os selos acima para fora do cartao. */}
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
            className="w-full rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Carregar conversas anteriores
          </button>
        </li>
      )}
    </ul>
  );
}
