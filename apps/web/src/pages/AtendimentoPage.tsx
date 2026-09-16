import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alerta, Input } from '../components/ui';
import { ListaConversas } from '../features/atendimento/ListaConversas';
import { PainelChat } from '../features/atendimento/PainelChat';
import { PainelContato } from '../features/atendimento/PainelContato';
import { useConversas } from '../features/atendimento/useConversas';
import { upsertPrevia } from '../features/atendimento/previas';
import { LABEL_VISAO_INBOX, VISOES_INBOX, type VisaoInbox } from '../features/atendimento/visao';
import { useAuth } from '../features/auth/AuthProvider';
import { FiltroEtiquetas } from './crm/Etiquetas';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { useFaixaDeLargura } from '../lib/useFaixaDeLargura';
import type { ConversaDetalhe, Previa, Usuario } from '../lib/types';

/**
 * Passo do fluxo em telas de uma coluna so (mobile): lista -> conversa ->
 * ficha, sempre uma por vez, com volta explicita — nunca as tres espremidas.
 */
type PassoMobile = 'lista' | 'chat' | 'ficha';

type MinhaLinhaWhatsapp = { id: string; ponteSessao: string | null; modo: string | null; ativo: boolean };

type QrDaPonte = {
  /** PNG em data URL. Nulo quando nao ha nada para escanear agora. */
  qr: string | null;
  conectado: boolean;
  motivo: string | null;
};

export function AtendimentoPage() {
  const { usuario, temPerfil } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ref: containerRef, faixa } = useFaixaDeLargura<HTMLDivElement>();
  /**
   * Visao da Inbox (Fase 11.3) — Minhas / Nao atribuidas / Todas. Comeca em
   * "Nao atribuidas": e a fila que precisa de alguem pegando, o mesmo motivo
   * que fazia `EM_ESPERA` ser a aba padrao antes desta fase.
   */
  const [visao, setVisao] = useState<VisaoInbox>('NAO_ATRIBUIDAS');
  const [busca, setBusca] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  /**
   * Ficha como drawer no notebook/tablet: comeca fechada (a resposta e a
   * tarefa mais frequente, e nao perde espaco pra uma ficha que ninguem pediu
   * ainda), mas fica aberta entre trocas de conversa uma vez que o atendente
   * abriu — reabrir a cada clique custaria mais do que vale.
   */
  const [fichaAberta, setFichaAberta] = useState(false);
  const [passoMobile, setPassoMobile] = useState<PassoMobile>('lista');
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
  const [previas, setPrevias] = useState<Previa[]>([]);
  const abertaIdRef = useRef<string | null>(null);

  /**
   * Linha pessoal de WhatsApp do proprio usuario logado, e se ela ja esta
   * conectada — self-service para o vendedor conectar o proprio numero sem
   * precisar de um ADMIN em Configuracoes. `null` cobre tanto "ainda nao
   * carregou" quanto "nao tem linha pessoal" (o placeholder de hoje serve
   * igualmente para os dois casos).
   */
  const [minhaLinha, setMinhaLinha] = useState<MinhaLinhaWhatsapp | null>(null);
  const [minhaLinhaConectada, setMinhaLinhaConectada] = useState(false);
  const [mostrarConectar, setMostrarConectar] = useState(false);
  const [qrConectar, setQrConectar] = useState<QrDaPonte | null>(null);

  useEffect(() => {
    void api
      .get<{ numero: MinhaLinhaWhatsapp | null }>('/canais/numeros/meu')
      .then(({ numero }) => setMinhaLinha(numero))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!minhaLinha || minhaLinha.modo !== 'NAO_OFICIAL') return;
    void api
      .get<{ estado: { situacao: string; detalhe: string | null } }>(
        `/canais/numeros/${minhaLinha.id}/ponte/estado`,
      )
      .then(({ estado }) => setMinhaLinhaConectada(estado.situacao === 'CONECTADO'))
      .catch(() => undefined);
  }, [minhaLinha]);

  /** Insere ou atualiza uma previa recebida por evento de socket — ver `upsertPrevia` (Fase 11.7). */
  const aplicarPrevia = useCallback((p: Previa) => {
    setPrevias((atual) => upsertPrevia(atual, p));
  }, []);

  // Aviso em tempo real de que a propria linha conectou/caiu, e de que uma
  // previa dela foi criada/atualizada — mesmo socket, ja gated por
  // `minhaLinha`: previa so existe para linha pessoal, a mesma condicao.
  useEffect(() => {
    if (!minhaLinha) return;
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.on(EVENTOS.canalStatus, (payload: { id: string; status: string }) => {
      if (payload.id !== minhaLinha.id) return;
      setMinhaLinhaConectada(payload.status === 'CONECTADO');
    });
    // O payload traz `canalConfigId` (usado pelo backend para escopar o
    // destinatario), que `Previa` nao tem — descartado aqui, sem precisar
    // estender o tipo compartilhado por um campo que a tela nunca usa.
    socket.on(EVENTOS.previaAtualizada, ({ canalConfigId: _canalConfigId, ...previa }: Previa & { canalConfigId: string }) => {
      aplicarPrevia(previa);
    });
    return () => {
      socket.disconnect();
    };
  }, [minhaLinha, aplicarPrevia]);

  // Enquanto o card "Conectar WhatsApp" esta aberto, busca o QR e faz
  // polling a cada 5s ate a conexao acontecer — mesmo intervalo de CanaisTab.tsx.
  useEffect(() => {
    if (!mostrarConectar || !minhaLinha) return;
    let vivo = true;

    const buscar = async () => {
      try {
        const r = await api.get<QrDaPonte>(`/canais/numeros/${minhaLinha.id}/ponte/qr`);
        if (!vivo) return;
        setQrConectar(r);
        if (r.conectado) {
          setMinhaLinhaConectada(true);
          setMostrarConectar(false);
        }
      } catch {
        // Silencio proposital: a ponte cair nao pode apagar o QR ja exibido.
      }
    };

    void buscar();
    const timer = window.setInterval(() => {
      void buscar();
    }, 5_000);

    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [mostrarConectar, minhaLinha]);

  // A conexao confirmada por evento fecha o card mesmo sem o polling ter rodado ainda.
  useEffect(() => {
    if (minhaLinhaConectada) setMostrarConectar(false);
  }, [minhaLinhaConectada]);

  const precisaConectarWhatsapp = Boolean(minhaLinha && minhaLinha.modo === 'NAO_OFICIAL' && !minhaLinhaConectada);

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
  } = useConversas(visao, tags, usuario?.id ?? null);

  /**
   * Contador exibido em cada aba, so quando o backend fornece um numero exato
   * para aquela visao — `GET /conversas/contadores` agrupa por `status`, sem
   * separar "atribuida a mim" de "atribuida a outro agente". "Nao atribuidas"
   * usa `contadores.EM_ESPERA` direto (a mesma contagem exata de antes desta
   * fase); "Todas" soma os quatro status (tambem exato, ja escopado pela
   * politica de visibilidade no backend). "Minhas" fica sem numero: inventar
   * um contador que a API nao fornece pareceria dado, sem ser.
   */
  const contadorDaVisao = (v: VisaoInbox): number | null => {
    if (v === 'NAO_ATRIBUIDAS') return contadores.EM_ESPERA;
    if (v === 'TODAS') return Object.values(contadores).reduce((soma, n) => soma + n, 0);
    return null;
  };

  // A lista de destinos de transferencia so e visivel para admin e supervisor.
  useEffect(() => {
    if (!temPerfil('ADMIN', 'SUPERVISOR')) return;
    void api
      .get<{ usuarios: Usuario[] }>('/usuarios?perfil=AGENTE')
      .then(({ usuarios }) => setAgentes(usuarios))
      .catch(() => undefined);
  }, [temPerfil]);

  useEffect(() => {
    void api
      .get<{ previas: Previa[] }>('/conversas/previas')
      .then(({ previas }) => setPrevias(previas))
      .catch(() => undefined);
  }, []);

  const abrir = useCallback(
    async (id: string) => {
      setErroAberta(null);
      // No mobile, abrir uma conversa e o gesto que avanca da lista pro chat —
      // sem isto a pessoa tocaria na conversa e continuaria olhando a lista.
      setPassoMobile('chat');
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

  /**
   * Abre uma previa: reaproveita o Contact existente por telefone, ou cria um
   * minimo -- a ficha completa o vendedor preenche depois, no CRM, se quiser;
   * a prioridade aqui e nao bloquear a conversa por falta de cadastro.
   */
  const abrirPrevia = useCallback(
    async (previa: Previa) => {
      setErroAberta(null);
      try {
        const { contato } = await api.post<{ contato: { id: string } }>('/contatos/por-telefone', {
          telefone: previa.numero,
          nome: previa.nome,
        });
        const { conversa } = await api.post<{ conversa: { id: string } }>('/conversas', { contatoId: contato.id });
        setPrevias((atual) => atual.filter((p) => p.id !== previa.id));
        await abrir(conversa.id);
      } catch (err) {
        setErroAberta(err instanceof ApiError ? err.message : 'Nao foi possivel abrir a conversa');
      }
    },
    [abrir],
  );

  /**
   * Chega aqui vindo do botao "Iniciar conversa" da ficha do contato
   * (`/atendimento?conversa=<id>`): abre a conversa direto, sem exigir clique
   * na lista. Limpa o parametro logo depois — sem isso, um F5 reabriria a
   * mesma conversa toda vez.
   */
  useEffect(() => {
    const id = searchParams.get('conversa');
    if (!id) return;
    void abrir(id);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  /*
   * Quatro faixas, quatro composicoes — nao a mesma coluna de sempre so
   * encolhendo:
   *
   * - desktop (>=1440 de CONTEUDO, medido no container): as tres colunas
   *   lado a lado, como sempre foi.
   * - notebook/tablet (1024-1439 / 768-1023): lista + chat lado a lado; a
   *   ficha vira um painel que abre por baixo do botao "Ficha do contato" no
   *   cabecalho do chat, e some sem perder a conversa por baixo.
   * - mobile (<768): uma tela por vez — lista, chat ou ficha — com volta
   *   explicita, nunca as tres espremidas.
   */
  const emMobile = faixa === 'mobile';
  const mostrarLista = !emMobile || passoMobile === 'lista';
  const mostrarChat = !emMobile || passoMobile === 'chat';
  const fichaVisivel = Boolean(aberta) && (faixa === 'desktop' || (emMobile ? passoMobile === 'ficha' : fichaAberta));

  const alternarFicha = emMobile ? () => setPassoMobile('ficha') : () => setFichaAberta((v) => !v);
  const fecharFicha = emMobile ? () => setPassoMobile('chat') : () => setFichaAberta(false);

  const classesLista = emMobile ? 'w-full' : faixa === 'tablet' ? 'w-64 shrink-0' : 'w-80 shrink-0';
  const classesFicha = emMobile ? 'w-full' : 'w-72 shrink-0';

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-8rem)] gap-5">
      {mostrarLista && (
        <section
          className={`flex ${classesLista} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white`}
        >
          <div className="border-b border-slate-100 p-3">
            <Input placeholder="Buscar por contato ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <nav className="flex border-b border-slate-200 text-xs">
            {VISOES_INBOX.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisao(v)}
                className={`flex-1 border-b-2 px-1 py-2.5 transition ${
                  visao === v
                    ? 'border-[var(--brand-primary)] font-semibold text-[var(--brand-primary)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="block truncate">{LABEL_VISAO_INBOX[v]}</span>
                <span className="text-[11px] text-slate-500">{contadorDaVisao(v) ?? ''}</span>
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
                previas={previas}
                onAbrirPrevia={(p) => void abrirPrevia(p)}
                selecionadaId={aberta?.id ?? null}
                onSelecionar={(id) => void abrir(id)}
                carregando={carregando}
                temMais={temMais}
                onCarregarMais={() => void carregarMais()}
              />
            )}
          </div>
        </section>
      )}

      {mostrarChat && (
        <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {erroAberta ? (
            <div className="p-5"><Alerta>{erroAberta}</Alerta></div>
          ) : aberta ? (
            <PainelChat
              conversa={aberta}
              agentes={agentes}
              onMudou={aoMudar}
              aoVoltarParaLista={emMobile ? () => setPassoMobile('lista') : undefined}
              aoAlternarFicha={faixa === 'desktop' ? undefined : alternarFicha}
              fichaAberta={fichaVisivel}
            />
          ) : precisaConectarWhatsapp ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-slate-700">Conecte seu WhatsApp para comecar a atender</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Sua linha pessoal de WhatsApp ainda nao esta pareada. Conecte para receber as conversas dos seus
                clientes aqui.
              </p>

              {!mostrarConectar ? (
                <button
                  type="button"
                  onClick={() => setMostrarConectar(true)}
                  className="mt-4 rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Conectar
                </button>
              ) : (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                  {qrConectar?.qr ? (
                    <div className="flex flex-col items-center gap-3">
                      <img src={qrConectar.qr} alt="QR Code do WhatsApp" className="h-48 w-48 rounded border border-slate-200" />
                      <p className="max-w-xs text-xs text-slate-600">
                        Abra o WhatsApp no seu celular, toque em <strong>Aparelhos conectados</strong> e depois em{' '}
                        <strong>Conectar aparelho</strong> apontando a camera para este codigo.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {qrConectar?.motivo ?? 'Gerando o QR Code...'}
                    </p>
                  )}
                </div>
              )}
            </div>
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
      )}

      {/*
        Quem e essa pessoa, sem sair da conversa.

        No desktop e coluna fixa; fora dele e um painel que so ocupa espaco
        quando alguem pediu — reabrir a cada troca de conversa custaria mais
        cliques do que vale, entao o estado fica aberto entre trocas.
      */}
      {fichaVisivel && aberta && (
        <aside className={`flex ${classesFicha} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white`}>
          <PainelContato contatoId={aberta.contato.id} aoFechar={faixa === 'desktop' ? undefined : fecharFicha} />
        </aside>
      )}
    </div>
  );
}
