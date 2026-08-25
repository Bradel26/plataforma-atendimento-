import { useState } from 'react';
import { BotsTab } from './BotsTab';
import { CanaisTab } from './CanaisTab';
import { FilasTab } from './FilasTab';
import { LgpdTab } from './LgpdTab';
import { UsuariosTab } from './UsuariosTab';
import { WhiteLabelTab } from './WhiteLabelTab';

const ABAS = [
  { id: 'usuarios', label: 'Usuarios e permissoes' },
  { id: 'filas', label: 'Filas' },
  { id: 'canais', label: 'Canais' },
  { id: 'bots', label: 'Chatbot' },
  { id: 'whitelabel', label: 'White Label' },
  { id: 'lgpd', label: 'LGPD e retencao' },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

export function ConfiguracoesPage() {
  const [aba, setAba] = useState<AbaId>('usuarios');

  return (
    <div className="space-y-5">
      <nav className="flex gap-1 border-b border-slate-200">
        {ABAS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
              aba === id
                ? 'border-[var(--brand-primary)] font-medium text-[var(--brand-primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {aba === 'usuarios' && <UsuariosTab />}
      {aba === 'filas' && <FilasTab />}
      {aba === 'canais' && <CanaisTab />}
      {aba === 'bots' && <BotsTab />}
      {aba === 'whitelabel' && <WhiteLabelTab />}
      {aba === 'lgpd' && <LgpdTab />}
    </div>
  );
}
