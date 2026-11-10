import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../../../components/ui';
import { useAuth } from '../../../features/auth/AuthProvider';
import { api } from '../../../lib/api';
import type { Operacao, RespostaLista, VinculoLinha } from '../../../lib/esteiraTypes';
import { ROTULO_OPERACAO, operacoesParaAdicionar } from '../../esteira/cadastroEsteira';
import { operacoesPermitidas, parametroDaOperacao } from '../../esteira/estadoEsteira';
import { EnviarParaCredenciamento } from '../EnviarParaCredenciamento';

/** Vínculos por empresa que a ficha mostra (uma empresa raramente tem mais de um por operação). */
const TAMANHO = 50;

/**
 * Credenciamento da empresa (spec 6.4): em que etapa ela está em cada operação
 * que o usuário vê, e "Adicionar à TIM/Starlink" onde ainda não está (só com
 * EDICAO). AGENTE não participa da esteira (mesmo corte da API), então para ele
 * o bloco nem aparece.
 */
export function CredenciamentosDaEmpresa({
  contaId,
  nomeEmpresa,
  contatos,
}: {
  contaId: string;
  nomeEmpresa: string;
  contatos: Array<{ id: string; nome: string }>;
}) {
  const { temPerfil, operacoes: acesso, temModulo } = useAuth();
  const podeVer = temPerfil('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL') && temModulo('esteira');
  const permitidas = operacoesPermitidas(acesso);
  const chavePermitidas = permitidas.join(',');
  const [porOperacao, setPorOperacao] = useState<Partial<Record<Operacao, VinculoLinha[]>> | null>(null);

  const carregar = useCallback(async () => {
    const lista = chavePermitidas ? (chavePermitidas.split(',') as Operacao[]) : [];
    const respostas = await Promise.all(
      lista.map((o) =>
        api
          .get<RespostaLista>(`/esteiras/${parametroDaOperacao(o)}/lista?contaId=${contaId}&tamanho=${TAMANHO}`)
          .then((r) => [o, r.linhas] as const)
          // Sem acesso (404) ou falha: a operação simplesmente não aparece.
          .catch(() => null),
      ),
    );
    setPorOperacao(Object.fromEntries(respostas.filter((r) => r !== null)));
  }, [contaId, chavePermitidas]);

  useEffect(() => {
    if (podeVer) void carregar();
  }, [podeVer, carregar]);

  if (!podeVer || !porOperacao || permitidas.length === 0) return null;

  const presentes = (Object.keys(porOperacao) as Operacao[]).filter((o) => (porOperacao[o]?.length ?? 0) > 0);
  // Só oferece onde a consulta respondeu (sem resposta, não dá para saber se já está lá).
  const paraAdicionar = operacoesParaAdicionar(acesso, presentes).filter((o) => porOperacao[o] !== undefined);
  const total = presentes.reduce((n, o) => n + porOperacao[o]!.length, 0);

  return (
    <Card
      titulo="Credenciamento"
      descricao={total === 0 ? 'Esta empresa ainda não está em nenhuma esteira' : `Em ${presentes.map((o) => ROTULO_OPERACAO[o]).join(' e ')}`}
      acao={
        <Link to="/esteira" className="text-sm text-[var(--brand-primary)] hover:underline">
          Abrir esteira
        </Link>
      }
    >
      <div className="space-y-4">
        {presentes.map((o) => (
          <div key={o}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ROTULO_OPERACAO[o]}</p>
            <ul className="divide-y divide-slate-100">
              {porOperacao[o]!.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      to={`/contatos/${v.parceiro.contatoId}`}
                      className="block truncate text-sm font-medium text-slate-800 hover:underline"
                    >
                      {v.parceiro.nome}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {v.etapa.nome} há {v.diasNaEtapa} dia(s)
                      {v.responsavel ? ` · ${v.responsavel.nome}` : ''}
                    </p>
                  </div>
                  {v.etapa.tipo === 'SAIDA' ? (
                    <Badge tom="erro">Saiu da esteira</Badge>
                  ) : (
                    v.parado && <Badge tom="alerta">Parado</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <EnviarParaCredenciamento
          contatos={contatos}
          contaId={contaId}
          nomeEmpresa={nomeEmpresa}
          operacoes={paraAdicionar}
          aoEnviar={() => void carregar()}
        />
      </div>
    </Card>
  );
}
