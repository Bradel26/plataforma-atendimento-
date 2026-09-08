import { Link } from 'react-router-dom';

const CLASSE_ITEM = (ativo: boolean) =>
  `anel-de-foco -mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
    ativo
      ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
      : 'border-transparent text-slate-500 hover:text-slate-700'
  }`;

/**
 * Abas que trocam conteudo sem navegar — `role="tablist"`/`aria-selected`,
 * com seta esquerda/direita andando entre elas (`tabIndex` em roda: so a aba
 * selecionada e alcancavel por Tab, as outras se alcancam pela seta).
 *
 * Formalizacao do componente, ainda nao aplicado as 11 abas do CRM ou do
 * Atendimento — a reorganizacao delas e assunto de uma fase propria.
 */
export function Tabs({
  itens,
  ativo,
  aoSelecionar,
}: {
  itens: Array<{ chave: string; rotulo: string }>;
  ativo: string;
  aoSelecionar: (chave: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-200">
      {itens.map((item) => {
        const selecionado = item.chave === ativo;
        return (
          <button
            key={item.chave}
            type="button"
            role="tab"
            aria-selected={selecionado}
            tabIndex={selecionado ? 0 : -1}
            onClick={() => aoSelecionar(item.chave)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const i = itens.findIndex((it) => it.chave === ativo);
              const passo = e.key === 'ArrowRight' ? 1 : -1;
              const proximo = itens[(i + passo + itens.length) % itens.length];
              if (proximo) aoSelecionar(proximo.chave);
            }}
            className={CLASSE_ITEM(selecionado)}
          >
            {item.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Abas que navegam (mudam URL) — `aria-current="page"`, o padrao que o CRM
 * ja usa hoje. Formaliza o mesmo visual das abas de conteudo acima, so que
 * com `<Link>` em vez de `<button>`.
 */
export function TabsDeNavegacao({
  itens,
}: {
  itens: Array<{ rota: string; rotulo: string; ativo: boolean }>;
}) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {itens.map((item) => (
        <Link
          key={item.rota}
          to={item.rota}
          aria-current={item.ativo ? 'page' : undefined}
          className={CLASSE_ITEM(item.ativo)}
        >
          {item.rotulo}
        </Link>
      ))}
    </div>
  );
}
