import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Button, Select, Textarea } from '../../components/ui';
import { Gaveta } from '../../components/ui/Gaveta';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../features/auth/AuthProvider';
import { ApiError, api } from '../../lib/api';
import type {
  EditarVinculoInput,
  EstruturaEsteira,
  Operacao,
  RespostaVinculo,
  VinculoDetalhe,
  VinculoResumo,
} from '../../lib/esteiraTypes';
import { useResponsaveis } from './BarraDeFiltros';
import { CamposStarlink } from './CamposStarlink';
import { CamposTim } from './CamposTim';
import { CampoLeitura, CampoTexto, Secao } from './camposUi';
import { useRegrasDaEsteira, type ExtrasDaRegra } from './DialogoMovimento';
import {
  ROTULO_TIPO_HISTORICO,
  agruparAuditoria,
  dataHora,
  dataCurta,
  formatarValorAuditado,
  rotuloDoCampoAuditado,
} from './gavetaVinculo';
import { parametroDaOperacao } from './estadoEsteira';
import { colunasDoKanban, decidirMovimento, dialogoVazio, podeSoltar, textoParado, type ContextoDialogo } from './regrasMovimento';

type Aba = 'dados' | 'operacao' | 'notas' | 'historico' | 'auditoria';
const ABAS: Array<{ chave: Aba; rotulo: string }> = [
  { chave: 'dados', rotulo: 'Dados' },
  { chave: 'operacao', rotulo: 'Operação' },
  { chave: 'notas', rotulo: 'Notas' },
  { chave: 'historico', rotulo: 'Histórico' },
  { chave: 'auditoria', rotulo: 'Auditoria' },
];

const ROTULO_SITUACAO: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  DESISTENTE: 'Desistente',
  DESCREDENCIADO: 'Descredenciado',
  NURTURE: 'Nurture',
  DESCARTADO: 'Descartado',
};

/**
 * Gaveta do vínculo (spec 6.1): cadastro central só leitura, campos da
 * operação, notas, histórico e auditoria, mais o "Mover para…" (caminho de
 * teclado/toque do arraste). Toda escrita passa pelo diálogo de regras: a
 * recusa 409/403/400 do servidor abre o `DialogoMovimento`.
 */
export function DetalheVinculo({
  vinculo: resumo,
  operacao,
  estrutura,
  aoFechar,
  aoMudar,
}: {
  /** Cartão aberto; nulo fecha a gaveta. */
  vinculo: VinculoResumo | null;
  operacao: Operacao;
  estrutura: EstruturaEsteira;
  aoFechar: () => void;
  /** Depois de gravar: `antes` é o cartão como estava (a etapa de onde saiu). */
  aoMudar: (antes: VinculoResumo, v: VinculoDetalhe) => void;
}) {
  const regras = useRegrasDaEsteira();
  const mostrar = useToast();
  const base = `/esteiras/${parametroDaOperacao(operacao)}`;
  const [detalhe, setDetalhe] = useState<VinculoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('operacao');
  const id = resumo?.id ?? null;
  const leitura = estrutura.nivel !== 'EDICAO';

  useEffect(() => {
    setDetalhe(null);
    setErro(null);
    if (!id) return;
    let ativo = true;
    api
      .get<RespostaVinculo>(`${base}/vinculos/${id}`)
      .then((r) => ativo && setDetalhe(r.vinculo))
      .catch((e) => ativo && setErro(e instanceof ApiError ? e.message : 'Falha ao abrir o parceiro'));
    return () => {
      ativo = false;
    };
  }, [base, id]);

  /** Aplica o vínculo devolvido pela escrita e avisa o quadro (etapa pode ter mudado). */
  const ultimo = useRef<VinculoDetalhe | null>(null);
  ultimo.current = detalhe;
  const aplicar = useCallback(
    (v: VinculoDetalhe) => {
      // Fora do updater do estado: o StrictMode o chama duas vezes, e o quadro releria em dobro.
      const cartao = ultimo.current ?? resumo;
      ultimo.current = v;
      setDetalhe(v);
      if (cartao) aoMudar(cartao, v);
    },
    [aoMudar, resumo],
  );

  const motivosTodos = useMemo(
    () => (operacao === 'STARLINK' ? { tipo: 'perda' as const, opcoes: estrutura.motivosPerda.map((m) => ({ valor: m.valor, rotulo: m.rotulo })) } : null),
    [operacao, estrutura.motivosPerda],
  );

  /** PATCH do vínculo pelo diálogo de regras (justificativa/motivo da perda entram na repetição). */
  const salvar = (corpo: EditarVinculoInput) => {
    if (!detalhe) return;
    const contexto: ContextoDialogo = { titulo: 'Confirmar alteração', operacao, motivoSeExigido: motivosTodos };
    void regras.executar({
      contexto,
      inicial: null,
      chamar: (x: ExtrasDaRegra) =>
        api
          .patch<RespostaVinculo>(`${base}/vinculos/${detalhe.id}`, {
            ...corpo,
            campos: { ...(corpo.campos ?? {}), ...(x.motivoPerda ? { motivoPerda: x.motivoPerda } : {}) },
            ...(x.justificativa ? { justificativa: x.justificativa } : {}),
          })
          .then((r) => r.vinculo),
      aoConcluir: (v) => {
        aplicar(v);
        if (v.etapa.chave !== detalhe.etapa.chave) mostrar('info', `Etapa atualizada: ${v.etapa.nome}`);
      },
    });
  };

  const mover = (chave: string, extras: Partial<ExtrasDaRegra> = {}, inicialForcado?: ReturnType<typeof dialogoVazio>) => {
    if (!detalhe) return;
    const etapa = estrutura.etapas.find((e) => e.chave === chave);
    if (!etapa) return;
    const decisao = decidirMovimento({
      operacao,
      destino: detalhe.destinos[etapa.chave],
      etapa,
      podeForcar: estrutura.podeForcar,
      motivosPerda: estrutura.motivosPerda,
    });
    if (decisao.tipo === 'bloqueado') {
      mostrar('erro', decisao.motivo);
      return;
    }
    void regras.executar({
      contexto: decisao.contexto,
      inicial: inicialForcado ?? (decisao.tipo === 'dialogo' ? decisao.estado : null),
      chamar: (x) =>
        api
          .post<RespostaVinculo>(`${base}/vinculos/${detalhe.id}/mover`, { paraChave: etapa.chave, ...extras, ...x })
          .then((r) => r.vinculo),
      aoConcluir: (v) => {
        aplicar(v);
        mostrar('sucesso', `${v.parceiro.nome} foi para ${v.etapa.nome}`);
      },
    });
  };

  const descartarPorCnpj = () => {
    if (!detalhe) return;
    mover('SL_DESCARTADO', { motivoPerda: 'CNPJ_IRREGULAR' }, {
      ...dialogoVazio(
        'Descartar por CNPJ irregular',
        'O CNPJ não está apto e não há MEI nem alteração de CNAE. O parceiro vai para Descartado com o motivo "CNPJ irregular".',
      ),
      pedeJustificativa: detalhe.destinos.SL_DESCARTADO === 'JUSTIFICATIVA',
    });
  };

  const atual = detalhe ?? resumo;

  return (
    <Gaveta
      aberta={resumo !== null}
      titulo={atual?.parceiro.nome ?? 'Parceiro'}
      aoFechar={regras.dialogoAberto ? () => undefined : aoFechar}
      largura="max-w-xl"
    >
      {erro ? (
        <Alerta>{erro}</Alerta>
      ) : !detalhe ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonBloco className="h-8" />
          <SkeletonBloco className="h-48" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Cabecalho detalhe={detalhe} estrutura={estrutura} leitura={leitura} ocupado={regras.ocupado} aoMover={(c) => mover(c)} />
          <Avisos detalhe={detalhe} leitura={leitura} aoDescartar={descartarPorCnpj} />
          <Tabs itens={ABAS} ativo={aba} aoSelecionar={(a) => setAba(a as Aba)} />
          {aba === 'dados' && <AbaDados detalhe={detalhe} estrutura={estrutura} leitura={leitura} salvar={salvar} />}
          {aba === 'operacao' &&
            (operacao === 'TIM' ? (
              <CamposTim
                vinculo={detalhe}
                estrutura={estrutura}
                leitura={leitura}
                base={base}
                aoAtualizar={aplicar}
                salvarCampos={(campos) => salvar({ campos })}
              />
            ) : (
              <CamposStarlink vinculo={detalhe} estrutura={estrutura} leitura={leitura} salvarCampos={(campos) => salvar({ campos })} />
            ))}
          {aba === 'notas' && <AbaNotas detalhe={detalhe} leitura={leitura} base={base} aoAtualizar={aplicar} />}
          {aba === 'historico' && <AbaHistorico detalhe={detalhe} />}
          {aba === 'auditoria' && <AbaAuditoria detalhe={detalhe} estrutura={estrutura} />}
        </div>
      )}
      {regras.dialogo}
    </Gaveta>
  );
}

function Cabecalho({
  detalhe,
  estrutura,
  leitura,
  ocupado,
  aoMover,
}: {
  detalhe: VinculoDetalhe;
  estrutura: EstruturaEsteira;
  leitura: boolean;
  ocupado: boolean;
  aoMover: (chave: string) => void;
}) {
  const destinos = colunasDoKanban(estrutura.etapas).filter((c) => c.chave !== detalhe.etapa.chave);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-primary)]">
          {detalhe.etapa.nome}
        </span>
        {detalhe.situacao !== 'EM_ANDAMENTO' && <Badge tom="alerta">{ROTULO_SITUACAO[detalhe.situacao]}</Badge>}
        {detalhe.parado ? (
          <Badge tom="erro">{textoParado(detalhe.diasNaEtapa)}</Badge>
        ) : (
          <span className="text-xs text-slate-500">{detalhe.diasNaEtapa} dia(s) nesta etapa</span>
        )}
        {detalhe.etiquetas.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
      {!leitura && (
        <Select
          aria-label="Mover para outra etapa"
          value=""
          disabled={ocupado}
          onChange={(e) => {
            if (e.target.value) aoMover(e.target.value);
          }}
        >
          <option value="">Mover para…</option>
          {destinos.map((c) => {
            const s = podeSoltar(detalhe.destinos[c.chave], estrutura.podeForcar);
            return (
              <option key={c.chave} value={c.chave} disabled={!s.permitido}>
                {c.nome}
                {s.aviso ? ` — ${s.permitido ? s.aviso.toLowerCase() : 'não permitido'}` : ''}
              </option>
            );
          })}
        </Select>
      )}
    </div>
  );
}

function Avisos({ detalhe, leitura, aoDescartar }: { detalhe: VinculoDetalhe; leitura: boolean; aoDescartar: () => void }) {
  if (!detalhe.avisos.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {detalhe.avisos.includes('DADOS_PENDENTES') && (
        <Alerta tipo="aviso">
          Dados pendentes: esta etapa tem requisitos sem preenchimento (registro anterior às regras). Complete os campos na aba Operação.
        </Alerta>
      )}
      {detalhe.avisos.includes('PRONTO_DESFEITO') && (
        <Alerta tipo="aviso">
          A venda já estava liberada, mas o parceiro deixou de estar pronto (TIM Vendas, chip ou treinamento). A etapa não volta sozinha.
        </Alerta>
      )}
      {detalhe.avisos.includes('SUGERE_DESCARTE') && (
        <Alerta tipo="aviso">
          <span className="flex flex-wrap items-center justify-between gap-2">
            CNPJ não apto, sem MEI nem alteração de CNAE: sugere descarte.
            {!leitura && detalhe.etapa.chave !== 'SL_DESCARTADO' && (
              <Button variante="perigo" tamanho="sm" onClick={aoDescartar}>
                Descartar por CNPJ irregular
              </Button>
            )}
          </span>
        </Alerta>
      )}
    </div>
  );
}

function AbaDados({
  detalhe,
  estrutura,
  leitura,
  salvar,
}: {
  detalhe: VinculoDetalhe;
  estrutura: EstruturaEsteira;
  leitura: boolean;
  salvar: (corpo: EditarVinculoInput) => void;
}) {
  const { usuario } = useAuth();
  const responsaveis = useResponsaveis();
  const p = detalhe.parceiro;
  const editavel = (chave: string) => !leitura && estrutura.colunas.some((c) => c.chave === chave && c.editavel);
  return (
    <div className="flex flex-col gap-5">
      <Secao titulo="Cadastro central">
        <p className="-mt-0.5 text-xs text-slate-500">Compartilhado com as outras operações; edite na ficha.</p>
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-slate-500">Contato</dt>
          <dd>
            <Link to={`/contatos/${p.contatoId}`} className="text-[var(--brand-primary)] hover:underline">
              Abrir ficha do contato
            </Link>
          </dd>
          <dt className="text-slate-500">Empresa</dt>
          <dd>
            {p.contaId ? (
              <Link to={`/clientes/${p.contaId}`} className="text-[var(--brand-primary)] hover:underline">
                {p.nome}
              </Link>
            ) : (
              <span className="text-slate-500">Sem empresa vinculada</span>
            )}
          </dd>
          <dt className="text-slate-500">CNPJ</dt>
          <dd className="tabular-nums text-slate-800">{p.cnpj ?? '—'}</dd>
          <dt className="text-slate-500">CPF</dt>
          <dd className="tabular-nums text-slate-800">{p.cpf ?? '—'}</dd>
          <dt className="text-slate-500">Telefone</dt>
          <dd className="tabular-nums text-slate-800">{p.telefone ?? '—'}</dd>
          <dt className="text-slate-500">Cidade/UF</dt>
          <dd className="text-slate-800">{[p.cidade, p.uf].filter(Boolean).join(' / ') || '—'}</dd>
        </dl>
      </Secao>

      <Secao titulo="Nesta operação">
        {editavel('responsavel') && responsaveis ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Responsável</span>
            <Select
              value={detalhe.responsavel?.id ?? ''}
              onChange={(e) => salvar({ responsavelId: e.target.value || null })}
            >
              <option value="">Sem responsável</option>
              {detalhe.responsavel && !responsaveis.some((u) => u.id === detalhe.responsavel!.id) && (
                <option value={detalhe.responsavel.id}>{detalhe.responsavel.nome}</option>
              )}
              {responsaveis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <CampoLeitura rotulo="Responsável">
            <span className="flex flex-wrap items-center gap-2">
              {detalhe.responsavel?.nome ?? 'Sem responsável'}
              {editavel('responsavel') && usuario && detalhe.responsavel?.id !== usuario.id && (
                <Button variante="neutro" tamanho="sm" onClick={() => salvar({ responsavelId: usuario.id })}>
                  Assumir
                </Button>
              )}
            </span>
          </CampoLeitura>
        )}
        <CampoTexto
          rotulo="Observações"
          valor={detalhe.observacoes}
          maximo={2000}
          multilinha
          desabilitado={!editavel('observacoes')}
          aoSalvar={(v) => salvar({ observacoes: v })}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <CampoLeitura rotulo="Situação">{ROTULO_SITUACAO[detalhe.situacao]}</CampoLeitura>
          <CampoLeitura rotulo="Entrada">{dataCurta(detalhe.criadoEm)}</CampoLeitura>
        </div>
        {detalhe.motivoSituacao && <CampoLeitura rotulo="Motivo da saída">{detalhe.motivoSituacao}</CampoLeitura>}
      </Secao>
    </div>
  );
}

/** Nomes conhecidos de usuários (a auditoria e as notas só trazem o id). */
function useNomes(detalhe: VinculoDetalhe): Map<string, string> {
  const { usuario } = useAuth();
  const responsaveis = useResponsaveis();
  return useMemo(() => {
    const nomes = new Map<string, string>();
    for (const u of responsaveis ?? []) nomes.set(u.id, u.nome);
    for (const h of detalhe.historico) if (h.usuario) nomes.set(h.usuario.id, h.usuario.nome);
    if (detalhe.responsavel) nomes.set(detalhe.responsavel.id, detalhe.responsavel.nome);
    if (usuario) nomes.set(usuario.id, usuario.nome);
    return nomes;
  }, [detalhe, responsaveis, usuario]);
}

function AbaNotas({
  detalhe,
  leitura,
  base,
  aoAtualizar,
}: {
  detalhe: VinculoDetalhe;
  leitura: boolean;
  base: string;
  aoAtualizar: (v: VinculoDetalhe) => void;
}) {
  const mostrar = useToast();
  const nomes = useNomes(detalhe);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    if (!texto.trim()) return;
    setOcupado(true);
    try {
      const r = await api.post<RespostaVinculo>(`${base}/vinculos/${detalhe.id}/notas`, { texto: texto.trim() });
      setTexto('');
      aoAtualizar(r.vinculo);
    } catch (e) {
      mostrar('erro', e instanceof ApiError ? e.message : 'Falha ao gravar a nota');
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {!leitura && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <Textarea aria-label="Nova nota" rows={3} maxLength={5000} placeholder="Escreva uma nota…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" tamanho="sm" disabled={ocupado || !texto.trim()}>
              {ocupado ? 'Gravando...' : 'Adicionar nota'}
            </Button>
          </div>
        </form>
      )}
      {detalhe.notas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma nota nesta operação.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {detalhe.notas.map((n) => (
            <li key={n.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="whitespace-pre-wrap text-[13px] text-slate-800">{n.texto}</p>
              <p className="mt-1 text-xs text-slate-500">
                {(n.autorId && nomes.get(n.autorId)) ?? 'Usuário'} · {dataHora(n.criadoEm)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AbaHistorico({ detalhe }: { detalhe: VinculoDetalhe }) {
  if (detalhe.historico.length === 0) return <p className="text-sm text-slate-500">Sem movimentos registrados.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {detalhe.historico.map((h) => (
        <li key={h.id} className="rounded-lg border border-slate-200 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tom={h.tipo === 'EXCECAO' ? 'erro' : h.tipo === 'CORRECAO' || h.tipo === 'SAIDA' ? 'alerta' : 'neutro'}>
              {ROTULO_TIPO_HISTORICO[h.tipo]}
            </Badge>
            <span className="text-[13px] font-semibold text-slate-800">
              {h.de ? `${h.de.nome} → ${h.para.nome}` : h.para.nome}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {h.usuario?.nome ?? 'Sistema'} · {dataHora(h.criadoEm)}
          </p>
          {h.motivo && (
            <p className="mt-1 text-[13px] text-slate-700">
              <span className="font-medium">{h.tipo === 'SAIDA' ? 'Motivo: ' : 'Justificativa/motivo: '}</span>
              {h.motivo}
            </p>
          )}
          {h.observacao && <p className="mt-0.5 text-[13px] text-slate-600">Obs.: {h.observacao}</p>}
        </li>
      ))}
    </ol>
  );
}

function AbaAuditoria({ detalhe, estrutura }: { detalhe: VinculoDetalhe; estrutura: EstruturaEsteira }) {
  const nomes = useNomes(detalhe);
  const grupos = useMemo(() => agruparAuditoria(detalhe.auditoria), [detalhe.auditoria]);
  const vendedores = detalhe.vendedores ?? [];
  if (grupos.length === 0) return <p className="text-sm text-slate-500">Nenhuma alteração de campo registrada.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {grupos.map((g) => (
        <li key={g.chave} className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-500">
            {(g.usuarioId && nomes.get(g.usuarioId)) ?? (g.usuarioId ? 'Usuário' : 'Sistema')} · {dataHora(g.criadoEm)}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {g.mudancas.map((m) => (
              <li key={m.id} className="text-[13px] text-slate-700">
                <span className="font-medium">{rotuloDoCampoAuditado(m.campo, estrutura.colunas, vendedores)}:</span>{' '}
                {formatarValorAuditado(m.campo, m.de, estrutura.colunas, nomes)} → {formatarValorAuditado(m.campo, m.para, estrutura.colunas, nomes)}
              </li>
            ))}
          </ul>
          {g.justificativa && (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[13px] text-amber-700">
              <span className="font-semibold">Justificativa:</span> {g.justificativa}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
