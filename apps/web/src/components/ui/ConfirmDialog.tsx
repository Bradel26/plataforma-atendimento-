import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './index';

type PedidoConfirmacao = {
  titulo: string;
  descricao?: string;
  variante?: 'perigo' | 'neutro';
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  /** Roda ao confirmar. O dialogo fica aberto (com loading) ate ela terminar. */
  aoConfirmar: () => Promise<void> | void;
};

const ConfirmContext = createContext<((pedido: PedidoConfirmacao) => void) | null>(null);

/**
 * Substitui `window.confirm()` — mesma pergunta, mas com foco previsivel,
 * Esc, e sem travar a aba inteira enquanto espera resposta.
 *
 * So um pedido pendente por vez: as oito acoes que hoje usam `confirm()` sao
 * todas disparadas por clique direto do usuario, nunca em paralelo, entao uma
 * fila nao seria usada — so complexidade a mais.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  const pedir = useCallback((novoPedido: PedidoConfirmacao) => setPedido(novoPedido), []);

  // Foco no Cancelar ao abrir: a acao destrutiva nunca e o alvo de um Enter
  // apertado sem querer logo depois do dialogo aparecer.
  useEffect(() => {
    if (pedido) cancelarRef.current?.focus();
  }, [pedido]);

  const fechar = useCallback(() => {
    // Bloqueado durante o loading: fechar no meio de uma acao em andamento
    // deixaria a tela sem dizer se ela completou ou nao.
    setPedido((atual) => {
      if (carregando) return atual;
      return null;
    });
  }, [carregando]);

  useEffect(() => {
    if (!pedido) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [pedido, fechar]);

  const confirmar = async () => {
    if (!pedido) return;
    setCarregando(true);
    try {
      await pedido.aoConfirmar();
    } finally {
      setCarregando(false);
      setPedido(null);
    }
  };

  return (
    <ConfirmContext.Provider value={pedir}>
      {children}
      {pedido && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-titulo"
          /*
           * `bg-black/30`, nao `bg-slate-900/30`: a escala slate inverte no
           * tema escuro (vira quase branco), e um fundo de overlay tem que
           * escurecer a tela nos dois temas, nao so no claro. `black` fica de
           * fora do remapeamento de proposito — e o token estavel pra isto.
           */
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          // Clique fora fecha (nunca confirma) — clicar sem querer no fundo
          // jamais pode executar a acao destrutiva por acidente.
          onClick={fechar}
        >
          <div
            className="anim-entrada-dialogo w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-dialog-titulo" className="text-sm font-semibold text-slate-800">
              {pedido.titulo}
            </h2>
            {pedido.descricao && <p className="mt-1.5 text-sm text-slate-500">{pedido.descricao}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button ref={cancelarRef} type="button" variante="neutro" onClick={fechar} disabled={carregando}>
                {pedido.rotuloCancelar ?? 'Cancelar'}
              </Button>
              <Button
                type="button"
                variante={pedido.variante === 'neutro' ? 'primario' : 'perigo'}
                onClick={() => void confirmar()}
                disabled={carregando}
              >
                {carregando ? 'Aguarde...' : (pedido.rotuloConfirmar ?? 'Confirmar')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** `confirmar({ titulo, descricao?, variante?, aoConfirmar })`. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa estar dentro de ConfirmProvider');
  return ctx;
}
