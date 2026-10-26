import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../../../components/ui';
import { useAuth } from '../../../features/auth/AuthProvider';
import { api } from '../../../lib/api';
import type { EstruturaEsteira, Operacao, RespostaLista, VinculoLinha } from '../../../lib/esteiraTypes';
import { ROTULO_OPERACAO, operacoesParaAdicionar } from '../../esteira/cadastroEsteira';
import { operacoesPermitidas, parametroDaOperacao, urlDoEstado } from '../../esteira/estadoEsteira';
import { PainelDoCiclo } from '../PainelDoCiclo';
import { EnviarParaCredenciamento } from '../EnviarParaCredenciamento';
import { trilhoDoParceiro } from './trilhoDoParceiro';

/** Vínculos por operação que a ficha mostra (um parceiro tem no máximo um por operação). */
const TAMANHO = 10;

type DaOperacao = { vinculos: VinculoLinha[]; estrutura: EstruturaEsteira };

/**
 * Ciclo do Parceiro (no lugar de "ciclo de vendas"): em que etapa da esteira o
 * parceiro está, em cada operação que o usuário vê. Lê a API das esteiras
 * (`/esteiras/:operacao/lista?contatoId=` + `estrutura` para o trilho com os
 * nomes atuais das etapas) — é a mesma informação, vista a partir do parceiro.
 *
 * AGENTE não vê esteira (mesmo corte da API); para ele o bloco nem aparece.
 */
export function CicloDoParceiro({ contatoId }: { contatoId: string }) {
  const { temPerfil, operacoes: acesso, temModulo } = useAuth();
  const podeVer = temPerfil('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL') && temModulo('esteira');
  const permitidas = operacoesPermitidas(acesso);
  const chavePermitidas = permitidas.join(',');
  const [porOperacao, setPorOperacao] = useState<Partial<Record<Operacao, DaOperacao>> | null>(null);

  const carregar = useCallback(async () => {
    const lista = chavePermitidas ? (chavePermitidas.split(',') as Operacao[]) : [];
    const respostas = await Promise.all(
      lista.map((o) => {
        const base = `/esteiras/${parametroDaOperacao(o)}`;
        return Promise.all([
          api.get<RespostaLista>(`${base}/lista?contatoId=${contatoId}&tamanho=${TAMANHO}`),
          api.get<EstruturaEsteira>(`${base}/estrutura`),
        ])
          .then(([l, estrutura]) => [o, { vinculos: l.linhas, estrutura }] as const)
          // Sem acesso (404) ou falha: a operação simplesmente não aparece.
          .catch(() => null);
      }),
    );
    setPorOperacao(Object.fromEntries(respostas.filter((r) => r !== null)));
  }, [contatoId, chavePermitidas]);

  useEffect(() => {
    if (podeVer) void carregar();
  }, [podeVer, carregar]);

  if (!podeVer || !porOperacao || permitidas.length === 0) return null;

  const respondidas = Object.keys(porOperacao) as Operacao[];
  const presentes = respondidas.filter((o) => (porOperacao[o]?.vinculos.length ?? 0) > 0);
  // Só oferece onde a consulta respondeu (sem resposta, não dá para saber se já está lá).
  const paraAdicionar = operacoesParaAdicionar(acesso, presentes).filter((o) => respondidas.includes(o));
  // Depois de credenciado, o que vale é a relação: implantação e acompanhamento.
  const ativos = presentes.flatMap((o) => {
    const { vinculos, estrutura } = porOperacao[o]!;
    return vinculos.filter((v) => {
      const etapa = estrutura.etapas.find((e) => e.chave === v.etapa.chave);
      return etapa?.papel === 'ATIVO' && etapa.tipo !== 'SAIDA';
    });
  });

  return (
    <>
      <Card
        titulo="Ciclo do parceiro"
        descricao={
          presentes.length === 0
            ? 'Ainda não entrou em nenhuma esteira'
            : `Etapa atual em ${presentes.map((o) => ROTULO_OPERACAO[o]).join(' e ')}`
        }
        acao={
          <Link to="/esteira" className="text-sm text-[var(--brand-primary)] hover:underline">
            Abrir esteira
          </Link>
        }
      >
        {presentes.length === 0 ? (
          <p className="text-sm text-slate-500">Ainda não está em nenhuma esteira. Envie para uma operação abaixo.</p>
        ) : (
          <div className="space-y-4">
            {presentes.flatMap((o) =>
              porOperacao[o]!.vinculos.map((v) => {
                const { passos, fora } = trilhoDoParceiro(porOperacao[o]!.estrutura.etapas, v.etapa.chave);
                return (
                  <div key={v.id}>
                    <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                      {ROTULO_OPERACAO[o]}
                      {fora && (
                        <Badge tom={fora.tipo === 'SAIDA' ? 'erro' : 'alerta'}>
                          {fora.tipo === 'SAIDA' ? `Saiu: ${fora.nome}` : fora.nome}
                        </Badge>
                      )}
                      {v.parado && fora?.tipo !== 'SAIDA' && <Badge tom="alerta">Parado</Badge>}
                      <span className="font-normal">· {v.diasNaEtapa}d na etapa atual</span>
                      <Link
                        // A esteira não abre cartão pela URL: a Lista já filtrada pelo nome chega nele.
                        to={`/esteira/${parametroDaOperacao(o)}${urlDoEstado('lista', { busca: v.parceiro.nome })}`}
                        className="font-normal text-[var(--brand-primary)] hover:underline"
                      >
                        Ver na esteira
                      </Link>
                    </p>
                    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
                      {passos.map((p, i) => (
                        <li key={p.chave} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-slate-300" aria-hidden>→</span>}
                          <span
                            aria-current={p.estado === 'atual' ? 'step' : undefined}
                            className={`rounded-full px-2.5 py-1 ${
                              p.estado === 'atual'
                                ? 'bg-[var(--brand-primary)] font-semibold texto-sobre-cor-fixa'
                                : p.estado === 'feito'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {p.nome}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              }),
            )}
          </div>
        )}
        {/* Só as operações em que ele ainda não tem vínculo (a API recusa o segundo com 409). */}
        <div className="mt-4">
          <EnviarParaCredenciamento contatos={[{ id: contatoId, nome: '' }]} operacoes={paraAdicionar} aoEnviar={() => void carregar()} />
        </div>
      </Card>
      {ativos.map((v) => (
        <PainelDoCiclo key={v.id} credenciamentoId={v.id} />
      ))}
    </>
  );
}
