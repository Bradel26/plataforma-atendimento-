import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta } from '../../components/ui';
import { ApiError, api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';

type Equipe = {
  id: string; nome: string; usuariosOnline: number; aguardando: number; emAtendimento: number; total: number;
  usuarios: Array<{ id: string; nome: string; status: string; caixaEntrada: number; chats: number }>;
};

function Pilula({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return <span className={`inline-flex items-baseline gap-1.5 rounded-lg px-3 py-1.5 texto-sobre-cor-fixa ${cor}`}>
    <span className="text-lg font-semibold leading-none">{valor}</span><span className="text-xs">{rotulo}</span>
  </span>;
}

export function PainelEquipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);
  const espera = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const q = selecionadas.map((id) => `filaId=${encodeURIComponent(id)}`).join('&');
      const r = await api.get<{ equipes: Equipe[] }>(`/metricas/equipes${q ? `?${q}` : ''}`);
      setEquipes(r.equipes);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as equipes');
    }
  }, [selecionadas]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const agendar = () => {
      if (espera.current !== null) window.clearTimeout(espera.current);
      espera.current = window.setTimeout(() => void carregar(), 1_000);
    };
    socket.on(EVENTOS.conversaNova, agendar);
    socket.on(EVENTOS.conversaAtualizada, agendar);
    socket.on(EVENTOS.agenteStatus, agendar);
    return () => { if (espera.current !== null) window.clearTimeout(espera.current); socket.disconnect(); };
  }, [carregar]);

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-sm font-semibold text-slate-800">Monitor de equipes</h2>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {equipes.map((equipe) => {
          const ativa = selecionadas.length === 0 || selecionadas.includes(equipe.id);
          return <button key={equipe.id} type="button" aria-pressed={ativa}
            onClick={() => setSelecionadas((atuais) => atuais.includes(equipe.id) ? atuais.filter((id) => id !== equipe.id) : [...atuais, equipe.id])}
            className={`rounded-full px-2.5 py-0.5 text-xs ${ativa ? 'bg-slate-200 text-slate-800' : 'bg-slate-50 text-slate-400'}`}>
            {equipe.nome}
          </button>;
        })}
      </div>
    </div>
    {erro && <Alerta>{erro}</Alerta>}
    {equipes.length === 0 && !erro && <p className="text-sm text-slate-500">Nenhuma equipe ativa cadastrada.</p>}
    {equipes.map((equipe) => <div key={equipe.id} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg border border-slate-200 p-2"><p className="mb-1 text-sm font-semibold text-slate-700">Usuários</p><Pilula valor={equipe.usuariosOnline} rotulo="Online" cor="bg-sky-900" /></div>
        <div className="rounded-lg border border-slate-200 p-2"><p className="mb-1 text-sm font-semibold text-slate-700">Conversas</p><div className="flex flex-wrap gap-2">
          <Pilula valor={equipe.aguardando} rotulo="Aguardando" cor="bg-red-700" />
          <Pilula valor={equipe.emAtendimento} rotulo="Atendimento" cor="bg-orange-500" />
          <Pilula valor={equipe.total} rotulo="Total" cor="bg-green-700" />
        </div></div>
        <button type="button" aria-expanded={abertas[equipe.id] ?? false} onClick={() => setAbertas((atuais) => ({ ...atuais, [equipe.id]: !atuais[equipe.id] }))} className="ml-auto text-lg font-semibold text-slate-800">
          {equipe.nome} {abertas[equipe.id] ? '⌄' : '›'}
        </button>
      </div>
      {abertas[equipe.id] && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {equipe.usuarios.length === 0 && <p className="text-xs text-slate-500">Ninguém nesta equipe.</p>}
        {equipe.usuarios.map((usuario) => <div key={usuario.id} className="w-52 overflow-hidden rounded-lg border border-slate-200">
          <p className="flex items-center gap-2 bg-sky-950 px-3 py-2 text-sm font-medium texto-sobre-cor-fixa">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs text-sky-950">{usuario.nome.charAt(0)}</span>
            {usuario.nome}{usuario.status === 'OFFLINE' && <span className="ml-auto text-[10px] opacity-70">offline</span>}
          </p>
          <p className="flex justify-between px-3 py-2 text-xs text-slate-600">
            <span><strong className="text-base text-slate-800">{usuario.caixaEntrada}</strong> caixa de entrada</span>
            <span><strong className="text-base text-slate-800">{usuario.chats}</strong> conversas</span>
          </p>
        </div>)}
      </div>}
    </div>)}
  </section>;
}
