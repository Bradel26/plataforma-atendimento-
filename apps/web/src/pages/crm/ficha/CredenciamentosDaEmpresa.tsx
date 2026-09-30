import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../../../components/ui';
import { useAuth } from '../../../features/auth/AuthProvider';
import { api } from '../../../lib/api';
import { LABEL_SITUACAO_EXCECAO, type Credenciamento, type OperacaoEsteira } from '../../../lib/types';
import { EnviarParaCredenciamento } from '../EnviarParaCredenciamento';

/**
 * Credenciamentos da empresa: em que etapa da esteira cada contato dela esta, e o
 * atalho para enviar mais um. AGENTE nao participa da esteira (mesmo corte da
 * API), entao para ele o bloco nem aparece.
 */
export function CredenciamentosDaEmpresa({
  contaId,
  contatos,
}: {
  contaId: string;
  contatos: Array<{ id: string; nome: string }>;
}) {
  const { temPerfil } = useAuth();
  const podeVer = temPerfil('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL');
  const [creds, setCreds] = useState<Credenciamento[] | null>(null);
  const [operacoes, setOperacoes] = useState<OperacaoEsteira[]>([]);

  const carregar = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([
        api.get<{ credenciamentos: Credenciamento[] }>(`/credenciamentos?contaId=${contaId}`),
        api.get<{ funis: OperacaoEsteira[] }>('/credenciamentos/funis'),
      ]);
      setCreds(c.credenciamentos);
      setOperacoes(f.funis);
    } catch {
      setCreds([]);
    }
  }, [contaId]);

  useEffect(() => {
    if (podeVer) void carregar();
  }, [podeVer, carregar]);

  if (!podeVer || !creds || operacoes.length === 0) return null;

  return (
    <Card
      titulo="Credenciamento"
      descricao={creds.length === 0 ? 'Nenhum contato desta empresa na esteira' : `${creds.length} na esteira`}
      acao={
        <Link to="/esteira" className="text-sm text-[var(--brand-primary)] hover:underline">
          Abrir esteira
        </Link>
      }
    >
      <div className="space-y-4">
        {creds.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {creds.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    to={`/contatos/${c.contato.id}`}
                    className="block truncate text-sm font-medium text-slate-800 hover:underline"
                  >
                    {c.contato.nome}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {c.funil.nome} · {c.estagio.nome} há {c.diasNoEstagio} dia(s)
                  </p>
                </div>
                {c.situacaoExcecao && <Badge tom="erro">{LABEL_SITUACAO_EXCECAO[c.situacaoExcecao]}</Badge>}
              </li>
            ))}
          </ul>
        )}
        <EnviarParaCredenciamento contatos={contatos} contaId={contaId} operacoes={operacoes} aoEnviar={() => void carregar()} />
      </div>
    </Card>
  );
}
