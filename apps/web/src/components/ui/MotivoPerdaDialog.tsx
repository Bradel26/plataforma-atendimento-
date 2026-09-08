import { useEffect, useRef, useState } from 'react';
import { Button, Select } from './index';
import type { MotivoPerda } from '../../lib/types';

/**
 * Pergunta o motivo da perda — substitui `window.prompt()`, que era o unico
 * lugar (dois, na verdade: Leads e Oportunidades) que ainda pedia dado por
 * fora do design system (Fase 9: consistencia global). Um prompt nativo nao
 * segue tema escuro nem white-label, e aceitava qualquer texto — validado so
 * depois, contra a lista de motivos.
 *
 * Compartilhado porque as duas telas pedem exatamente a mesma pergunta com a
 * mesma lista fixa de motivos — duplicar o modal seria a segunda copia da
 * mesma regra divergindo depois.
 */
export function MotivoPerdaDialog({
  aberto,
  motivos,
  labelMotivo,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  motivos: readonly MotivoPerda[];
  labelMotivo: Record<MotivoPerda, string>;
  aoConfirmar: (motivo: MotivoPerda) => void;
  aoCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoPerda>(motivos[0]!);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (aberto) {
      setMotivo(motivos[0]!);
      cancelarRef.current?.focus();
    }
  }, [aberto, motivos]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoCancelar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoCancelar]);

  if (!aberto) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="motivo-perda-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={aoCancelar}
    >
      <div
        className="anim-entrada-dialogo w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="motivo-perda-titulo" className="text-sm font-semibold text-slate-800">
          Motivo da perda
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">Por que este negocio nao avancou.</p>
        <div className="mt-3">
          <Select
            aria-label="Motivo da perda"
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoPerda)}
          >
            {motivos.map((m) => (
              <option key={m} value={m}>
                {labelMotivo[m]}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button ref={cancelarRef} type="button" variante="neutro" onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => aoConfirmar(motivo)}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
