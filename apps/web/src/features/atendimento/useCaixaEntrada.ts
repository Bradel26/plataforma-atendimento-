import { useCallback, useEffect, useState } from 'react';
import { api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import type { ConversaDetalhe, ConversaResumo } from '../../lib/types';
import { aplicarNaCaixa, type GrupoCaixa } from './caixaEntrada';

const paraResumo = (c: ConversaDetalhe | ConversaResumo): ConversaResumo => {
  if ('mensagens' in c) {
    const { mensagens, ...resto } = c;
    return { ...resto, ultimaMensagem: mensagens.at(-1) ?? null };
  }
  return c;
};

export function useCaixaEntrada() {
  const [grupos, setGrupos] = useState<GrupoCaixa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<{ grupos: GrupoCaixa[] }>('/conversas/caixa-entrada');
      setGrupos(r.grupos);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar a caixa de entrada');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const aplicar = (c: ConversaDetalhe) => setGrupos((atuais) => aplicarNaCaixa(atuais, paraResumo(c)));
    socket.on(EVENTOS.conversaNova, aplicar);
    socket.on(EVENTOS.conversaAtualizada, aplicar);
    return () => { socket.disconnect(); };
  }, []);

  const total = grupos.reduce((soma, grupo) => soma + grupo.conversas.length, 0);
  return { grupos, carregando, erro, total, recarregar: carregar };
}
