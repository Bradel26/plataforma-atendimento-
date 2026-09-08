import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type TipoToast = 'sucesso' | 'erro' | 'info';
type ItemToast = { id: string; tipo: TipoToast; mensagem: string };

const TONS: Record<TipoToast, string> = {
  sucesso: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  erro: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-slate-200 bg-white text-slate-700',
};

const DURACAO_MS = 4000;

const ToastContext = createContext<((tipo: TipoToast, mensagem: string) => void) | null>(null);

/**
 * Confirmacao transitoria de uma acao que ja mudou algo visivel na tela —
 * nunca o unico lugar onde um erro fica registrado, porque ela some sozinha e
 * quem piscou perde a informacao (isso continua sendo papel do `Alerta`).
 *
 * Monta uma vez no `AppShell`, nao por pagina — senao o toast de uma acao
 * desapareceria junto com a navegacao que ela mesma disparou.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemToast[]>([]);

  const remover = useCallback((id: string) => {
    setItens((atual) => atual.filter((item) => item.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo: TipoToast, mensagem: string) => {
      const id = crypto.randomUUID();
      // No maximo dois na tela: um terceiro empurraria os dois anteriores pra
      // fora antes que desse tempo de ler qualquer um deles.
      setItens((atual) => [...atual.slice(-1), { id, tipo, mensagem }]);
      window.setTimeout(() => remover(id), DURACAO_MS);
    },
    [remover],
  );

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {itens.map((item) => (
          <div
            key={item.id}
            role="status"
            aria-live="polite"
            className={`anim-entrada-toast pointer-events-auto rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${TONS[item.tipo]}`}
          >
            {item.mensagem}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `mostrar('sucesso' | 'erro' | 'info', mensagem)`. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de ToastProvider');
  return ctx;
}
