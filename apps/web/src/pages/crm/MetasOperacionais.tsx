import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { BarraDeMeta } from '../../components/viz/BarraDeMeta';
import { ApiError, api } from '../../lib/api';
import { LABEL_SITUACAO_META, TOM_SITUACAO_META, type SituacaoMeta, type Usuario } from '../../lib/types';

/**
 * Metas operacionais do consultor de credenciamento: cadastrar, credenciar,
 * ativar, contatar, reativar. Sao metas de PROCESSO, separadas da meta comercial
 * em dinheiro (aba "Comercial"): o CRM ainda nao tem venda por parceiro, e quando
 * tiver ela entra como indicador novo, sem misturar com estas.
 */

type Indicador = {
  chave: string;
  rotulo: string;
  unidade: 'qtd' | 'pct';
  sentido: 'maior' | 'menor';
  comoMede: string;
};

type Item = {
  indicador: string;
  alvo: number | null;
  realizado: number | null;
  percentual: number | null;
  situacao: SituacaoMeta;
};

type Consultor = { usuarioId: string; nome: string; itens: Item[] };

type Painel = {
  mes: string;
  indicadores: Indicador[];
  consultores: Consultor[];
  equipe: { itens: Item[] };
};

type Minha = { mes: string; indicadores: Indicador[]; consultor: Consultor };

const mesCorrente = () => new Date().toISOString().slice(0, 7);

/** "META — SETEMBRO/2026". */
const tituloDoMes = (mes: string) => {
  const d = new Date(`${mes.slice(0, 7)}-01T00:00:00Z`);
  const nome = d.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }).toUpperCase();
  return `META — ${nome}/${d.getUTCFullYear()}`;
};

/** "18 / 20", "60% / 70%", "3 de no maximo 5"; travessao quando nao se sabe. */
function textoDoValor(ind: Indicador, item: Item) {
  const fmt = (v: number | null) => (v === null ? '—' : ind.unidade === 'pct' ? `${v}%` : String(v));
  if (item.alvo === null) return `${fmt(item.realizado)} · sem meta`;
  return ind.sentido === 'menor'
    ? `${fmt(item.realizado)} · máximo ${fmt(item.alvo)}`
    : `${fmt(item.realizado)} / ${fmt(item.alvo)}`;
}

function LinhasDeMeta({ indicadores, itens }: { indicadores: Indicador[]; itens: Item[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {indicadores.map((ind) => {
        const item = itens.find((i) => i.indicador === ind.chave);
        if (!item) return null;
        const semDados = item.alvo !== null && item.realizado === null;
        return (
          <li key={ind.chave} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{ind.rotulo}</p>
              {/* Como medir, ao lado do numero: quem le sabe de onde ele vem. */}
              <p className="text-xs text-slate-500">{ind.comoMede}</p>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <span className="text-sm font-semibold text-slate-800">
                {semDados ? 'sem dados no período' : textoDoValor(ind, item)}
              </span>
              {item.alvo !== null && !semDados && (
                <div className="flex items-center gap-2">
                  <BarraDeMeta percentual={item.percentual} situacao={item.situacao} />
                  <Badge tom={TOM_SITUACAO_META[item.situacao]}>{LABEL_SITUACAO_META[item.situacao]}</Badge>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Formulario dos alvos de um consultor no mes. Em branco = nao definida (nao e zero). */
function EditorDeAlvos({
  consultor,
  mes,
  indicadores,
  aoSalvar,
  aoCancelar,
}: {
  consultor: { usuarioId: string; nome: string };
  mes: string;
  indicadores: Indicador[];
  aoSalvar: () => void;
  aoCancelar: () => void;
}) {
  const mostrarToast = useToast();
  const [valores, setValores] = useState<Record<string, string> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void api
      .get<{ alvos: Record<string, number | null> }>(
        `/metas/operacionais/alvos?usuarioId=${consultor.usuarioId}&mes=${mes}`,
      )
      .then((r) => setValores(Object.fromEntries(Object.entries(r.alvos).map(([k, v]) => [k, v === null ? '' : String(v)]))))
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as metas'));
  }, [consultor.usuarioId, mes]);

  const salvar = async () => {
    if (!valores) return;
    setSalvando(true);
    setErro(null);
    try {
      // Campo em branco manda nulo: apaga a meta, em vez de gravar zero.
      const alvos = Object.fromEntries(
        indicadores.map((i) => [i.chave, valores[i.chave]?.trim() === '' ? null : Number(valores[i.chave])]),
      );
      await api.put('/metas/operacionais/alvos', { usuarioId: consultor.usuarioId, mes, alvos });
      mostrarToast('sucesso', `Metas de ${consultor.nome} salvas.`);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar as metas');
    } finally {
      setSalvando(false);
    }
  };

  if (!valores) return erro ? <Alerta>{erro}</Alerta> : <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-800">Metas de {consultor.nome}</p>
      {erro && <Alerta>{erro}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-2">
        {indicadores.map((i) => (
          <Field
            key={i.chave}
            label={i.unidade === 'pct' ? `${i.rotulo} (%)` : i.sentido === 'menor' ? `${i.rotulo} (maximo)` : i.rotulo}
          >
            <Input
              type="number"
              min={0}
              max={i.unidade === 'pct' ? 100 : 100000}
              step={1}
              placeholder="sem meta"
              value={valores[i.chave] ?? ''}
              onChange={(e) => setValores({ ...valores, [i.chave]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs text-slate-500">Deixe em branco o indicador que não tem meta neste mês.</p>
      <div className="flex gap-2">
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar metas'}
        </Button>
        <Button variante="neutro" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function MetasOperacionais({ visaoGeral, podeEditar }: { visaoGeral: boolean; podeEditar: boolean }) {
  const [mes, setMes] = useState(mesCorrente());
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ usuarioId: string; nome: string } | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [novoConsultor, setNovoConsultor] = useState('');

  const carregar = useCallback(async () => {
    try {
      if (visaoGeral) {
        setPainel(await api.get<Painel>(`/metas/operacionais?mes=${mes}`));
      } else {
        const m = await api.get<Minha>(`/metas/operacionais/minha?mes=${mes}`);
        setPainel({ mes: m.mes, indicadores: m.indicadores, consultores: [m.consultor], equipe: { itens: [] } });
      }
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as metas');
    }
  }, [mes, visaoGeral]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!podeEditar) return;
    void api
      .get<{ usuarios: Usuario[] }>('/usuarios')
      .then((u) => setUsuarios(u.usuarios.filter((x) => x.ativo && x.perfil === 'COMERCIAL')))
      .catch(() => undefined);
  }, [podeEditar]);

  const semCard = usuarios.filter((u) => !painel?.consultores.some((c) => c.usuarioId === u.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Mês">
          <Input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="w-44" />
        </Field>
        {podeEditar && semCard.length > 0 && (
          <div className="flex items-end gap-2">
            <Field label="Definir metas para">
              <Select value={novoConsultor} onChange={(e) => setNovoConsultor(e.target.value)}>
                <option value="">Selecione o consultor...</option>
                {semCard.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variante="neutro"
              disabled={!novoConsultor}
              onClick={() => {
                const u = usuarios.find((x) => x.id === novoConsultor);
                if (u) setEditando({ usuarioId: u.id, nome: u.nome });
              }}
            >
              Definir
            </Button>
          </div>
        )}
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      {editando && painel && (
        <Card titulo={tituloDoMes(painel.mes)} descricao="Definir metas">
          <EditorDeAlvos
            consultor={editando}
            mes={mes}
            indicadores={painel.indicadores}
            aoSalvar={() => {
              setEditando(null);
              setNovoConsultor('');
              void carregar();
            }}
            aoCancelar={() => setEditando(null)}
          />
        </Card>
      )}

      {painel && visaoGeral && painel.consultores.length > 0 && (
        <Card titulo={`${tituloDoMes(painel.mes)} — EQUIPE`} descricao="Soma dos consultores abaixo">
          <LinhasDeMeta indicadores={painel.indicadores} itens={painel.equipe.itens} />
        </Card>
      )}

      {painel?.consultores.map((c) => (
        <Card
          key={c.usuarioId}
          titulo={tituloDoMes(painel.mes)}
          descricao={c.nome}
          acao={
            podeEditar ? (
              <Button variante="neutro" tamanho="sm" onClick={() => setEditando({ usuarioId: c.usuarioId, nome: c.nome })}>
                Definir metas
              </Button>
            ) : undefined
          }
        >
          <LinhasDeMeta indicadores={painel.indicadores} itens={c.itens} />
        </Card>
      ))}

      {painel && painel.consultores.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            {podeEditar
              ? 'Nenhum consultor com meta ou movimento neste mês. Escolha um consultor acima para definir as metas.'
              : 'Nenhuma meta definida para você neste mês.'}
          </p>
        </Card>
      )}
    </div>
  );
}
