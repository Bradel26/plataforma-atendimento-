import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../components/ui';
import { Tabs } from '../components/ui/Tabs';
import { StatTile } from '../components/viz/StatTile';
import { MontarPublico } from './campanhas/MontarPublico';
import { LeadsTab } from './crm/LeadsTab';
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
  { chave: 'campanhas', rotulo: 'Campanhas' },
  { chave: 'leads', rotulo: 'Leads' },
] as const;
type SubAba = (typeof SUBABAS)[number]['chave'];

export function CampanhasPage() {
  // Disparar/gerenciar campanha e ADMIN/SUPERVISOR (ver `campanhasRoutes` na
  // API); GESTOR/COMERCIAL so tem acesso a Leads nesta pagina — sem este
  // corte, os dois pousariam na sub-aba Campanhas e o `GET /campanhas` inicial
  // devolveria 403 antes de a pessoa sequer ver a aba Leads.
  const { temPerfil } = useAuth();
  const podeVerCampanhas = temPerfil('ADMIN', 'SUPERVISOR');
  const subAbasVisiveis = SUBABAS.filter((s) => s.chave !== 'campanhas' || podeVerCampanhas);

  const [subAba, setSubAba] = useState<SubAba>(podeVerCampanhas ? 'campanhas' : 'leads');
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [nova, setNova] = useState({ nome: '', canal: 'WHATSAPP' as Canal, mensagem: '' });
  const [agendarPara, setAgendarPara] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { campanhas: lista } = await api.get<{ campanhas: Campanha[] }>('/campanhas');
      setCampanhas(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar campanhas');
    }
  }, []);

  useEffect(() => {
    if (podeVerCampanhas) void carregar();
  }, [carregar, podeVerCampanhas]);

  const abrir = useCallback(async (id: string) => {
    try {
      setAberta(await api.get<Aberta>(`/campanhas/${id}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir a campanha');
    }
  }, []);

  /**
   * O disparo so enfileira: o envio acontece no worker. Enquanto houver item
   * pendente, a tela se atualiza sozinha — sem isso o usuario ficaria olhando
   * uma lista congelada sem saber se a fila andou.
   */
  useEffect(() => {
    if (!aberta || aberta.campanha.status !== 'ATIVA') return;
    if (!aberta.itens.some((i) => i.status === 'PENDENTE')) return;

    const t = setTimeout(() => void abrir(aberta.campanha.id), 3000);
    return () => clearTimeout(t);
  }, [aberta, abrir]);

  const agir = async (acao: () => Promise<unknown>, idParaReabrir?: string) => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await acao();
      await carregar();
      if (idParaReabrir) await abrir(idParaReabrir);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha na operação');
    } finally {
      setOcupado(false);
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    await agir(async () => {
      const { campanha } = await api.post<{ campanha: Campanha }>('/campanhas', nova);
      setNova({ nome: '', canal: 'WHATSAPP', mensagem: '' });
      await abrir(campanha.id);
    });
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

  return (
    <div className="space-y-5">
      <Tabs itens={subAbasVisiveis} ativo={subAba} aoSelecionar={(chave) => setSubAba(chave as SubAba)} />

      {subAba === 'leads' && <LeadsTab />}

      {subAba === 'campanhas' && (
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="space-y-5">
            <Card titulo="Campanhas" descricao={`${campanhas.length} cadastrada(s)`}>
              {erro && !aberta && (
                <div className="mb-3">
                  <Alerta>{erro}</Alerta>
                </div>
              )}
              {campanhas.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma campanha criada.</p>
              ) : (
                <div className="space-y-4">
                  {GRUPOS.map((g) => {
                    const lista = campanhas.filter((x) => grupoDa(x) === g.id);
                    if (lista.length === 0) return null;
                    return (
                      <div key={g.id}>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {g.titulo} ({lista.length})
                        </p>
                        <ul className="divide-y divide-slate-100">
                          {lista.map((x) => (
                            <li key={x.id}>
                              <button
                                type="button"
                                onClick={() => void abrir(x.id)}
                                className={`w-full py-2.5 text-left transition hover:bg-slate-50 ${
                                  c?.id === x.id ? 'bg-slate-50' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-sm font-medium text-slate-800">{x.nome}</span>
                                  <Badge
                                    tom={x.status === 'ATIVA' ? 'sucesso' : x.status === 'CONCLUIDA' ? 'neutro' : 'alerta'}
                                  >
                                    {LABEL_CAMPANHA_STATUS[x.status]}
                                  </Badge>
                                </div>
                                <p className="text-xs text-slate-500">
                                  {x.canal} · {x.total} parceiro(s) · {x.contagens.ENVIADO} enviada(s)
                                  {x.agendadaPara ? ` · agendada ${dataHora(x.agendadaPara)}` : ''}
                                </p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
    
            <Card titulo="Nova campanha" descricao="Depois de criar, escolha o público e programe o envio">
              <form onSubmit={criar} className="space-y-3">
                <Field label="Nome da campanha">
                  <Input
                    required
                    placeholder="Credenciamento Starlink — Para"
                    value={nova.nome}
                    onChange={(e) => setNova({ ...nova, nome: e.target.value })}
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
                {nova.mensagem.trim() && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">Pré-visualização</p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm text-slate-800">
                      {previa(nova.mensagem)}
                    </p>
                  </div>
                )}
                <Button type="submit" disabled={ocupado} className="w-full">
                  Criar campanha
                </Button>
              </form>
            </Card>
          </div>
    
          {aberta && c ? (
            <div className="space-y-5">
              <Card
                titulo={c.nome}
                descricao={`${c.canal} · criada em ${new Date(c.criadoEm).toLocaleDateString('pt-BR')}${
                  c.agendadaPara ? ` · envio programado para ${dataHora(c.agendadaPara)}` : ''
                }`}
                acao={
                  <Badge tom={c.status === 'ATIVA' ? 'sucesso' : 'neutro'}>{LABEL_CAMPANHA_STATUS[c.status]}</Badge>
                }
              >
                {erro && (
                  <div className="mb-3">
                    <Alerta>{erro}</Alerta>
                  </div>
                )}
                {aviso && (
                  <div className="mb-3">
                    <Alerta tipo="sucesso">{aviso}</Alerta>
                  </div>
                )}
    
                <p className="text-xs font-medium text-slate-500">Pré-visualização da mensagem</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm text-slate-800">
                  {previa(c.mensagem)}
                </p>
    
                {c.status !== 'CONCLUIDA' && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={ocupado || c.total === 0} onClick={() => void enviarAgora(c)}>
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
                        variante="neutro"
                        disabled={ocupado}
                        onClick={() => {
                          if (!window.confirm('Cancelar a campanha? O que ainda não saiu não será enviado.')) return;
                          void agir(() => api.post(`/campanhas/${c.id}/cancelar`), c.id);
                        }}
                      >
                        Cancelar campanha
                      </Button>
                    </div>
    
                    {c.status !== 'ATIVA' && (
                      <div className="flex flex-wrap items-end gap-2">
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
                      </div>
                    )}
                    {c.total === 0 && (
                      <p className="text-xs text-slate-500">Escolha o público abaixo antes de enviar ou agendar.</p>
                    )}
                  </div>
                )}
              </Card>
    
              <Card titulo="Resultado da campanha" descricao={`${c.total} parceiro(s) no público`}>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <StatTile rotulo="Enviadas" valor={c.contagens.ENVIADO} estado={c.contagens.ENVIADO ? ESTADO.bom : undefined} />
                  <StatTile rotulo="Na fila" valor={c.contagens.PENDENTE} />
                  <StatTile
                    rotulo="Não entregues"
                    valor={c.contagens.IGNORADO}
                    detalhe="sem telefone ou cancelada"
                    estado={c.contagens.IGNORADO ? ESTADO.atencao : undefined}
                  />
                  <StatTile
                    rotulo="Falhas"
                    valor={c.contagens.FALHOU}
                    estado={c.contagens.FALHOU ? ESTADO.grave : undefined}
                  />
                  <StatTile rotulo="Respostas recebidas" valor={aberta.resultado?.respostasRecebidas ?? '—'} />
                  <StatTile rotulo="Parceiros que interagiram" valor={aberta.resultado?.parceirosQueInteragiram ?? '—'} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Respostas contam mensagens do parceiro depois do envio, em qualquer conversa dele.
                </p>
              </Card>
    
              {c.status !== 'CONCLUIDA' && (
                <MontarPublico campanhaId={c.id} canal={c.canal} aoAplicar={() => void abrir(c.id)} />
              )}
    
              <Card titulo="Parceiros da campanha" descricao="Primeiros 200">
                {aberta.itens.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum parceiro na campanha.</p>
                ) : (
                  <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                    {aberta.itens.map((i) => (
                      <li key={i.id} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-slate-800">{i.contato.nome}</span>
                          <Badge tom={i.status === 'ENVIADO' ? 'sucesso' : i.status === 'FALHOU' ? 'alerta' : 'neutro'}>
                            {LABEL_ITEM_STATUS[i.status]}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">{i.contato.telefone ?? 'sem telefone'}</p>
                        {i.erro && <p className="mt-0.5 text-xs text-red-600">{i.erro}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : (
            <Card titulo="Detalhe da campanha">
              <p className="text-sm text-slate-500">
                Selecione uma campanha para escolher o público, programar o envio e acompanhar o resultado.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
