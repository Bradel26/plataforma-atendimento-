import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

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

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'neutro' | 'perigo' };

export function Button({ variante = 'primario', className = '', ...props }: ButtonProps) {
  const estilos: Record<string, string> = {
    primario: 'bg-[var(--brand-primary)] text-white hover:brightness-110',
    neutro: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    perigo: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${estilos[variante]} ${className}`}
    />
  );
}

const campo =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${campo} ${className}`} />
);

export const Select = ({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`${campo} ${className}`} />
);

export function Badge({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'sucesso' | 'alerta' | 'marca' }) {
  const tons: Record<string, string> = {
    neutro: 'bg-slate-100 text-slate-600',
    sucesso: 'bg-emerald-50 text-emerald-700',
    alerta: 'bg-amber-50 text-amber-700',
    marca: 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tons[tom]}`}>{children}</span>;
}

export function Alerta({ tipo = 'erro', children }: { tipo?: 'erro' | 'sucesso'; children: ReactNode }) {
  const tons = {
    erro: 'border-red-200 bg-red-50 text-red-700',
    sucesso: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${tons[tipo]}`}>{children}</div>;
}

export function EmptyState({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mt-1 text-xs text-slate-500">{descricao}</p>
    </div>
  );
}
