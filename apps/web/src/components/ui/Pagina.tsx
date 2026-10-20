import type { ReactNode } from 'react';

/** Titulo da tela com a frase que diz para que ela serve; acoes a direita. */
export function CabecalhoPagina({
  titulo,
  descricao,
  acima,
  children,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Linha curta acima do titulo (ex.: o grupo da secao nas Configuracoes). */
  acima?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {acima && <p className="mb-1 text-[12.5px] font-semibold text-slate-500">{acima}</p>}
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-900">{titulo}</h1>
        {descricao && <p className="mt-1.5 text-[13px] text-slate-600">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

/**
 * Controle segmentado (pilulas num trilho cinza). `papel="tab"` quando troca o
 * conteudo da tela; `papel="botao"` quando so filtra o que ja esta nela.
 */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
  papel = 'botao',
  tamanho = 'padrao',
}: {
  opcoes: ReadonlyArray<{ valor: T; rotulo: ReactNode }>;
  valor: T;
  aoMudar: (valor: T) => void;
  rotulo: string;
  papel?: 'tab' | 'botao';
  tamanho?: 'padrao' | 'sm';
}) {
  const aba = papel === 'tab';
  return (
    <div
      role={aba ? 'tablist' : 'group'}
      aria-label={rotulo}
      className="sem-barra-de-rolagem flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-200 p-1"
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role={aba ? 'tab' : undefined}
            aria-selected={aba ? ativo : undefined}
            aria-pressed={aba ? undefined : ativo}
            onClick={() => aoMudar(o.valor)}
            className={`shrink-0 whitespace-nowrap rounded-lg transition ${
              tamanho === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-[34px] px-4 text-[13px]'
            } ${ativo ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-semibold text-slate-700 hover:text-slate-900'}`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/** Campo de busca com lupa, no mesmo desenho da Esteira e do Atendimento. */
export function CampoBusca({
  valor,
  aoMudar,
  placeholder,
  rotulo,
  className = 'sm:w-72',
}: {
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder: string;
  rotulo: string;
  className?: string;
}) {
  return (
    <label
      className={`relative flex h-10 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-400 transition focus-within:border-[var(--brand-primary)] ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="sr-only">{rotulo}</span>
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
      />
    </label>
  );
}

/** Pilula de status: ponto colorido + texto (estado nunca so pela cor). */
export function Pilula({
  cor,
  children,
  className = 'bg-slate-100 text-slate-700',
}: {
  cor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-2.5 text-xs font-semibold ${className}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Iniciais para avatar: "Maria Souza" -> "MS". */
export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
