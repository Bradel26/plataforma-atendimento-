import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../../../components/ui';
import { useAuth } from '../../../features/auth/AuthProvider';
import { api } from '../../../lib/api';
import { LABEL_SITUACAO_EXCECAO, type Credenciamento, type OperacaoEsteira } from '../../../lib/types';

/**
 * Ciclo do Parceiro (no lugar de "ciclo de vendas"): em que etapa da esteira o
 * parceiro esta, em cada operacao. Conversa direto com a Esteira de
 * Credenciamento — e a mesma informacao, vista a partir do parceiro.
 *
 * AGENTE nao ve esteira (mesmo corte da API); para ele o bloco nem aparece.
 */
export function CicloDoParceiro({ contatoId }: { contatoId: string }) {
  const { temPerfil } = useAuth();
  const podeVer = temPerfil('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL');
  const [creds, setCreds] = useState<Credenciamento[] | null>(null);
  const [operacoes, setOperacoes] = useState<OperacaoEsteira[]>([]);

  useEffect(() => {
    if (!podeVer) return;
    void Promise.all([
      api.get<{ credenciamentos: Credenciamento[] }>(`/credenciamentos?contatoId=${contatoId}`),
      api.get<{ funis: OperacaoEsteira[] }>('/credenciamentos/funis'),
    ])
      .then(([c, f]) => {
        setCreds(c.credenciamentos);
        setOperacoes(f.funis);
      })
      .catch(() => setCreds([]));
  }, [contatoId, podeVer]);

  if (!podeVer || !creds || operacoes.length === 0) return null;

  return (
    <Card
      titulo="Ciclo do parceiro"
      descricao={creds.length === 0 ? 'Ainda nao entrou em nenhuma esteira' : 'Etapa atual em cada operacao'}
      acao={
        <Link to="/esteira" className="text-sm text-[var(--brand-primary)] hover:underline">
          Abrir esteira
        </Link>
      }
    >
      {creds.length === 0 ? (
        <p className="text-sm text-slate-500">Cadastre o parceiro pela Esteira para iniciar o credenciamento.</p>
      ) : (
        <div className="space-y-4">
          {creds.map((c) => {
            const estagios = operacoes.find((o) => o.id === c.funil.id)?.estagios ?? [];
            const atual = estagios.findIndex((e) => e.id === c.estagio.id);
            return (
              <div key={c.id}>
                <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-500">
                  {c.funil.nome}
                  {c.situacaoExcecao && (
                    <span title={c.motivoExcecao ?? undefined}>
                      <Badge tom="erro">{LABEL_SITUACAO_EXCECAO[c.situacaoExcecao]}</Badge>
                    </span>
                  )}
                  <span className="font-normal">· {c.diasNoEstagio}d na etapa atual</span>
                </p>
                <ol className="flex flex-wrap items-center gap-1.5 text-xs">
                  {estagios.map((e, i) => (
                    <li key={e.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-slate-300" aria-hidden>→</span>}
                      <span
                        aria-current={i === atual ? 'step' : undefined}
                        className={`rounded-full px-2.5 py-1 ${
                          i === atual
                            ? 'bg-[var(--brand-primary)] font-semibold text-white'
                            : i < atual
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {e.nome}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
