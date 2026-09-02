import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Input } from '../components/ui';
import { ListaConversas } from '../features/atendimento/ListaConversas';
import { PainelChat } from '../features/atendimento/PainelChat';
import { useConversas } from '../features/atendimento/useConversas';
import { useAuth } from '../features/auth/AuthProvider';
import { FiltroEtiquetas } from './crm/Etiquetas';
import { ApiError, api } from '../lib/api';
import {
  ABAS_ATENDIMENTO,
  LABEL_CONVERSA_STATUS,
  type ConversaDetalhe,
  type ConversaStatus,
  type Usuario,
} from '../lib/types';

export function AtendimentoPage() {
  const { temPerfil } = useAuth();
  const [aba, setAba] = useState<ConversaStatus>('EM_ESPERA');
  const [busca, setBusca] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  /**
   * Muda quando alguem etiqueta uma conversa, para o catalogo do filtro ser
   * buscado de novo.
   *
   * Sem isto, a etiqueta recem-criada no painel nao apareceria na lista de
   * filtros ate recarregar a pagina — o mesmo defeito que o teste de navegador
   * achou na aba de contatos.
   */
  const [versaoTags, setVersaoTags] = useState(0);
  const [aberta, setAberta] = useState<ConversaDetalhe | null>(null);
  const [erroAberta, setErroAberta] = useState<string | null>(null);
  const [agentes, setAgentes] = useState<Usuario[]>([]);
  const abertaIdRef = useRef<string | null>(null);

  const {
    conversas,
    contadores,
    carregando,
    erro,
    temMais,
    carregarMais,
    aplicarEvento,
    inscreverMensagens,
    focarConversa,
    recarregarContadores,
  } = useConversas(aba, tags);

  // A lista de destinos de transferencia so e visivel para admin e supervisor.
  useEffect(() => {
    if (!temPerfil('ADMIN', 'SUPERVISOR')) return;
    void api
      .get<{ usuarios: Usuario[] }>('/usuarios?perfil=AGENTE')
      .then(({ usuarios }) => setAgentes(usuarios))
      .catch(() => undefined);
  }, [temPerfil]);

  const abrir = useCallback(
    async (id: string) => {
      setErroAberta(null);
      try {
        const { conversa } = await api.get<{ conversa: ConversaDetalhe }>(`/conversas/${id}`);
        focarConversa(id, abertaIdRef.current);
        abertaIdRef.current = id;
        setAberta(conversa);

        if (conversa.naoLidas > 0) {
          const { conversa: lida } = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${id}/ler`);
          setAberta(lida);
          aplicarEvento(lida);
        }
      } catch (err) {
        setErroAberta(err instanceof ApiError ? err.message : 'Nao foi possivel abrir a conversa');
      }
    },
    [aplicarEvento, focarConversa],
  );

  // Mensagens novas entram direto na conversa aberta, sem recarregar.
  useEffect(
    () =>
      inscreverMensagens(({ conversaId, mensagem }) => {
        setAberta((atual) => {
          if (!atual || atual.id !== conversaId) return atual;
          if (atual.mensagens.some((m) => m.id === mensagem.id)) return atual;
          return { ...atual, mensagens: [...atual.mensagens, mensagem] };
        });
        void recarregarContadores().catch(() => undefined);
      }),
    [inscreverMensagens, recarregarContadores],
  );

  const aoMudar = useCallback(
    (detalhe: ConversaDetalhe) => {
      setAberta(detalhe);
      aplicarEvento(detalhe);
      // Qualquer mudanca na conversa aberta pode ter sido uma etiqueta nova.
      // Incrementar sempre e mais barato que comparar as listas, e o custo e uma
      // consulta ao catalogo — que a tela ja faria ao mudar de filtro.
      setVersaoTags((v) => v + 1);
    },
    [aplicarEvento],
  );

  const alternarTag = useCallback(
    (tag: string) => setTags((atual) => (atual.includes(tag) ? atual.filter((t) => t !== tag) : [...atual, tag])),
    [],
  );

  const filtradas = busca.trim()
    ? conversas.filter((c) => {
        const t = busca.trim().toLowerCase();
        return (
          c.contato.nome.toLowerCase().includes(t) ||
          (c.contato.email ?? '').toLowerCase().includes(t) ||
          (c.ultimaMensagem?.conteudo ?? '').toLowerCase().includes(t)
        );
      })
    : conversas;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-5">
      <section className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3">
          <Input placeholder="Buscar por contato ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        <nav className="flex border-b border-slate-200 text-xs">
          {ABAS_ATENDIMENTO.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setAba(status)}
              className={`flex-1 border-b-2 px-1 py-2.5 transition ${
                aba === status
                  ? 'border-[var(--brand-primary)] font-semibold text-[var(--brand-primary)]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="block truncate">{LABEL_CONVERSA_STATUS[status]}</span>
              <span className="text-[11px] text-slate-400">{contadores[status]}</span>
            </button>
          ))}
        </nav>

        {/*
          O filtro fica fora da area que rola, junto da busca e das abas: ele
          descreve o que a lista mostra, e rolar junto com o resultado o
          esconderia justamente quando a pessoa procura por que a lista esta
          curta. `FiltroEtiquetas` devolve null quando nao ha etiqueta nenhuma,
          entao nao ocupa espaco antes de existir a primeira.
        */}
        <div className="border-b border-slate-100 px-3 py-2 empty:hidden">
          <FiltroEtiquetas ativas={tags} aoAlternar={alternarTag} campo="conversas" versao={versaoTags} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {erro ? (
            <div className="p-4"><Alerta>{erro}</Alerta></div>
          ) : (
            <ListaConversas
              conversas={filtradas}
              selecionadaId={aberta?.id ?? null}
              onSelecionar={(id) => void abrir(id)}
              carregando={carregando}
              temMais={temMais}
              onCarregarMais={() => void carregarMais()}
            />
          )}
        </div>
      </section>

      <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {erroAberta ? (
          <div className="p-5"><Alerta>{erroAberta}</Alerta></div>
        ) : aberta ? (
          <PainelChat conversa={aberta} agentes={agentes} onMudou={aoMudar} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-slate-700">Selecione uma conversa</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              As conversas chegam em tempo real pelo Webchat. Abra o widget em{' '}
              <a href="/webchat" target="_blank" rel="noreferrer" className="text-[var(--brand-primary)] underline">
                /webchat
              </a>{' '}
              para simular um cliente.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
