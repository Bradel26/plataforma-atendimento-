import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Card, Field, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { LABEL_TIPO_ATIVIDADE, type TipoAtividade } from '../../lib/types';

type Ref = { id: string; nome: string };

type ItemParceiro = {
  id: string;
  parceiro: string;
  contato: Ref & { telefone: string | null };
  responsavel: Ref | null;
  operacao: Ref;
  etapa: string;
  diasNaEtapa: number;
  ultimaInteracaoEm: string | null;
  motivo?: string | null;
};

type Resposta = {
  diasSemInteracao: number;
  aguardandoRetorno: Array<{
    id: string;
    titulo: string;
    tipo: TipoAtividade;
    prazo: string;
    atrasado: boolean;
    contato: (Ref & { telefone: string | null }) | null;
    responsavel: Ref | null;
  }>;
  aguardandoDocumentacao: ItemParceiro[];
  precisamDeContato: ItemParceiro[];
  semInteracao: ItemParceiro[];
  reativacao: ItemParceiro[];
};

const data = (iso: string | null) =>
  iso === null ? 'nunca' : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** A regra que coloca alguem na lista: quem le o card sabe por que o parceiro esta ali. */
function Regra({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span className="font-semibold text-slate-700">Como funciona: </span>
      {children}
    </p>
  );
}

function ListaDeParceiros({ itens, vazio }: { itens: ItemParceiro[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-sm text-slate-500">{vazio}</p>;
  return (
    <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
      {itens.map((p) => (
        <li key={p.id} className="py-2">
          <div className="flex items-center justify-between gap-2">
            <Link to={`/contatos/${p.contato.id}`} className="truncate text-sm font-medium text-slate-800 hover:underline">
              {p.parceiro}
            </Link>
            <span className="shrink-0 text-xs text-slate-500">{p.operacao.nome}</span>
          </div>
          <p className="text-xs text-slate-500">
            {p.etapa} há {p.diasNaEtapa}d · última interação {data(p.ultimaInteracaoEm)} ·{' '}
            {p.responsavel?.nome ?? 'sem responsável'}
            {p.motivo ? ` · ${p.motivo}` : ''}
            {p.contato.telefone ? ` · ${p.contato.telefone}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Acompanhamentos (no lugar de "Oportunidades", que para a operacao de
 * credenciamento soava como venda): os parceiros que precisam de alguma acao
 * ou retorno, separados pelo motivo.
 */
export function AcompanhamentosTab() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [dias, setDias] = useState(7);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<{ acompanhamentos: Resposta }>(`/credenciamentos/acompanhamentos?dias=${dias}`);
      setDados(r.acompanhamentos);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os acompanhamentos');
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) return <Alerta>{erro}</Alerta>;
  if (!dados) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Sem interação há" hint="dias">
          <Input
            type="number"
            min={1}
            max={180}
            value={dias}
            onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 1))}
            className="w-28"
          />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Aguardando retorno" descricao={`${dados.aguardandoRetorno.length} retorno(s) marcados é não feitos`}>
          <Regra>Mostra os retornos que você ou a equipe agendaram e ainda não fizeram. Os vencidos ficam marcados como atrasados.</Regra>
          {dados.aguardandoRetorno.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum retorno pendente.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {dados.aguardandoRetorno.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-slate-800">
                      {r.contato ? (
                        <Link to={`/contatos/${r.contato.id}`} className="font-medium hover:underline">
                          {r.contato.nome}
                        </Link>
                      ) : null}{' '}
                      — {r.titulo}
                    </span>
                    <Badge tom={r.atrasado ? 'erro' : 'neutro'}>{r.atrasado ? 'atrasado' : data(r.prazo)}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {LABEL_TIPO_ATIVIDADE[r.tipo] ?? r.tipo} · {r.responsavel?.nome ?? 'sem responsável'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          titulo="Aguardando documentação"
          descricao={`${dados.aguardandoDocumentacao.length} parceiro(s) na etapa de pendência`}
        >
          <Regra>Parceiros parados na etapa de pendência, esperando enviar documentos. Saem da lista quando avançam na esteira.</Regra>
          <ListaDeParceiros itens={dados.aguardandoDocumentacao} vazio="Ninguém com pendência de documentos." />
        </Card>

        <Card titulo="Precisam de contato" descricao="Na esteira sem responsável ou sem nenhuma conversa">
          <Regra>Parceiros em credenciamento que ainda não tem responsável ou nunca conversaram com a equipe. Defina um responsável e inicie a conversa.</Regra>
          <ListaDeParceiros itens={dados.precisamDeContato} vazio="Todos já tem responsável e conversa." />
        </Card>

        <Card titulo={`Sem interação há ${dados.diasSemInteracao}+ dias`} descricao="Última mensagem antiga, ainda na esteira">
          <Regra>Parceiros em credenciamento que pararam de responder. O prazo e o número de dias no campo acima.</Regra>
          <ListaDeParceiros itens={dados.semInteracao} vazio="Nenhum parceiro esquecido." />
        </Card>

        <Card titulo="Precisam de reativação" descricao="Parceiros inativados">
          <Regra>Parceiros marcados como inativos na esteira, com o motivo. Use para tentar retomar o contato.</Regra>
          <ListaDeParceiros itens={dados.reativacao} vazio="Nenhum parceiro inativado." />
        </Card>
      </div>
    </div>
  );
}
