import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Mensagem } from '../../lib/types';

export type BlocoAnterior = { id: string; protocolo: string | null; criadoEm: string; mensagens: Mensagem[] };
type Resposta = {
  atendimento: BlocoAnterior | null;
  proximoCursor: string | null;
};

export function useAtendimentosAnteriores(conversaId: string) {
  const [blocos, setBlocos] = useState<BlocoAnterior[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [fim, setFim] = useState(false);
  const cursor = useRef<string | null>(null);
  const emVoo = useRef(false);

  useEffect(() => {
    setBlocos([]);
    setFim(false);
    cursor.current = null;
  }, [conversaId]);

  const carregarMais = useCallback(async () => {
    if (fim || emVoo.current) return;
    emVoo.current = true;
    setCarregando(true);
    try {
      const q = cursor.current ? `?cursor=${encodeURIComponent(cursor.current)}` : '';
      const r = await api.get<Resposta>(`/conversas/${conversaId}/anteriores${q}`);
      if (!r.atendimento) {
        setFim(true);
        return;
      }
      cursor.current = r.proximoCursor;
      setBlocos((atuais) => [r.atendimento!, ...atuais]);
      if (!r.proximoCursor) setFim(true);
    } finally {
      emVoo.current = false;
      setCarregando(false);
    }
  }, [conversaId, fim]);

  return { blocos, carregando, fim, carregarMais };
}
