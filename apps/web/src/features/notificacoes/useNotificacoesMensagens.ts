import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import type { ConversaResumo } from '../../lib/types';

/** Maximo de conversas listadas no sino; o total no selo conta todas as mensagens nao lidas. */
const LIMITE_LISTA = 8;

/**
 * Mensagens nao lidas do usuario para o sino da barra superior.
 *
 * Reaproveita `GET /conversas` (as abas Minhas e Atribuidas) e filtra as que tem `naoLidas > 0`: a API continua
 * sendo a unica a decidir o que o usuario pode ver. Os eventos de tempo real (conversa/mensagem nova) so
 * disparam uma nova consulta, com pequena espera para juntar rajadas.
 */
export function useNotificacoesMensagens(ativo: boolean) {
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [total, setTotal] = useState(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [minhas, atribuidas] = await Promise.all([
        api.get<{ conversas: ConversaResumo[] }>('/conversas?visao=MINHAS'),
        api.get<{ conversas: ConversaResumo[] }>('/conversas?visao=ATRIBUIDAS'),
      ]);
      const unicas = new Map<string, ConversaResumo>();
      for (const c of [...minhas.conversas, ...atribuidas.conversas]) {
        if (c.naoLidas > 0 && !c.arquivada) unicas.set(c.id, c);
      }
      const lista = [...unicas.values()].sort(
        (a, b) => new Date(b.ultimaMensagemEm).getTime() - new Date(a.ultimaMensagemEm).getTime(),
      );
      setTotal(lista.reduce((soma, c) => soma + c.naoLidas, 0));
      setConversas(lista.slice(0, LIMITE_LISTA));
    } catch {
      // Sem permissao ou sem rede: o sino fica vazio em vez de quebrar a barra superior.
    }
  }, []);

  useEffect(() => {
    if (!ativo) return;
    void carregar();
    const token = getAccessToken();
    if (!token) return;

    const agendar = () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => void carregar(), 700);
    };
    const socket = conectar({ token });
    socket.on(EVENTOS.conversaNova, agendar);
    socket.on(EVENTOS.conversaAtualizada, agendar);
    socket.on(EVENTOS.mensagemNova, agendar);
    return () => {
      if (espera.current) clearTimeout(espera.current);
      socket.off(EVENTOS.conversaNova, agendar);
      socket.off(EVENTOS.conversaAtualizada, agendar);
      socket.off(EVENTOS.mensagemNova, agendar);
      socket.disconnect();
    };
  }, [ativo, carregar]);

  return { conversas, total, recarregar: carregar };
}
