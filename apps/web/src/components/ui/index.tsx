import { cloneElement, forwardRef, isValidElement, useId } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function Card({ titulo, descricao, acao, children }: {
  titulo?: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {(titulo || acao) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            {titulo && <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>}
            {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
          </div>
          {acao}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'neutro' | 'perigo';
  tamanho?: 'padrao' | 'sm';
};

/**
 * `forwardRef` existe pra quem precisa mandar foco pro botao de fora — o
 * ConfirmDialog manda foco pro "Cancelar" assim que abre, e sem ref nao daria
 * pra fazer isso sem duplicar o markup do botao.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'primario', tamanho = 'padrao', className = '', ...props },
  ref,
) {
  const estilos: Record<string, string> = {
    primario: 'bg-[var(--brand-primary)] text-white hover:brightness-110',
    neutro: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    perigo: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  };
  // `sm` fica pra acao inline em tabela/kanban. Padding+altura escolhidos pra
  // nao cair abaixo de ~28px de alvo de clique mesmo no tamanho reduzido.
  const tamanhos: Record<string, string> = {
    padrao: 'px-3.5 py-2 text-sm',
    sm: 'px-2.5 py-1.5 text-xs',
  };
  return (
    <button
      ref={ref}
      {...props}
      className={`anel-de-foco inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tamanhos[tamanho]} ${estilos[variante]} ${className}`}
    />
  );
});

const campoBase = 'w-full rounded-lg border px-3 py-2 text-sm text-slate-800 outline-none transition';
const campoNormal =
  'border-slate-300 focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20';
const campoErro = 'border-red-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20';

/**
 * O estilo de erro deriva de `aria-invalid`, nao de uma prop paralela — assim
 * Input/Select/Textarea ficam corretos tanto pra quem le a tela (o atributo
 * ARIA real) quanto pra quem ve (a borda vermelha), sem duas fontes da
 * verdade que possam divergir.
 */
function classesDoCampo(ariaInvalid: unknown, className: string) {
  return `${campoBase} ${ariaInvalid && ariaInvalid !== 'false' ? campoErro : campoNormal} ${className}`;
}

/**
 * Rotulo, controle e dica.
 *
 * O rotulo aponta para o controle por `htmlFor`, e a dica entra por
 * `aria-describedby` — nao aninhada dentro do `<label>`. Aninhada, ela virava
 * parte do *nome* do campo: o leitor de tela anunciava "Webhook do motor de IA A
 * URL que o painel do WhatsBot mostra depois de criar o canal la" como se fosse
 * o nome, e no `<select>` o nome incluia todas as opcoes.
 *
 * A injecao de `id` e `aria-describedby` acontece por clonagem do filho unico.
 * Filho que nao seja elemento (ou mais de um) cai no comportamento antigo, de
 * rotulo envolvente — que funciona, so nomeia pior.
 */
export function Field({
  label,
  hint,
  erro,
  children,
}: {
  label: string;
  hint?: string;
  erro?: string;
  children: ReactNode;
}) {
  const base = useId();
  const idCampo = `${base}-campo`;
  const idDica = `${base}-dica`;
  const idErro = `${base}-erro`;
  const idDescricao = erro ? idErro : idDica;

  const unico = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const controle = unico
    ? cloneElement(unico, {
        id: (unico.props.id as string | undefined) ?? idCampo,
        ...(erro || hint ? { 'aria-describedby': idDescricao } : {}),
        ...(erro ? { 'aria-invalid': true } : {}),
      })
    : children;

  const rotulo = <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>;

  return (
    <div className="block">
      {unico ? (
        <label htmlFor={(unico.props.id as string | undefined) ?? idCampo}>{rotulo}</label>
      ) : (
        <label className="block">
          {rotulo}
          {controle}
        </label>
      )}
      {unico && controle}
      {/* Erro substitui a dica enquanto estiver presente — os dois juntos
          competiriam pela mesma linha e ninguem leria as duas. */}
      {erro ? (
        <span id={idErro} className="mt-1 block text-xs text-red-600">
          {erro}
        </span>
      ) : (
        hint && (
          <span id={idDica} className="mt-1 block text-xs text-slate-500">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

/**
 * `forwardRef` porque quem chama as vezes precisa levar o foco ate aqui de
 * proposito (ex.: devolver o foco a busca ao fechar uma ficha) — sem isso o
 * `ref` seria descartado silenciosamente pelo React.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} {...props} className={classesDoCampo(props['aria-invalid'], className)} />;
  },
);

export const Textarea = ({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={`${classesDoCampo(props['aria-invalid'], className)} resize-y`} />
);

export const Select = ({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={classesDoCampo(props['aria-invalid'], className)} />
);

export function Badge({
  children,
  tom = 'neutro',
}: {
  children: ReactNode;
  tom?: 'neutro' | 'sucesso' | 'alerta' | 'erro' | 'marca';
}) {
  const tons: Record<string, string> = {
    neutro: 'bg-slate-100 text-slate-600',
    sucesso: 'bg-emerald-50 text-emerald-700',
    alerta: 'bg-amber-50 text-amber-700',
    erro: 'bg-red-50 text-red-700',
    marca: 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tons[tom]}`}>{children}</span>;
}

export function Alerta({ tipo = 'erro', children }: { tipo?: 'erro' | 'sucesso' | 'aviso'; children: ReactNode }) {
  const tons = {
    erro: 'border-red-200 bg-red-50 text-red-700',
    sucesso: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    aviso: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${tons[tipo]}`}>{children}</div>;
}

export function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  /** So quando ha um proximo passo obvio — texto de vazio nao precisa de botao so por ter. */
  acao?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mt-1 text-xs text-slate-500">{descricao}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}
