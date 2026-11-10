import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Field, Select, Textarea } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import type { MotivoPerdaStarlink, VinculoDetalhe } from '../../lib/esteiraTypes';
import { estadoDoErro, type ContextoDialogo, type EstadoDialogo } from './regrasMovimento';

/** O que o diálogo acrescenta ao corpo da escrita (mover ou editar). */
export type ExtrasDaRegra = { justificativa?: string; motivo?: string; motivoPerda?: MotivoPerdaStarlink };

/**
 * Diálogo das regras da esteira: pede justificativa (com as pendências) e/ou o
 * motivo da saída, ou só explica a recusa (`bloqueio`). Serve ao arraste do
 * Kanban, ao "Mover para…" e à edição de campos da gaveta.
 */
export function DialogoMovimento({
  estado,
  ocupado,
  aoConfirmar,
  aoFechar,
}: {
  estado: EstadoDialogo | null;
  ocupado: boolean;
  aoConfirmar: (extras: ExtrasDaRegra) => void;
  aoFechar: () => void;
}) {
  const [justificativa, setJustificativa] = useState('');
  const [motivo, setMotivo] = useState('');
  const aberto = estado !== null;

  // Cada diálogo novo começa limpo (o texto digitado sobrevive aos erros do mesmo pedido).
  useEffect(() => {
    if (!aberto) {
      setJustificativa('');
      setMotivo('');
    }
  }, [aberto]);

  if (!estado) return null;

  const faltaJustificativa = estado.pedeJustificativa && !justificativa.trim();
  const faltaMotivo = estado.motivo !== null && !motivo.trim();
  const confirmar = () => {
    if (estado.bloqueio || faltaJustificativa || faltaMotivo || ocupado) return;
    aoConfirmar({
      ...(estado.pedeJustificativa ? { justificativa: justificativa.trim() } : {}),
      ...(estado.motivo?.tipo === 'texto' ? { motivo: motivo.trim() } : {}),
      ...(estado.motivo?.tipo === 'perda' ? { motivoPerda: motivo as MotivoPerdaStarlink } : {}),
    });
  };

  return (
    <Modal
      aberto
      titulo={estado.titulo}
      aoFechar={ocupado ? () => undefined : aoFechar}
      rodape={
        estado.bloqueio ? (
          <Button variante="neutro" onClick={aoFechar}>
            Entendi
          </Button>
        ) : (
          <>
            <Button variante="neutro" onClick={aoFechar} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={faltaJustificativa || faltaMotivo || ocupado}>
              {ocupado ? 'Gravando...' : 'Confirmar'}
            </Button>
          </>
        )
      }
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
      >
        {estado.bloqueio ? (
          <Alerta tipo="aviso">{estado.bloqueio}</Alerta>
        ) : (
          estado.descricao && <p className="text-[13px] leading-relaxed text-slate-600">{estado.descricao}</p>
        )}

        {estado.pendencias.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-700">Pendências da regra</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-amber-700">
              {estado.pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {!estado.bloqueio && estado.motivo?.tipo === 'perda' && (
          <Field label="Motivo da perda">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus>
              <option value="">Escolha o motivo…</option>
              {estado.motivo.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!estado.bloqueio && estado.motivo?.tipo === 'texto' && (
          <Field label="Motivo da saída">
            <Textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </Field>
        )}
        {!estado.bloqueio && estado.pedeJustificativa && (
          <Field label="Justificativa" hint="Obrigatória. Fica registrada no histórico e na auditoria.">
            <Textarea
              rows={3}
              maxLength={1000}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              autoFocus={estado.motivo === null}
            />
          </Field>
        )}

        {estado.erro && <Alerta>{estado.erro}</Alerta>}
      </form>
    </Modal>
  );
}

type Pedido = {
  estado: EstadoDialogo;
  contexto: ContextoDialogo;
  chamar: (extras: ExtrasDaRegra) => Promise<VinculoDetalhe>;
  aoConcluir: (v: VinculoDetalhe) => void;
};

export type ExecucaoComRegras = {
  contexto: ContextoDialogo;
  /** Abre o diálogo antes de chamar (justificativa/motivo já sabidos); nulo chama direto. */
  inicial: EstadoDialogo | null;
  chamar: (extras: ExtrasDaRegra) => Promise<VinculoDetalhe>;
  aoConcluir: (v: VinculoDetalhe) => void;
};

const mensagemDe = (e: unknown, padrao: string) => (e instanceof ApiError ? e.message : padrao);

/**
 * Escrita sujeita às regras da esteira: chama o servidor e, se ele recusar
 * por regra (409/403/400), abre o `DialogoMovimento` com o que falta e repete
 * a escrita com a justificativa/motivo. Outros erros viram aviso.
 */
export function useRegrasDaEsteira() {
  const mostrar = useToast();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const executar = useCallback(
    async (p: ExecucaoComRegras): Promise<boolean> => {
      if (p.inicial) {
        setPedido({ ...p, estado: p.inicial });
        return false;
      }
      setOcupado(true);
      try {
        p.aoConcluir(await p.chamar({}));
        return true;
      } catch (e) {
        const estado = e instanceof ApiError ? estadoDoErro(e, null, p.contexto) : null;
        if (estado) setPedido({ ...p, estado });
        else mostrar('erro', mensagemDe(e, 'Não foi possível gravar'));
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [mostrar],
  );

  const confirmar = async (extras: ExtrasDaRegra) => {
    if (!pedido) return;
    setOcupado(true);
    try {
      const v = await pedido.chamar(extras);
      setPedido(null);
      pedido.aoConcluir(v);
    } catch (e) {
      const estado = e instanceof ApiError ? estadoDoErro(e, pedido.estado, pedido.contexto) : null;
      setPedido({ ...pedido, estado: estado ?? { ...pedido.estado, erro: mensagemDe(e, 'Não foi possível gravar') } });
    } finally {
      setOcupado(false);
    }
  };

  const dialogo = (
    <DialogoMovimento
      estado={pedido?.estado ?? null}
      ocupado={ocupado}
      aoConfirmar={(x) => void confirmar(x)}
      aoFechar={() => setPedido(null)}
    />
  );

  return { executar, dialogo, ocupado, dialogoAberto: pedido !== null };
}
