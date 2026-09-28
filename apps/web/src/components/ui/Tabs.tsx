import { Link } from 'react-router-dom';

const CLASSE_ITEM = (ativo: boolean) =>
  `anel-de-foco -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
    ativo
      ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
      : 'border-transparent text-slate-500 hover:text-slate-700'
  }`;

/**
 * `overflow-x-auto` + `shrink-0`/`whitespace-nowrap` em cada aba: numa tela
 * estreita (celular), quatro ou mais abas passam da largura disponivel — sem
 * isto a ultima aba ficava cortada na borda da tela, sem rolagem nem quebra
 * de linha para chegar nela. Rola em vez de quebrar linha porque quebrar
 * empurraria o conteudo da pagina para baixo a cada aba nova; rolar mantem a
 * barra de abas na mesma altura sempre. `-mb-px` continua saindo do item, e
 * nao do container, para a borda inferior de cada aba colar exatamente na
 * linha divisoria mesmo com a barra rolada.
 */
const CLASSE_CONTAINER = 'flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200';

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
    <div role="tablist" className={CLASSE_CONTAINER}>
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
    <div className={CLASSE_CONTAINER}>
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
