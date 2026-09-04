import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { BarraDeMeta } from '../../components/viz/BarraDeMeta';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../features/auth/AuthProvider';
import {
  LABEL_SITUACAO_META,
  TOM_SITUACAO_META,
  moeda,
  type EscopoMeta,
  type LinhaDeMeta,
  type MesDaRampa,
  type PainelDeMetas,
  type Usuario,
} from '../../lib/types';

/**
 * Metas mensais (item 4.1 do plano em ANALISE-CRM.md).
 *
 * Duas coisas na mesma aba, de proposito: o **painel** do mes e o **formulario da
 * rampa**. Separadas em telas diferentes, definir meta viraria uma visita a
 * configuracao que ninguem faz — e a rampa mes a mes e justamente o que
 * distingue isto de uma meta anual.
 */

/** Mes corrente no formato que a API espera. */
const mesCorrente = () => new Date().toISOString().slice(0, 7);

/** Doze meses a frente, para o padrao da rampa cobrir um ano. */
const umAnoDepois = (mes: string) => {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(ano!, m! - 1 + 11, 1));
  return d.toISOString().slice(0, 7);
};

const nomeDoMes = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

/** Dinheiro, ou travessao. Nulo nunca vira "R$ 0,00". */
const dinheiro = (v: number | null) => (v === null ? '—' : moeda(v));

/**
 * A tabela do painel. A barra tem sempre a coluna numerica ao lado.
 *
 * `aoRemover` so vem para quem pode editar. Voltar uma meta para "nao definida"
 * precisa existir na tela: sem isso, um valor digitado errado ficaria para
 * sempre, e a alternativa — gravar zero — significa "meta de nao vender nada",
 * que e outra coisa.
 */
function Tabela({
  linhas,
  titulo,
  aoRemover,
}: {
  linhas: LinhaDeMeta[];
  titulo: string;
  aoRemover?: (l: LinhaDeMeta) => void;
}) {
  if (linhas.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1.5 pr-3 font-medium">Pessoa</th>
            <th className="py-1.5 pr-3 font-medium">Progresso</th>
            <th className="py-1.5 pr-3 text-right font-medium">Realizado</th>
            <th className="py-1.5 pr-3 text-right font-medium">Meta</th>
            <th className="py-1.5 pr-3 text-right font-medium">Projecao</th>
            <th className="py-1.5 pr-3 text-right font-medium">Falta/dia</th>
            <th className="py-1.5 font-medium">Situacao</th>
            {aoRemover && <th className="py-1.5 pl-3 font-medium sr-only">Acao</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l) => (
            <tr key={`${l.escopo}-${l.usuarioId}`}>
              <td className="py-2 pr-3 text-slate-800">
                {l.nome}
                {l.integrantes !== undefined && (
                  <span className="block text-xs text-slate-400">{l.integrantes} pessoa(s)</span>
                )}
              </td>
              <td className="py-2 pr-3"><BarraDeMeta percentual={l.percentual} situacao={l.situacao} /></td>
              <td className="py-2 pr-3 text-right text-slate-800">{moeda(l.realizado)}</td>
              <td className="py-2 pr-3 text-right text-slate-600">{l.meta === 0 ? '—' : moeda(l.meta)}</td>
              <td className="py-2 pr-3 text-right text-slate-600">{dinheiro(l.projecao)}</td>
              <td className="py-2 pr-3 text-right text-slate-600">{dinheiro(l.ritmoNecessario)}</td>
              <td className="py-2">
                <Badge tom={TOM_SITUACAO_META[l.situacao]}>{LABEL_SITUACAO_META[l.situacao]}</Badge>
              </td>
              {aoRemover && (
                <td className="py-2 pl-3 text-right">
                  <button
                    type="button"
                    aria-label={`Remover meta de ${l.nome}`}
                    onClick={() => aoRemover(l)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Remover
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MetasTab() {
  const [mes, setMes] = useState(mesCorrente());
  const [painel, setPainel] = useState<PainelDeMetas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { temPerfil } = useAuth();
  const podeEditar = temPerfil('ADMIN', 'SUPERVISOR');

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [alvo, setAlvo] = useState('');
  const [escopo, setEscopo] = useState<EscopoMeta>('INDIVIDUAL');
  const [de, setDe] = useState(mesCorrente());
  const [ate, setAte] = useState(umAnoDepois(mesCorrente()));
  const [rampa, setRampa] = useState<MesDaRampa[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setPainel(await api.get<PainelDeMetas>(`/metas?mes=${mes}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as metas');
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void api
      .get<{ usuarios: Usuario[] }>('/usuarios')
      .then((u) => setUsuarios(u.usuarios.filter((x) => x.ativo)))
      .catch(() => undefined);
  }, []);

  /**
   * Remove a meta de um mes — volta para "nao definida", que nao e zero.
   *
   * Sem isso a rota de exclusao existiria sem tela, e um valor digitado errado
   * ficaria para sempre: gravar zero no lugar significaria "meta de nao vender
   * nada", que e outra afirmacao.
   */
  const remover = async (l: LinhaDeMeta) => {
    if (!painel) return;
    setErro(null);
    try {
      const mesDaMeta = painel.mes.slice(0, 7);
      await api.del(`/metas?usuarioId=${l.usuarioId}&escopo=${l.escopo}&mes=${mesDaMeta}`);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao remover a meta');
    }
  };

  /** Le a rampa que existe hoje, para o formulario abrir com o estado atual. */
  const abrirRampa = async () => {
    if (!alvo) return;
    setAviso(null);
    try {
      const { rampa: atual } = await api.get<{ rampa: MesDaRampa[] }>(
        `/metas/rampa?usuarioId=${alvo}&de=${de}&ate=${ate}&escopo=${escopo}`,
      );
      setRampa(atual);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao ler a rampa');
    }
  };

  const salvarRampa = async () => {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      /*
       * Manda **so os meses preenchidos**.
       *
       * Mes em branco significa "nao definida", e mandar zero no lugar gravaria
       * meta de nao vender nada — o painel passaria a mostrar 100% de uma meta
       * que ninguem combinou. Para apagar uma meta existente ha a rota de
       * exclusao.
       */
      const valores = rampa
        .filter((r) => r.valor !== null && r.valor !== undefined && String(r.valor) !== '')
        .map((r) => ({ mes: r.mes.slice(0, 7), valor: Number(r.valor) }));

      if (valores.length === 0) {
        setAviso('Preencha ao menos um mes. Mes em branco significa "sem meta", e nao meta zero.');
        return;
      }

      await api.put('/metas/rampa', { usuarioId: alvo, escopo, valores });
      setAviso(`${valores.length} mes(es) gravado(s).`);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao gravar a rampa');
    } finally {
      setSalvando(false);
    }
  };

  /* Meta de equipe existe para GESTOR: e o unico perfil com equipe direta. */
  const candidatos = escopo === 'EQUIPE' ? usuarios.filter((u) => u.perfil === 'GESTOR') : usuarios;

  return (
    <div className="space-y-4">
      <Card titulo="Metas" descricao="Venda fechada no mes, contra o que foi combinado">
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Mes">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      {painel === null ? (
        <Card titulo="Painel do mes">
          <p className="text-sm text-slate-500">Carregando...</p>
        </Card>
      ) : (
        <>
          <Card
            titulo="Metas individuais"
            descricao={
              painel.individuais.length > 0
                ? `${painel.individuais.length} pessoa(s) com meta em ${nomeDoMes(painel.mes)}`
                : 'Nenhuma meta individual definida neste mes'
            }
          >
            {painel.individuais.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhuma meta para {nomeDoMes(painel.mes)}. O que foi vendido continua no funil — meta ausente nao
                esconde venda.
              </p>
            ) : (
              <Tabela
                linhas={painel.individuais}
                titulo="Metas individuais do mes"
                aoRemover={podeEditar ? (l) => void remover(l) : undefined}
              />
            )}
          </Card>

          {painel.equipes.length > 0 && (
            <Card
              titulo="Metas de equipe"
              descricao="A meta do gestor cobre a equipe dele — nao e a soma das individuais"
            >
              <Tabela
                linhas={painel.equipes}
                titulo="Metas de equipe do mes"
                aoRemover={podeEditar ? (l) => void remover(l) : undefined}
              />
              <p className="mt-3 text-xs text-slate-500">
                A equipe inclui o proprio gestor. Somar esta tabela com a de cima contaria a venda dele duas vezes —
                por isso as duas ficam separadas.
              </p>
            </Card>
          )}

          {painel.semMeta.length > 0 && (
            <Card titulo="Vendeu sem meta definida" descricao="Aparece aqui para o total nao discordar do funil">
              <ul className="divide-y divide-slate-100 text-sm">
                {painel.semMeta.map((u) => (
                  <li key={u.usuarioId} className="flex items-center justify-between py-2">
                    <span className="text-slate-800">{u.nome}</span>
                    <span className="text-slate-600">{moeda(u.realizado)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {podeEditar && (
        <Card
          titulo="Rampa mensal"
          descricao="Meta diferente por mes. Dezembro nao e junho, e uma meta anual dividida por doze descreve mal o ano"
        >
          <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Escopo">
              <Select
                value={escopo}
                onChange={(e) => {
                  setEscopo(e.target.value as EscopoMeta);
                  setRampa([]);
                  setAlvo('');
                }}
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="EQUIPE">Equipe (gestor)</option>
              </Select>
            </Field>
            <Field label="Pessoa">
              <Select value={alvo} onChange={(e) => { setAlvo(e.target.value); setRampa([]); }}>
                <option value="">Escolha</option>
                {candidatos.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </Select>
            </Field>
            <Field label="De">
              <Input type="month" value={de} onChange={(e) => setDe(e.target.value)} />
            </Field>
            <Field label="Ate">
              <Input type="month" value={ate} onChange={(e) => setAte(e.target.value)} />
            </Field>
          </div>

          <div className="mt-3">
            <Button variante="neutro" onClick={() => void abrirRampa()} disabled={!alvo}>
              Abrir rampa
            </Button>
          </div>

          {aviso && <p className="mt-3 text-xs text-slate-600">{aviso}</p>}

          {rampa.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {rampa.map((r, i) => (
                  <Field key={r.mes} label={nomeDoMes(r.mes)} hint={r.valor === null ? 'sem meta' : undefined}>
                    <Input
                      type="number"
                      aria-label={`Meta de ${nomeDoMes(r.mes)}`}
                      value={r.valor === null ? '' : String(r.valor)}
                      onChange={(e) => {
                        const copia = [...rampa];
                        // Campo esvaziado volta a nulo, e nao a zero: sao coisas
                        // diferentes, e o salvamento so manda o que tem valor.
                        copia[i] = { ...r, valor: e.target.value === '' ? null : Number(e.target.value) };
                        setRampa(copia);
                      }}
                    />
                  </Field>
                ))}
              </div>
              <Button onClick={() => void salvarRampa()} disabled={salvando}>
                {salvando ? 'Gravando...' : 'Gravar rampa'}
              </Button>
              <p className="text-xs text-slate-500">
                Mes em branco fica <strong>sem meta</strong> — nao vira meta zero. Meses fora do intervalo escolhido
                nao sao tocados.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
