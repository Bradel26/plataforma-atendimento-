import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta } from '../../components/ui';
import { iniciais } from '../../components/ui/Pagina';
import { ApiError, api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import { COR_STATUS_AGENTE } from '../../lib/viz';

type Equipe = {
  id: string; nome: string; usuariosOnline: number; aguardando: number; emAtendimento: number; total: number;
  usuarios: Array<{ id: string; nome: string; status: string; caixaEntrada: number; chats: number }>;
};

function Numero({ valor, rotulo, alerta = false }: { valor: number; rotulo: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${alerta ? 'bg-red-50' : 'bg-slate-50'}`}>
      <span className={`block text-[22px] font-bold leading-tight tabular-nums ${alerta ? 'text-red-700' : 'text-slate-900'}`}>{valor}</span>
      <span className="text-xs text-slate-600">{rotulo}</span>
    </div>
  );
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

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="monitor-equipes">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="monitor-equipes" className="text-xs font-bold uppercase tracking-[0.08em] text-slate-600">Equipes</h2>
        {equipes.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-1.5" role="group" aria-label="Filtrar equipes">
            {equipes.map((equipe) => {
              const ativa = selecionadas.length === 0 || selecionadas.includes(equipe.id);
              return (
                <button
                  key={equipe.id}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => setSelecionadas((atuais) => atuais.includes(equipe.id) ? atuais.filter((id) => id !== equipe.id) : [...atuais, equipe.id])}
                  className={`h-7 rounded-full border px-3 text-[12.5px] font-semibold transition ${
                    ativa ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {equipe.nome}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {erro && <Alerta>{erro}</Alerta>}
      {equipes.length === 0 && !erro && (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Nenhuma equipe ativa cadastrada.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {equipes.map((equipe) => {
          const aberta = abertas[equipe.id] ?? false;
          return (
            <article key={equipe.id} className={`flex min-w-0 flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 ${aberta ? 'sm:col-span-2' : ''}`}>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="truncate text-[15px] font-bold text-slate-900">{equipe.nome}</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COR_STATUS_AGENTE.DISPONIVEL }} aria-hidden="true" />
                  {equipe.usuariosOnline} online
                </span>
                <button
                  type="button"
                  aria-expanded={aberta}
                  onClick={() => setAbertas((atuais) => ({ ...atuais, [equipe.id]: !atuais[equipe.id] }))}
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Pessoas
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition ${aberta ? 'rotate-180' : ''}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Numero valor={equipe.aguardando} rotulo="Aguardando" alerta={equipe.aguardando > 0} />
                <Numero valor={equipe.emAtendimento} rotulo="Em atendimento" />
                <Numero valor={equipe.total} rotulo="Total" />
              </div>
              {aberta && (
                <ul className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                  {equipe.usuarios.length === 0 && <li className="text-xs text-slate-500">Ninguém nesta equipe.</li>}
                  {equipe.usuarios.map((usuario) => (
                    <li key={usuario.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2">
                      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                        {iniciais(usuario.nome)}
                        <span
                          className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-white"
                          style={{ backgroundColor: COR_STATUS_AGENTE[usuario.status] ?? COR_STATUS_AGENTE.OFFLINE }}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-800">
                          {usuario.nome}
                          {usuario.status === 'OFFLINE' && <span className="ml-1 font-normal text-slate-500">· offline</span>}
                        </span>
                        <span className="text-xs tabular-nums text-slate-500">
                          {usuario.caixaEntrada} na caixa · {usuario.chats} conversa(s)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
