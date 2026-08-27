import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { LABEL_TIPO_ATIVIDADE, type Atividade, type FichaContato as Ficha } from '../../../lib/types';
import { LinhaDoTempo } from './LinhaDoTempo';
import { RegistrarAtividade } from './RegistrarAtividade';

/**
 * A vida do cliente numa tela: quem e, o que esta em aberto, o que ficou
 * marcado e tudo que ja aconteceu.
 *
 * O cabecalho e a linha do tempo trazem tambem o que e da *empresa* do contato,
 * nao so dele: proposta e oportunidade vivem na conta, e uma ficha que para no
 * atendimento nao responde "quanto esse cliente ja comprou".
 */

const moeda = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Numero grande com rotulo. Sem grafico: sao seis valores, nao uma serie. */
function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-800">{valor}</p>
      {detalhe && <p className="text-xs text-slate-400">{detalhe}</p>}
    </div>
  );
}

export function FichaContato({ contatoId }: { contatoId: string }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Contador de recargas: mudar este numero e o sinal para a linha do tempo
  // buscar de novo. Guardar a lista aqui para repassar seria duplicar o estado
  // dela — e a paginacao por cursor mora la dentro.
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setFicha(await api.get<Ficha>(`/ficha/contato/${contatoId}`));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a ficha');
    }
  }, [contatoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizar = () => {
    void carregar();
    setVersao((v) => v + 1);
  };

  const concluir = async (atividade: Atividade) => {
    try {
      await api.post(`/atividades/${atividade.id}/concluir`, {});
      atualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao concluir a tarefa');
    }
  };

  if (erro && !ficha) return <Alerta>{erro}</Alerta>;
  if (!ficha) return <Card titulo="Ficha do contato"><p className="text-sm text-slate-500">Carregando ficha...</p></Card>;

  const { contato, indicadores: i, atividadesAbertas } = ficha;
  const agora = Date.now();

  return (
    <div className="space-y-5">
      <Card
        titulo={contato.nome}
        descricao={contato.conta ? `Empresa: ${contato.conta.nome}` : 'Sem empresa vinculada'}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">E-mail</dt>
            <dd className="truncate text-slate-800">{contato.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Telefone</dt>
            <dd className="text-slate-800">{contato.telefone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Origem</dt>
            <dd className="text-slate-800">{contato.canalOrigem ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cliente desde</dt>
            <dd className="text-slate-800">
              {contato.criadoEm ? new Date(contato.criadoEm).toLocaleDateString('pt-BR') : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Indicador rotulo="Conversas" valor={String(i.conversas)} />
          <Indicador rotulo="Ligacoes" valor={String(i.chamadas)} />
          {/* Rotulo curto e a qualificacao no detalhe: "Protocolos abertos" em
              duas linhas desalinha a altura dos seis cartoes. */}
          <Indicador rotulo="Protocolos" valor={String(i.protocolosAbertos)} detalhe="abertos" />
          <Indicador rotulo="Oportunidades" valor={String(i.oportunidadesAbertas)} detalhe="em aberto" />
          <Indicador
            rotulo="Ja comprou"
            valor={moeda(i.valorGanho)}
            detalhe={`${i.oportunidadesGanhas} ganha(s)`}
          />
          <Indicador rotulo="Tarefas" valor={String(i.atividadesAbertas)} detalhe="em aberto" />
        </div>

        {contato.observacoes && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{contato.observacoes}</p>
        )}
        {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}
      </Card>

      {atividadesAbertas.length > 0 && (
        <Card titulo="Tarefas marcadas" descricao={`${atividadesAbertas.length} em aberto`}>
          <ul className="divide-y divide-slate-100">
            {atividadesAbertas.map((a) => {
              const atrasada = Boolean(a.prazo && new Date(a.prazo).getTime() < agora);
              return (
                <li key={a.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{LABEL_TIPO_ATIVIDADE[a.tipo]}</Badge>
                      {a.prazo && (
                        <Badge tom={atrasada ? 'alerta' : 'neutro'}>
                          {atrasada ? 'Atrasada · ' : ''}
                          {dataHora(a.prazo)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{a.titulo}</p>
                    {a.responsavel && <p className="text-xs text-slate-400">{a.responsavel.nome}</p>}
                  </div>
                  <Button variante="neutro" onClick={() => void concluir(a)}>
                    Concluir
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card titulo="Registrar" descricao="Fica na linha do tempo na hora">
        <RegistrarAtividade contatoId={contatoId} aoRegistrar={atualizar} />
      </Card>

      <Card titulo="Linha do tempo" descricao="Tudo que aconteceu com este cliente e com a empresa dele">
        <LinhaDoTempo base={`/ficha/contato/${contatoId}`} raizId={contatoId} recarregar={versao} />
      </Card>
    </div>
  );
}

/** Reaproveitado pela aba de contas: mesma linha do tempo, outra raiz. */
export function FichaVazia() {
  return (
    <Card titulo="Ficha do contato">
      <EmptyState titulo="Selecione um contato" descricao="A vida do cliente aparece aqui." />
    </Card>
  );
}
