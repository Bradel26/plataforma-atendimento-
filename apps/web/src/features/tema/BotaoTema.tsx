import { useTema } from './TemaProvider';

/**
 * Alterna claro e escuro num clique. O estado "sistema" nao entra no ciclo do
 * botao de proposito: ele e o padrao de quem nunca clicou, e quem clicou uma vez
 * quer decidir, nao voltar a depender do sistema operacional.
 */
export function BotaoTema() {
  const { escuro, definir } = useTema();

  return (
    <button
      type="button"
      onClick={() => definir(escuro ? 'claro' : 'escuro')}
      aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      title={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
    >
      {escuro ? (
        // Sol: clicar volta para o claro.
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
        </svg>
      ) : (
        // Lua: clicar vai para o escuro.
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
