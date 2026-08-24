import { useState } from 'react';
import { ContasTab } from './ContasTab';
import { DadosTab } from './DadosTab';
import { ContatosTab } from './ContatosTab';
import { LeadsTab } from './LeadsTab';
import { OportunidadesTab } from './OportunidadesTab';
import { ProdutosTab } from './ProdutosTab';

const ABAS = [
  { id: 'contatos', label: 'Contatos' },
  { id: 'contas', label: 'Contas' },
  { id: 'leads', label: 'Leads' },
  { id: 'oportunidades', label: 'Oportunidades' },
  { id: 'produtos', label: 'Produtos e precos' },
  { id: 'dados', label: 'Importar / Exportar' },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

export function CrmPage() {
  const [aba, setAba] = useState<AbaId>('contatos');

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
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

      {aba === 'contatos' && <ContatosTab />}
      {aba === 'contas' && <ContasTab />}
      {aba === 'leads' && <LeadsTab />}
      {aba === 'oportunidades' && <OportunidadesTab />}
      {aba === 'produtos' && <ProdutosTab />}
      {aba === 'dados' && <DadosTab />}
    </div>
  );
}
