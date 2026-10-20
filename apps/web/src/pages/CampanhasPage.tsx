import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Field, Input, Select } from '../components/ui';
import { Modal } from '../components/ui/Modal';
import { Segmentado, iniciais } from '../components/ui/Pagina';
import { useSearchParams } from 'react-router-dom';
import { MontarPublico } from './campanhas/MontarPublico';
import { CAMPANHAS_DEMO, ITENS_DEMO, RESULTADO_DEMO } from './campanhas/dadosDemo';
import { LeadsTab } from './crm/LeadsTab';
import { CampanhasParceirosTab } from './campanhas/CampanhasParceirosTab';
import { BarraEmpilhada } from './dashboard/blocos';
import { useAuth } from '../features/auth/AuthProvider';
import { ApiError, api } from '../lib/api';
import { ESTADO } from '../lib/viz';
import {
  LABEL_CAMPANHA_STATUS,
  LABEL_ITEM_STATUS,
  type Campanha,
  type CampanhaItem,
  type Canal,
} from '../lib/types';

const CANAIS: Array<{ valor: Canal; label: string }> = [
  { valor: 'WHATSAPP', label: 'WhatsApp' },
  { valor: 'INSTAGRAM', label: 'Instagram' },
  { valor: 'FACEBOOK', label: 'Facebook' },
  { valor: 'VOZ', label: 'Voz (exige telefonia)' },
];
const NOME_CANAL: Partial<Record<Canal, string>> = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', VOZ: 'Voz', EMAIL: 'E-mail' };
const nomeCanal = (c: Canal) => NOME_CANAL[c] ?? c;

const ACEITOS = '.jpg,.jpeg,.png,.webp,.gif,.mp3,.ogg,.opus,.m4a,.aac,.weba,.mp4,.webm,.pdf,.doc,.docx,.xls,.xlsx,.zip,.csv,.txt';

// So tons que o tema escuro remapeia (index.css).
const CLASSE_STATUS: Record<Campanha['status'], string> = {
  ATIVA: 'bg-emerald-50 text-emerald-700',
  PAUSADA: 'bg-amber-50 text-amber-700',
  RASCUNHO: 'bg-slate-100 text-slate-600',
  CONCLUIDA: 'bg-slate-100 text-slate-600',
};
const CLASSE_ITEM: Partial<Record<CampanhaItem['status'], string>> = {
  ENVIADO: 'bg-emerald-50 text-emerald-700',
  FALHOU: 'bg-red-50 text-red-700',
  IGNORADO: 'bg-amber-50 text-amber-700',
};

type Resultado = { parceirosQueInteragiram: number; respostasRecebidas: number };
type Aberta = { campanha: Campanha; itens: CampanhaItem[]; resultado?: Resultado };

/** Mesma substituicao do servidor (`renderizar`), com um parceiro de exemplo. */
const previa = (mensagem: string) =>
  mensagem
    .replace(/\{\{\s*nome\s*\}\}/gi, 'João Silva')
    .replace(/\{\{\s*email\s*\}\}/gi, 'joao@empresa.com.br')
    .replace(/\{\{\s*telefone\s*\}\}/gi, '(91) 98888-7777');

/** Em andamento / agendadas / concluidas — o agrupamento pedido no documento. */
function grupoDa(c: Campanha): 'andamento' | 'agendada' | 'concluida' | 'rascunho' {
  if (c.status === 'CONCLUIDA') return 'concluida';
  if (c.agendadaPara) return 'agendada';
  if (c.status === 'ATIVA' || c.status === 'PAUSADA') return 'andamento';
  return 'rascunho';
}

const GRUPOS = [
  { id: 'andamento', titulo: 'Em andamento' },
  { id: 'agendada', titulo: 'Agendadas' },
  { id: 'rascunho', titulo: 'Rascunhos' },
  { id: 'concluida', titulo: 'Concluídas' },
] as const;

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** `datetime-local` quer "AAAA-MM-DDTHH:MM" no fuso do navegador. */
const paraCampoLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Leads mudou do CRM para ca: mesmo funil de captacao que as campanhas alimentam. */
const SUBABAS = [
  { chave: 'campanhas', rotulo: 'Comunicados de marketing' },
  { chave: 'parceiros', rotulo: 'Campanhas para parceiros' },
  { chave: 'leads', rotulo: 'Leads' },
] as const;
type SubAba = (typeof SUBABAS)[number]['chave'];

/** A mensagem como o parceiro a recebe: balao de conversa com as variaveis trocadas. */
function Previa({ mensagem, canal }: { mensagem: string; canal: Canal }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-slate-100 p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Prévia no {nomeCanal(canal)}</p>
      <p className="max-w-[300px] self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-emerald-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800 shadow-sm">
        {previa(mensagem)}
      </p>
      <span className="text-[11.5px] text-slate-500">Variáveis preenchidas com um parceiro de exemplo</span>
    </div>
  );
}

export function CampanhasPage() {
  // Disparar/gerenciar campanha e ADMIN/SUPERVISOR (ver `campanhasRoutes` na
  // API); GESTOR/COMERCIAL so tem acesso a Leads nesta pagina — sem este
  // corte, os dois pousariam na sub-aba Campanhas e o `GET /campanhas` inicial
  // devolveria 403 antes de a pessoa sequer ver a aba Leads.
  const { temPerfil } = useAuth();
  const podeVerCampanhas = temPerfil('ADMIN', 'SUPERVISOR');
  const podeGerirCampanhasParceiros = temPerfil('ADMIN');
  // Dados ficticios para conferir o layout; nao chama a API nem grava nada. Ligado
  // por `?demo=1` e, no `npm run dev`, por padrao (`?demo=0` mostra as campanhas reais).
  // O build de producao so os mostra com `?demo=1`.
  const demoParam = useSearchParams()[0].get('demo');
  const demo = demoParam === '1' || (import.meta.env.DEV && demoParam !== '0');
  const subAbasVisiveis = SUBABAS.filter((s) =>
    s.chave === 'campanhas' ? podeVerCampanhas : s.chave === 'parceiros' ? podeGerirCampanhasParceiros : true,
  );

  const [subAba, setSubAba] = useState<SubAba>(podeVerCampanhas ? 'campanhas' : 'leads');
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ nome: '', assunto: '', canal: 'WHATSAPP' as Canal, mensagem: '' });
  const [arquivosNovos, setArquivosNovos] = useState<File[]>([]);
  const [edicao, setEdicao] = useState({ nome: '', assunto: '', mensagem: '' });
  const [agendarPara, setAgendarPara] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (demo) {
      setCampanhas(CAMPANHAS_DEMO);
      return;
    }
    try {
      const { campanhas: lista } = await api.get<{ campanhas: Campanha[] }>('/campanhas');
      setCampanhas(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar campanhas');
    }
  }, [demo]);

  useEffect(() => {
    if (podeVerCampanhas) void carregar();
  }, [carregar, podeVerCampanhas]);

  const abrir = useCallback(async (id: string) => {
    if (demo) {
      const campanha = CAMPANHAS_DEMO.find((x) => x.id === id);
      if (campanha) setAberta({ campanha, itens: campanha.total > 0 ? ITENS_DEMO : [], resultado: RESULTADO_DEMO });
      return;
    }
    try {
      setAberta(await api.get<Aberta>(`/campanhas/${id}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir a campanha');
    }
  }, [demo]);

  /**
   * O disparo so enfileira: o envio acontece no worker. Enquanto houver item
   * pendente, a tela se atualiza sozinha — sem isso o usuario ficaria olhando
   * uma lista congelada sem saber se a fila andou.
   */
  useEffect(() => {
    if (demo || !aberta || aberta.campanha.status !== 'ATIVA') return;
    if (!aberta.itens.some((i) => i.status === 'PENDENTE')) return;

    const t = setTimeout(() => void abrir(aberta.campanha.id), 3000);
    return () => clearTimeout(t);
  }, [aberta, abrir, demo]);

  /** Devolve `true` quando a acao foi feita (no modo demonstracao nada e feito). */
  const agir = async (acao: () => Promise<unknown>, idParaReabrir?: string) => {
    setErro(null);
    setAviso(null);
    if (demo) {
      setAviso('Modo demonstração: nada é gravado.');
      return false;
    }
    setOcupado(true);
    try {
      await acao();
      await carregar();
      if (idParaReabrir) await abrir(idParaReabrir);
      return true;
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha na operação');
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    const feito = await agir(async () => {
      const { campanha } = await api.post<{ campanha: Campanha }>('/campanhas', { ...nova, assunto: nova.assunto || null });
      for (const arquivo of arquivosNovos) {
        await api.upload(`/campanhas/${campanha.id}/anexos`, arquivo);
      }
      setArquivosNovos([]);
      setNova({ nome: '', assunto: '', canal: 'WHATSAPP', mensagem: '' });
      await abrir(campanha.id);
    });
    if (feito) setNovaAberta(false);
  };

  /** "Enviar agora" = ativar + disparar, os mesmos dois passos de antes. */
  const enviarAgora = (c: Campanha) =>
    agir(async () => {
      if (c.agendadaPara) await api.patch(`/campanhas/${c.id}/agendamento`, { agendadaPara: null });
      if (c.status !== 'ATIVA') await api.patch(`/campanhas/${c.id}/status`, { status: 'ATIVA' });
      const r = await api.post<{ resultado: { enfileirados: number; foraDoLote: number } }>(
        `/campanhas/${c.id}/disparar`,
        { limite: 500 },
      );
      setAviso(
        `${r.resultado.enfileirados} envio(s) na fila.` +
          (r.resultado.foraDoLote > 0 ? ` ${r.resultado.foraDoLote} fora deste lote — envie de novo depois.` : ''),
      );
    }, c.id);

  const c = aberta?.campanha;
  const pendentes = c?.contagens.PENDENTE ?? 0;

  useEffect(() => {
    if (c) setEdicao({ nome: c.nome, assunto: c.assunto ?? '', mensagem: c.mensagem });
  }, [c?.id, c?.nome, c?.assunto, c?.mensagem]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado
          papel="tab"
          rotulo="Seções de campanhas"
          opcoes={subAbasVisiveis.map((s) => ({ valor: s.chave, rotulo: s.rotulo }))}
          valor={subAba}
          aoMudar={(v) => setSubAba(v)}
        />
        {subAba === 'campanhas' && (
          <Button onClick={() => { setErro(null); setAviso(null); setNovaAberta(true); }}>+ Nova campanha</Button>
        )}
      </div>

      {subAba === 'leads' && <LeadsTab />}
      {subAba === 'parceiros' && podeGerirCampanhasParceiros && <CampanhasParceirosTab />}

      {subAba === 'campanhas' && (
        <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="lista-campanhas">
            <div className="flex items-baseline gap-2 border-b border-slate-100 px-4 py-3.5">
              <h2 id="lista-campanhas" className="text-[15px] font-bold text-slate-900">Campanhas</h2>
              <span className="text-[12.5px] tabular-nums text-slate-500">{campanhas.length} cadastrada(s)</span>
            </div>
            <div className="flex flex-col gap-4 p-2.5">
              {erro && !aberta && <Alerta>{erro}</Alerta>}
              {campanhas.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">Nenhuma campanha criada.</p>
              ) : (
                GRUPOS.map((g) => {
                  const lista = campanhas.filter((x) => grupoDa(x) === g.id);
                  if (lista.length === 0) return null;
                  return (
                    <div key={g.id} className="flex flex-col gap-1.5">
                      <p className="px-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        {g.titulo} · {lista.length}
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {lista.map((x) => {
                          const selecionada = c?.id === x.id;
                          const pct = x.total ? Math.round((x.contagens.ENVIADO / x.total) * 100) : 0;
                          return (
                            <li key={x.id}>
                              <button
                                type="button"
                                aria-current={selecionada ? 'true' : undefined}
                                onClick={() => void abrir(x.id)}
                                className={`flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition ${
                                  selecionada ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-slate-900">{x.nome}</span>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${CLASSE_STATUS[x.status]}`}>
                                    {LABEL_CAMPANHA_STATUS[x.status]}
                                  </span>
                                </span>
                                <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ESTADO.bom }} />
                                </span>
                                <span className="text-xs tabular-nums text-slate-500">
                                  {nomeCanal(x.canal)} · {x.contagens.ENVIADO} de {x.total} enviada(s)
                                  {x.agendadaPara ? ` · agendada ${dataHora(x.agendadaPara)}` : ''}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {aberta && c ? (
            <div className="flex min-w-0 flex-col gap-4">
              <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4" aria-labelledby="campanha-aberta">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 id="campanha-aberta" className="text-xl font-bold tracking-[-0.01em] text-slate-900">{c.nome}</h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CLASSE_STATUS[c.status]}`}>{LABEL_CAMPANHA_STATUS[c.status]}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] tabular-nums text-slate-500">
                      {nomeCanal(c.canal)} · criada em {new Date(c.criadoEm).toLocaleDateString('pt-BR')} · {c.total} parceiro(s) no público
                      {c.agendadaPara ? ` · envio programado para ${dataHora(c.agendadaPara)}` : ''}
                    </p>
                  </div>
                  {c.status !== 'CONCLUIDA' && (
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={ocupado || c.total === 0} onClick={() => void enviarAgora(c)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m22 2-7 20-4-9-9-4z" />
                          <path d="M22 2 11 13" />
                        </svg>
                        Enviar agora{pendentes > 0 ? ` (${pendentes})` : ''}
                      </Button>
                      {c.status === 'ATIVA' && (
                        <Button
                          variante="neutro"
                          disabled={ocupado}
                          onClick={() =>
                            void agir(() => api.patch(`/campanhas/${c.id}/status`, { status: 'PAUSADA' }), c.id)
                          }
                        >
                          Pausar
                        </Button>
                      )}
                      {c.contagens.FALHOU + c.contagens.IGNORADO > 0 && (
                        <Button
                          variante="neutro"
                          disabled={ocupado}
                          onClick={() => void agir(() => api.post(`/campanhas/${c.id}/reprocessar`), c.id)}
                        >
                          Reprocessar falhas
                        </Button>
                      )}
                      <Button
                        variante="perigo"
                        disabled={ocupado}
                        onClick={() => {
                          if (!window.confirm('Cancelar a campanha? O que ainda não saiu não será enviado.')) return;
                          void agir(() => api.post(`/campanhas/${c.id}/cancelar`), c.id);
                        }}
                      >
                        Cancelar campanha
                      </Button>
                    </div>
                  )}
                </div>

                {erro && <Alerta>{erro}</Alerta>}
                {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

                {c.status !== 'CONCLUIDA' && c.status !== 'ATIVA' && (
                  <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
                    <Field label="Programar envio">
                      <Input
                        type="datetime-local"
                        min={paraCampoLocal(new Date())}
                        value={agendarPara}
                        onChange={(e) => setAgendarPara(e.target.value)}
                      />
                    </Field>
                    <Button
                      variante="neutro"
                      disabled={ocupado || !agendarPara || c.total === 0}
                      onClick={() =>
                        void agir(async () => {
                          await api.patch(`/campanhas/${c.id}/agendamento`, {
                            agendadaPara: new Date(agendarPara).toISOString(),
                          });
                          setAgendarPara('');
                        }, c.id)
                      }
                    >
                      Agendar
                    </Button>
                    {c.agendadaPara && (
                      <Button
                        variante="neutro"
                        disabled={ocupado}
                        onClick={() =>
                          void agir(() => api.patch(`/campanhas/${c.id}/agendamento`, { agendadaPara: null }), c.id)
                        }
                      >
                        Desfazer agendamento
                      </Button>
                    )}
                    {c.total === 0 && (
                      <p className="basis-full text-xs text-slate-500">Escolha o público abaixo antes de enviar ou agendar.</p>
                    )}
                  </div>
                )}

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-slate-500">Resultado do envio</p>
                    <BarraEmpilhada
                      rotuloAcessivel={`Enviadas ${c.contagens.ENVIADO}, na fila ${c.contagens.PENDENTE}, não entregues ${c.contagens.IGNORADO}, falhas ${c.contagens.FALHOU}`}
                      partes={[
                        { rotulo: 'Enviadas', valor: c.contagens.ENVIADO, cor: ESTADO.bom },
                        { rotulo: 'Na fila', valor: c.contagens.PENDENTE, cor: ESTADO.info },
                        { rotulo: 'Não entregues', valor: c.contagens.IGNORADO, cor: ESTADO.atencao },
                        { rotulo: 'Falhas', valor: c.contagens.FALHOU, cor: ESTADO.grave },
                      ]}
                    />
                    <p className="text-xs text-slate-500">&ldquo;Não entregues&rdquo; são os sem telefone ou cancelados.</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-blue-50 px-3.5 py-3">
                        <span className="block text-[22px] font-bold tabular-nums text-blue-700">{aberta.resultado?.respostasRecebidas ?? '—'}</span>
                        <span className="text-[12.5px] text-slate-700">respostas recebidas</span>
                      </div>
                      <div className="rounded-xl bg-blue-50 px-3.5 py-3">
                        <span className="block text-[22px] font-bold tabular-nums text-blue-700">{aberta.resultado?.parceirosQueInteragiram ?? '—'}</span>
                        <span className="text-[12.5px] text-slate-700">parceiros interagiram</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Respostas contam mensagens do parceiro depois do envio, em qualquer conversa dele.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Previa mensagem={c.mensagem} canal={c.canal} />
                    {c.anexos && c.anexos.length > 0 && (
                      <div className="rounded-xl border border-slate-200 p-3">
                        <p className="mb-2 text-xs font-semibold text-slate-600">Materiais anexados</p>
                        <ul className="flex flex-col gap-1 text-sm">
                          {c.anexos.map((anexo) => (
                            <li key={anexo.id} className="flex items-center justify-between gap-2">
                              <a className="truncate text-blue-700 underline" href={anexo.url} target="_blank" rel="noreferrer">{anexo.nome}</a>
                              {c.status === 'RASCUNHO' && (
                                <button type="button" className="shrink-0 text-xs font-semibold text-red-600" disabled={ocupado} onClick={() => void agir(() => api.del(`/campanhas/${c.id}/anexos/${anexo.id}`), c.id)}>
                                  Remover
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {c.status === 'RASCUNHO' && (
                  <details className="group rounded-xl border border-slate-200">
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700">
                      Editar comunicado e materiais
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-slate-100 p-4">
                      <Field label="Nome"><Input value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} /></Field>
                      <Field label="Assunto (opcional)"><Input maxLength={180} value={edicao.assunto} onChange={(e) => setEdicao({ ...edicao, assunto: e.target.value })} /></Field>
                      <Field label="Mensagem"><textarea rows={4} value={edicao.mensagem} onChange={(e) => setEdicao({ ...edicao, mensagem: e.target.value })} className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]" /></Field>
                      <div>
                        <Button variante="neutro" disabled={ocupado || !edicao.nome.trim() || !edicao.mensagem.trim()} onClick={() => void agir(() => api.patch(`/campanhas/${c.id}`, { nome: edicao.nome, assunto: edicao.assunto || null, mensagem: edicao.mensagem }), c.id)}>Salvar edição</Button>
                      </div>
                      <Field label="Adicionar materiais" hint="Os destinatários recebem links seguros para baixar.">
                        <input type="file" multiple accept={ACEITOS} onChange={(e) => {
                          const selecionados = Array.from(e.target.files ?? []);
                          e.target.value = '';
                          if (!selecionados.length) return;
                          void agir(async () => {
                            for (const arquivo of selecionados) await api.upload(`/campanhas/${c.id}/anexos`, arquivo);
                          }, c.id);
                        }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2" />
                      </Field>
                    </div>
                  </details>
                )}
              </section>

              <div className="grid items-start gap-4 2xl:grid-cols-2">
                {c.status !== 'CONCLUIDA' && (
                  <MontarPublico campanhaId={c.id} canal={c.canal} aoAplicar={() => void abrir(c.id)} />
                )}

                <section className="min-w-0 rounded-2xl border border-slate-200 bg-white" aria-labelledby="itens-campanha">
                  <div className="flex items-baseline gap-2 px-5 py-4">
                    <h3 id="itens-campanha" className="text-[15px] font-bold text-slate-900">Parceiros da campanha</h3>
                    <span className="text-[12.5px] text-slate-500">primeiros 200</span>
                  </div>
                  {aberta.itens.length === 0 ? (
                    <p className="px-5 pb-5 text-sm text-slate-500">Nenhum parceiro na campanha.</p>
                  ) : (
                    <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto px-5 pb-3">
                      {aberta.itens.map((i) => (
                        <li key={i.id} className="flex items-center gap-2.5 py-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600" aria-hidden="true">
                            {iniciais(i.contato.nome)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-slate-800">{i.contato.nome}</span>
                            <span className={`block truncate text-xs tabular-nums ${i.erro ? 'text-red-600' : 'text-slate-500'}`}>
                              {i.erro ?? i.contato.telefone ?? 'sem telefone'}
                            </span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${CLASSE_ITEM[i.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {LABEL_ITEM_STATUS[i.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
              <p className="text-sm font-semibold text-slate-700">Nenhuma campanha selecionada</p>
              <p className="max-w-sm text-[13px] text-slate-500">
                Selecione uma campanha para escolher o público, programar o envio e acompanhar o resultado.
              </p>
            </div>
          )}
        </div>
      )}

      <Modal
        aberto={novaAberta}
        titulo="Nova campanha"
        aoFechar={() => setNovaAberta(false)}
        largura="max-w-2xl"
      >
        <form id="form-nova-campanha" onSubmit={criar} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">Depois de criar, escolha o público e programe o envio.</p>
            {erro ? <Alerta>{erro}</Alerta> : aviso ? <Alerta tipo="sucesso">{aviso}</Alerta> : null}
            <Field label="Nome da campanha">
              <Input
                required
                placeholder="Credenciamento Starlink — Pará"
                value={nova.nome}
                onChange={(e) => setNova({ ...nova, nome: e.target.value })}
              />
            </Field>
            <Field label="Assunto (opcional)" hint="Usado em comunicados por e-mail; os demais canais enviam a mensagem abaixo">
              <Input
                maxLength={180}
                value={nova.assunto}
                onChange={(e) => setNova({ ...nova, assunto: e.target.value })}
                placeholder="Novidades e condições deste mês"
              />
            </Field>
            <Field label="Canal">
              <Select value={nova.canal} onChange={(e) => setNova({ ...nova, canal: e.target.value as Canal })}>
                {CANAIS.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Mensagem" hint="Use {{nome}}, {{email}} ou {{telefone}} para personalizar">
              <textarea
                required
                rows={4}
                value={nova.mensagem}
                onChange={(e) => setNova({ ...nova, mensagem: e.target.value })}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
              />
            </Field>
            <Field label="Anexos" hint="Até 20 MB por arquivo. Os destinatários receberão links seguros para baixar os materiais.">
              <input
                type="file"
                multiple
                accept={ACEITOS}
                onChange={(e) => setArquivosNovos(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2"
              />
            </Field>
            {arquivosNovos.length > 0 && <p className="-mt-2 text-xs text-slate-500">{arquivosNovos.map((f) => f.name).join(' · ')}</p>}
          </div>
          <div className="flex flex-col gap-3">
            {nova.mensagem.trim() ? (
              <Previa mensagem={nova.mensagem} canal={nova.canal} />
            ) : (
              <div className="rounded-xl bg-slate-100 p-3.5 text-[12.5px] text-slate-500">A prévia aparece aqui quando você escrever a mensagem.</div>
            )}
            <Button type="submit" disabled={ocupado} className="mt-auto w-full">
              Criar campanha
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
