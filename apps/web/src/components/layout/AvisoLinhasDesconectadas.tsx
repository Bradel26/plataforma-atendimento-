import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';

type LinhaCaida = { id: string; nome: string; dono: { id: string; nome: string } | null; desde: string | null };

export function AvisoLinhasDesconectadas() {
  const { temPerfil } = useAuth();
  const ve = temPerfil('ADMIN', 'SUPERVISOR');
  const [linhas, setLinhas] = useState<LinhaCaida[]>([]);
  const carregar = useCallback(async () => {
    try {
      setLinhas((await api.get<{ linhas: LinhaCaida[] }>('/canais/linhas-desconectadas')).linhas);
    } catch {
      // O aviso nao deve interromper o uso da plataforma se o status estiver indisponivel.
    }
  }, []);

  useEffect(() => {
    if (!ve) return;
    void carregar();
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.on(EVENTOS.canalStatus, () => void carregar());
    return () => { socket.disconnect(); };
  }, [ve, carregar]);

  if (!ve || linhas.length === 0) return null;
  const data = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return <div role="alert" className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
    <strong>{linhas.length === 1 ? 'WhatsApp desconectado:' : `${linhas.length} WhatsApps desconectados:`}</strong>{' '}
    {linhas.map((linha, index) => <Fragment key={linha.id}>
      {index > 0 ? ' · ' : ''}
      <Link to={`/configuracoes?aba=canais&linha=${encodeURIComponent(linha.id)}`} className="underline">
        {linha.nome}{linha.dono ? ` (${linha.dono.nome})` : ''}
      </Link>
      {linha.desde ? ` desde ${data(linha.desde)}` : ''}
    </Fragment>)}
    {' — clique na linha para abrir a conexão.'}
  </div>;
}
