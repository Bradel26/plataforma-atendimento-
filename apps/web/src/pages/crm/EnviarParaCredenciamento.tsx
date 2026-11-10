import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Button, Field, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import type { CriarVinculoInput, Operacao, RespostaVinculo } from '../../lib/esteiraTypes';
import { ROTULO_OPERACAO } from '../esteira/cadastroEsteira';
import { parametroDaOperacao } from '../esteira/estadoEsteira';

type Props = {
  /** Quem pode entrar na esteira. Com um só, o seletor de contato some. */
  contatos: Array<{ id: string; nome: string }>;
  contaId?: string | null;
  /** Nome da empresa: sem contato nenhum, o vínculo nasce da conta (a API cria o contato com este nome). */
  nomeEmpresa?: string;
  /** Operações em que pode entrar agora (EDICAO e ainda sem vínculo). */
  operacoes: Operacao[];
  aoEnviar: () => void;
};

/**
 * "Adicionar à TIM/Starlink": cria o vínculo do parceiro na primeira etapa da
 * operação escolhida (`POST /esteiras/:operacao/vinculos`), sem digitar nada de
 * novo — o card nasce ligado ao mesmo contato e à mesma empresa. A operação é
 * livre: o antigo `segmentoParceiro` não restringe mais (spec 4.2); o mesmo
 * parceiro pode estar nas duas.
 */
export function EnviarParaCredenciamento({ contatos, contaId, nomeEmpresa, operacoes, aoEnviar }: Props) {
  const mostrarToast = useToast();
  const [contatoId, setContatoId] = useState(contatos.length === 1 ? contatos[0]!.id : '');
  const [enviando, setEnviando] = useState<Operacao | null>(null);
  const [erro, setErro] = useState<{ mensagem: string; operacao: Operacao; jaNaEsteira: boolean } | null>(null);

  const semContato = contatos.length === 0;
  if (operacoes.length === 0 || (semContato && !(contaId && nomeEmpresa))) return null;

  const enviar = async (operacao: Operacao) => {
    const corpo: CriarVinculoInput = semContato
      ? { contaId: contaId!, empresa: nomeEmpresa! }
      : { contatoId, ...(contaId ? { contaId } : {}) };
    setEnviando(operacao);
    setErro(null);
    try {
      const { vinculo } = await api.post<RespostaVinculo>(`/esteiras/${parametroDaOperacao(operacao)}/vinculos`, corpo);
      mostrarToast('sucesso', `${vinculo.parceiro.nome} entrou na esteira ${ROTULO_OPERACAO[operacao]}.`);
      aoEnviar();
    } catch (e) {
      setErro({
        mensagem: e instanceof ApiError ? e.message : 'Falha ao adicionar à esteira',
        operacao,
        jaNaEsteira: e instanceof ApiError && e.status === 409,
      });
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-700">Adicionar à esteira</p>
      {erro && (
        <Alerta tipo={erro.jaNaEsteira ? 'aviso' : 'erro'}>
          {erro.mensagem}
          {erro.jaNaEsteira && (
            <>
              {' '}
              <Link className="font-medium underline" to={`/esteira/${parametroDaOperacao(erro.operacao)}`}>
                Abrir a esteira {ROTULO_OPERACAO[erro.operacao]}
              </Link>
            </>
          )}
        </Alerta>
      )}
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
      <div className="flex flex-wrap gap-2">
        {operacoes.map((o) => (
          <Button key={o} variante="neutro" onClick={() => void enviar(o)} disabled={enviando !== null || (!semContato && !contatoId)}>
            {enviando === o ? 'Adicionando…' : `Adicionar à ${ROTULO_OPERACAO[o]}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
