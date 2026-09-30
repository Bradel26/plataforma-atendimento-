import { useState } from 'react';
import { Alerta, Button, Field, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import type { OperacaoEsteira } from '../../lib/types';

type Props = {
  /** Quem pode entrar na esteira. Com um so, o seletor de contato some. */
  contatos: Array<{ id: string; nome: string }>;
  contaId?: string | null;
  operacoes: OperacaoEsteira[];
  aoEnviar: () => void;
};

/**
 * "Enviar para credenciamento": coloca um contato do CRM na primeira etapa de
 * uma operacao da esteira (TIM, Starlink...) sem digitar nada de novo — o card
 * nasce ligado ao mesmo contato e a mesma empresa.
 */
export function EnviarParaCredenciamento({ contatos, contaId, operacoes, aoEnviar }: Props) {
  const mostrarToast = useToast();
  const [contatoId, setContatoId] = useState(contatos.length === 1 ? contatos[0]!.id : '');
  const [funilId, setFunilId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (operacoes.length === 0 || contatos.length === 0) return null;

  const enviar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      await api.post('/credenciamentos', { contatoId, funilId, ...(contaId ? { contaId } : {}) });
      const operacao = operacoes.find((o) => o.id === funilId)?.nome ?? 'a esteira';
      mostrarToast('sucesso', `Enviado para ${operacao}.`);
      setFunilId('');
      aoEnviar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao enviar para o credenciamento');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-700">Enviar para credenciamento</p>
      {erro && <Alerta>{erro}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-2">
        {contatos.length > 1 && (
          <Field label="Contato">
            <Select value={contatoId} onChange={(e) => setContatoId(e.target.value)}>
              <option value="">Selecione...</option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Operacao">
          <Select value={funilId} onChange={(e) => setFunilId(e.target.value)}>
            <option value="">Selecione...</option>
            {operacoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button onClick={() => void enviar()} disabled={enviando || !contatoId || !funilId}>
        {enviando ? 'Enviando...' : 'Enviar para credenciamento'}
      </Button>
    </div>
  );
}
