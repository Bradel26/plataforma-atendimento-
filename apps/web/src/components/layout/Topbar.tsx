import { useState } from 'react';
import { useAuth } from '../../features/auth/AuthProvider';
import { COR_STATUS, LABEL_PERFIL, LABEL_STATUS, type AgentStatus } from '../../lib/types';
import { IconSair } from './icons';

const STATUS_DISPONIVEIS: AgentStatus[] = ['DISPONIVEL', 'EM_ATENDIMENTO', 'PAUSA', 'OFFLINE'];

/** Cabecalho com seletor de status de presenca do agente e acao de sair. */
export function Topbar({ titulo }: { titulo: string }) {
  const { usuario, alterarStatus, sair } = useAuth();
  const [salvando, setSalvando] = useState(false);

  if (!usuario) return null;

  const trocarStatus = async (status: AgentStatus) => {
    setSalvando(true);
    try {
      await alterarStatus(status);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-base font-semibold text-slate-800">{titulo}</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${COR_STATUS[usuario.status]}`} aria-hidden />
          <select
            aria-label="Status do agente"
            value={usuario.status}
            disabled={salvando}
            onChange={(e) => void trocarStatus(e.target.value as AgentStatus)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-[var(--brand-primary)]"
          >
            {STATUS_DISPONIVEIS.map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-800">{usuario.nome}</p>
          <p className="text-xs text-slate-500">{LABEL_PERFIL[usuario.perfil]}</p>
        </div>

        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {usuario.nome.charAt(0).toUpperCase()}
        </span>

        <button
          type="button"
          onClick={() => void sair()}
          title="Sair"
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <IconSair />
        </button>
      </div>
    </header>
  );
}
