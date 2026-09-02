import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import type { Contadores, ConversaDetalhe, ConversaResumo, ConversaStatus, Mensagem } from '../../lib/types';

type MensagemEvento = { conversaId: string; mensagem: Mensagem };

const CONTADORES_ZERADOS: Contadores = {
  EM_ESPERA: 0,
  ATRIBUIDO: 0,
  EM_ATENDIMENTO: 0,
  FINALIZADO: 0,
};

/** Ordena por atividade mais recente, como no painel de referencia. */
const porAtividade = (a: ConversaResumo, b: ConversaResumo) =>
  new Date(b.ultimaMensagemEm).getTime() - new Date(a.ultimaMensagemEm).getTime();

/** Converte o detalhe (que vem nos eventos) para o formato da lista. */
function paraResumo(c: ConversaDetalhe | ConversaResumo): ConversaResumo {
  if ('mensagens' in c) {
    const { mensagens, ...resto } = c;
    return { ...resto, ultimaMensagem: mensagens.at(-1) ?? null };
  }
  return c;
}

/**
 * Estado do painel de atendimento: lista da aba ativa, contadores e conversa
 * aberta, mantidos em sincronia por WebSocket.
 */
export function useConversas(aba: ConversaStatus, tags: readonly string[] = []) {
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [contadores, setContadores] = useState<Contadores>(CONTADORES_ZERADOS);
  const [carregando, setCarregando] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Estado (nao ref) de proposito: consumidores precisam reinscrever quando a
  // instancia do socket trocar.
  const [socket, setSocket] = useState<Socket | null>(null);
  const abaRef = useRef(aba);
  abaRef.current = aba;

  /*
   * As etiquetas ativas viram uma string, e e ela que entra nas dependencias.
   *
   * O array chega novo em cada render de quem chama, entao usa-lo direto
   * recarregaria a lista a cada tecla digitada em qualquer campo da pagina. A
   * string muda somente quando o filtro muda de verdade.
   */
  const chaveTags = tags.join(',');
  const tagsRef = useRef<readonly string[]>(tags);
  tagsRef.current = tags;

  /** Trecho de query das etiquetas: `&tags=a&tags=b`, ou vazio. */
  const queryTags = useCallback(
    () => tagsRef.current.map((t) => `&tags=${encodeURIComponent(t)}`).join(''),
    [],
  );

  const carregarContadores = useCallback(async () => {
    const { contadores: c } = await api.get<{ contadores: Contadores }>('/conversas/contadores');
    setContadores(c);
  }, []);

  const carregarLista = useCallback(
    async (status: ConversaStatus) => {
      setCarregando(true);
      try {
        const { conversas: lista, proximoCursor: proximo } = await api.get<{
          conversas: ConversaResumo[];
          proximoCursor: string | null;
        }>(`/conversas?status=${status}${queryTags()}`);
        setConversas(lista.sort(porAtividade));
        setCursor(proximo);
        setErro(null);
      } catch {
        setErro('Nao foi possivel carregar as conversas');
      } finally {
        setCarregando(false);
      }
    },
    [queryTags],
  );

  /**
   * Proxima pagina da aba. Concatena em vez de substituir, e descarta repetido
   * pelo id: entre uma pagina e outra chega mensagem nova, e a mesma conversa
   * pode aparecer nas duas.
   */
  const carregarMais = useCallback(async () => {
    if (!cursor) return;
    try {
      const { conversas: lista, proximoCursor: proximo } = await api.get<{
        conversas: ConversaResumo[];
        proximoCursor: string | null;
      }>(`/conversas?status=${abaRef.current}&cursor=${encodeURIComponent(cursor)}${queryTags()}`);
      setConversas((atual) => {
        const vistos = new Set(atual.map((c) => c.id));
        return [...atual, ...lista.filter((c) => !vistos.has(c.id))].sort(porAtividade);
      });
      setCursor(proximo);
    } catch {
      setErro('Nao foi possivel carregar mais conversas');
    }
  }, [cursor, queryTags]);

  // `chaveTags` nas dependencias, e nao `tags`: ver o comentario na declaracao.
  useEffect(() => {
    void carregarLista(aba);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, chaveTags, carregarLista]);

  useEffect(() => {
    void carregarContadores().catch(() => undefined);
  }, [carregarContadores]);

  /**
   * Insere ou remove a conversa da aba ativa conforme o status dela mudou.
   *
   * O filtro de etiqueta entra aqui tambem, e nao so na consulta: um evento de
   * WebSocket chega para todas as conversas da fila, e sem esta checagem uma
   * conversa sem a etiqueta filtrada apareceria na lista filtrada — a tela
   * mostrando o oposto do que o filtro pede. Vale nos dois sentidos: retirar a
   * etiqueta de uma conversa a faz sair da lista na hora.
   */
  const aplicarEvento = useCallback(
    (detalhe: ConversaDetalhe) => {
      const resumo = paraResumo(detalhe);
      setConversas((atual) => {
        const semEla = atual.filter((c) => c.id !== resumo.id);
        if (resumo.status !== abaRef.current) return semEla;
        const cabeNoFiltro = tagsRef.current.every((t) => resumo.tags.includes(t));
        if (!cabeNoFiltro) return semEla;
        return [...semEla, resumo].sort(porAtividade);
      });
      void carregarContadores().catch(() => undefined);
    },
    [carregarContadores],
  );

  // Um unico socket para todo o painel, reconectado se o token mudar.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const instancia = conectar({ token });
    setSocket(instancia);

    instancia.on(EVENTOS.conversaNova, aplicarEvento);
    instancia.on(EVENTOS.conversaAtualizada, aplicarEvento);

    return () => {
      instancia.off(EVENTOS.conversaNova, aplicarEvento);
      instancia.off(EVENTOS.conversaAtualizada, aplicarEvento);
      instancia.disconnect();
      setSocket(null);
    };
  }, [aplicarEvento]);

  /** Retorna a funcao de limpeza esperada pelo useEffect (precisa devolver void). */
  const inscreverMensagens = useCallback(
    (ouvinte: (evento: MensagemEvento) => void) => {
      if (!socket) return () => {};
      socket.on(EVENTOS.mensagemNova, ouvinte);
      return () => {
        socket.off(EVENTOS.mensagemNova, ouvinte);
      };
    },
    [socket],
  );

  /** Entra na sala da conversa aberta para receber as mensagens dela. */
  const focarConversa = useCallback(
    (id: string | null, anterior?: string | null) => {
      if (!socket) return;
      if (anterior) socket.emit('conversa:sair', anterior);
      if (id) socket.emit('conversa:entrar', id);
    },
    [socket],
  );

  return useMemo(
    () => ({
      conversas,
      contadores,
      carregando,
      erro,
      temMais: cursor !== null,
      carregarMais,
      recarregar: () => carregarLista(abaRef.current),
      recarregarContadores: carregarContadores,
      aplicarEvento,
      inscreverMensagens,
      focarConversa,
    }),
    [conversas, contadores, carregando, erro, cursor, carregarMais, carregarLista, carregarContadores, aplicarEvento, inscreverMensagens, focarConversa],
  );
}
