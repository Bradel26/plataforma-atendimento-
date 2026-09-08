import { useState } from 'react';
import { useAuth } from '../../features/auth/AuthProvider';
import { COR_STATUS, LABEL_PERFIL, LABEL_STATUS, type AgentStatus } from '../../lib/types';
import { BotaoTema } from '../../features/tema/BotaoTema';
import { IconSair } from './icons';

const STATUS_DISPONIVEIS: AgentStatus[] = ['DISPONIVEL', 'EM_ATENDIMENTO', 'PAUSA', 'OFFLINE'];

/** Cabecalho com seletor de status de presenca do agente e acao de sair. */
export function Topbar({ titulo, aoAbrirMenu }: { titulo: string; aoAbrirMenu: () => void }) {
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
      <div className="flex min-w-0 items-center gap-3">
        {/* So existe abaixo de `md` — dali pra cima a sidebar fica no fluxo,
            sempre visivel, sem precisar de um botao pra abrir o que ja
            esta aberto. */}
        <button
          type="button"
          id="botao-abrir-menu"
          onClick={aoAbrirMenu}
          aria-label="Abrir menu de navegacao"
          className="anel-de-foco -ml-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {/*
          `min-w-0` no proprio `h1`, nao so no pai: um item de flex tem
          `min-width: auto` por padrao, que ignora `truncate` e mantem a
          largura do texto inteiro — e num celular estreito isso empurrava o
          titulo pra fora da tela em vez de cortar com reticencias.
        */}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-800">{titulo}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          {/* A bolinha duplica a cor que ja esta no proprio texto selecionado
              — some primeiro quando o espaco aperta, o select continua
              dizendo a mesma coisa por extenso. */}
          <span className={`hidden h-2.5 w-2.5 rounded-full sm:inline-block ${COR_STATUS[usuario.status]}`} aria-hidden />
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

        <BotaoTema />

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
