import { useCallback, useEffect, useState } from 'react';
import { Alerta, Card, Field, Select } from '../components/ui';
import { BarList } from '../components/viz/BarList';
import { StatTile } from '../components/viz/StatTile';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { COR_CANAL, COR_STATUS_AGENTE, ESTADO, duracao } from '../lib/viz';
import { LABEL_STATUS, LABEL_STATUS_PROTOCOLO, type Indicadores } from '../lib/types';

const JANELAS = [
  { valor: '1', label: 'Ultima hora' },
  { valor: '24', label: 'Ultimas 24 horas' },
  { valor: '168', label: 'Ultimos 7 dias' },
  { valor: '720', label: 'Ultimos 30 dias' },
] as const;

export function DashboardsPage() {
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [horas, setHoras] = useState('24');
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const desde = new Date(Date.now() - Number(horas) * 60 * 60 * 1000).toISOString();
      const { indicadores } = await api.get<{ indicadores: Indicadores }>(`/metricas/indicadores?desde=${desde}`);
      setDados(indicadores);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar indicadores');
    }
  }, [horas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Recarrega quando algo muda de verdade, em vez de consultar em loop.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const recarregar = () => void carregar();

    for (const evento of [
      EVENTOS.conversaNova,
      EVENTOS.conversaAtualizada,
      EVENTOS.agenteStatus,
      EVENTOS.protocoloAtualizado,
    ]) {
      socket.on(evento, recarregar);
    }
    return () => {
      socket.disconnect();
    };
  }, [carregar]);

  const canais = Object.entries(dados?.conversas.porCanal ?? {})
    .map(([canal, valor]) => ({ rotulo: canal, valor, cor: COR_CANAL[canal] }))
    .sort((a, b) => b.valor - a.valor);

  const agentes = Object.entries(dados?.agentes.porStatus ?? {})
    .map(([status, valor]) => ({
      rotulo: LABEL_STATUS[status as keyof typeof LABEL_STATUS] ?? status,
      valor,
      cor: COR_STATUS_AGENTE[status],
    }))
    .sort((a, b) => b.valor - a.valor);

  const protocolos = Object.entries(dados?.protocolos.porStatus ?? {})
    .map(([status, valor]) => ({
      rotulo: LABEL_STATUS_PROTOCOLO[status as keyof typeof LABEL_STATUS_PROTOCOLO] ?? status,
      valor,
      cor: '#2a78d6',
    }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Periodo">
          <Select value={horas} onChange={(e) => setHoras(e.target.value)} className="w-52">
            {JANELAS.map((j) => (
              <option key={j.valor} value={j.valor}>{j.label}</option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-slate-500">Atualiza em tempo real conforme os atendimentos mudam</p>
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          rotulo="Em espera"
          valor={dados?.conversas.emEspera ?? '—'}
          detalhe="aguardando atendente"
          destaque
          estado={dados && dados.conversas.emEspera > 0 ? ESTADO.atencao : undefined}
        />
        <StatTile rotulo="Em atendimento" valor={dados?.conversas.emAtendimento ?? '—'} detalhe="conversas ativas" />
        <StatTile rotulo="TME" valor={duracao(dados?.tempos.tmeSegundos ?? null)} detalhe="tempo medio de espera" />
        <StatTile rotulo="TMA" valor={duracao(dados?.tempos.tmaSegundos ?? null)} detalhe="tempo medio de atendimento" />
        <StatTile
          rotulo="CSAT"
          valor={dados && dados.satisfacao.csat !== null ? `${dados.satisfacao.csat}/5` : '—'}
          detalhe={`${dados?.satisfacao.csatRespostas ?? 0} resposta(s)`}
        />
        <StatTile
          rotulo="SLA vencido"
          valor={dados?.protocolos.slaVencidos ?? '—'}
          detalhe="chamados fora do prazo"
          estado={dados && dados.protocolos.slaVencidos > 0 ? ESTADO.grave : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card titulo="Conversas por canal" descricao={`${dados?.conversas.novasNoPeriodo ?? 0} nova(s) no periodo`}>
          <BarList itens={canais} vazio="Nenhuma conversa no periodo" />
        </Card>
        <Card titulo="Agentes por status" descricao={`${dados?.agentes.total ?? 0} agente(s) ativo(s)`}>
          <BarList itens={agentes} vazio="Nenhum agente cadastrado" />
        </Card>
        <Card titulo="Protocolos por status" descricao="Chamados abertos e encerrados">
          <BarList itens={protocolos} vazio="Nenhum chamado registrado" />
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile rotulo="Atribuidas" valor={dados?.conversas.atribuidas ?? '—'} detalhe="com agente definido" />
        <StatTile rotulo="Finalizadas" valor={dados?.conversas.finalizadas ?? '—'} detalhe="no total" />
        <StatTile rotulo="Mensagens" valor={dados?.conversas.mensagensNoPeriodo ?? '—'} detalhe="trocadas no periodo" />
        <StatTile
          rotulo="NPS"
          valor={dados?.satisfacao.nps ?? '—'}
          detalhe={`${dados?.satisfacao.npsRespostas ?? 0} resposta(s)`}
        />
      </div>
    </div>
  );
}
