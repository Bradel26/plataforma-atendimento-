import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../components/ui';
import { BarList } from '../components/viz/BarList';
import { ApiError, api } from '../lib/api';
import { ESTADO, SERIES } from '../lib/viz';
import {
  LABEL_CAMPANHA_STATUS,
  LABEL_ITEM_STATUS,
  type Campanha,
  type CampanhaItem,
  type Canal,
  type Contato,
} from '../lib/types';

const CANAIS: Array<{ valor: Canal; label: string }> = [
  { valor: 'WHATSAPP', label: 'WhatsApp' },
  { valor: 'INSTAGRAM', label: 'Instagram' },
  { valor: 'FACEBOOK', label: 'Facebook' },
  { valor: 'VOZ', label: 'Voz (exige telefonia)' },
];

const COR_ITEM: Record<string, string> = {
  ENVIADO: ESTADO.bom,
  PENDENTE: SERIES[0],
  FALHOU: ESTADO.grave,
  IGNORADO: ESTADO.neutro,
  RESPONDIDO: SERIES[2],
};

export function CampanhasPage() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [aberta, setAberta] = useState<{ campanha: Campanha; itens: CampanhaItem[] } | null>(null);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [nova, setNova] = useState({ nome: '', canal: 'WHATSAPP' as Canal, mensagem: '' });
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
    void carregar();
    void api
      .get<{ contatos: Contato[] }>('/contatos?limite=100')
      .then(({ contatos: c }) => setContatos(c))
      .catch(() => undefined);
  }, [carregar]);

  const abrir = useCallback(async (id: string) => {
    try {
      setAberta(await api.get<{ campanha: Campanha; itens: CampanhaItem[] }>(`/campanhas/${id}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir a campanha');
    }
  }, []);

  /**
   * O disparo agora so enfileira: o envio acontece no worker. Enquanto houver
   * item pendente, a tela se atualiza sozinha — sem isso o usuario ficaria
   * olhando uma lista congelada sem saber se a fila andou.
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
      setErro(e instanceof ApiError ? e.message : 'Falha na operacao');
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

  const itensDoGrafico = aberta
    ? Object.entries(aberta.campanha.contagens)
        .filter(([, valor]) => valor > 0)
        .map(([status, valor]) => ({
          rotulo: LABEL_ITEM_STATUS[status as keyof typeof LABEL_ITEM_STATUS],
          valor,
          cor: COR_ITEM[status],
        }))
    : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="space-y-5">
        <Card titulo="Campanhas" descricao={`${campanhas.length} cadastrada(s)`}>
          {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}
          {aviso && <div className="mb-3"><Alerta tipo="sucesso">{aviso}</Alerta></div>}
          {campanhas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma campanha criada.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {campanhas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void abrir(c.id)}
                    className={`w-full py-2.5 text-left transition hover:bg-slate-50 ${
                      aberta?.campanha.id === c.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{c.nome}</span>
                      <Badge tom={c.status === 'ATIVA' ? 'sucesso' : c.status === 'CONCLUIDA' ? 'neutro' : 'alerta'}>
                        {LABEL_CAMPANHA_STATUS[c.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {c.canal} · {c.total} contato(s) · {c.contagens.ENVIADO} enviado(s)
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Nova campanha">
          <form onSubmit={criar} className="space-y-3">
            <Field label="Nome">
              <Input required value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
            </Field>
            <Field label="Canal">
              <Select value={nova.canal} onChange={(e) => setNova({ ...nova, canal: e.target.value as Canal })}>
                {CANAIS.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Mensagem" hint="Use as marcas de nome, email ou telefone entre chaves duplas">
              <textarea
                required
                rows={3}
                value={nova.mensagem}
                onChange={(e) => setNova({ ...nova, mensagem: e.target.value })}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
              />
            </Field>
            <Button type="submit" disabled={ocupado} className="w-full">Criar campanha</Button>
          </form>
        </Card>
      </div>

      {aberta ? (
        <div className="space-y-5">
          <Card
            titulo={aberta.campanha.nome}
            descricao={`${aberta.campanha.canal} · criada em ${new Date(aberta.campanha.criadoEm).toLocaleDateString('pt-BR')}`}
            acao={
              <Badge tom={aberta.campanha.status === 'ATIVA' ? 'sucesso' : 'neutro'}>
                {LABEL_CAMPANHA_STATUS[aberta.campanha.status]}
              </Badge>
            }
          >
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{aberta.campanha.mensagem}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variante="neutro"
                disabled={ocupado || contatos.length === 0}
                onClick={() =>
                  void agir(
                    () =>
                      api.post(`/campanhas/${aberta.campanha.id}/contatos`, {
                        contatoIds: contatos.map((c) => c.id),
                      }),
                    aberta.campanha.id,
                  )
                }
              >
                Adicionar todos os contatos ({contatos.length})
              </Button>

              {aberta.campanha.status !== 'ATIVA' ? (
                <Button
                  disabled={ocupado}
                  onClick={() =>
                    void agir(
                      () => api.patch(`/campanhas/${aberta.campanha.id}/status`, { status: 'ATIVA' }),
                      aberta.campanha.id,
                    )
                  }
                >
                  Ativar
                </Button>
              ) : (
                <>
                  <Button
                    disabled={ocupado}
                    onClick={() =>
                      void agir(
                        async () => {
                          const r = await api.post<{ enfileirados: number; foraDoLote: number }>(
                            `/campanhas/${aberta.campanha.id}/disparar`,
                            { limite: 500 },
                          );
                          setAviso(
                            `${r.enfileirados} envio(s) na fila.` +
                              (r.foraDoLote > 0 ? ` ${r.foraDoLote} fora deste lote — dispare de novo depois.` : ''),
                          );
                        },
                        aberta.campanha.id,
                      )
                    }
                  >
                    Disparar pendentes
                  </Button>
                  <Button
                    variante="neutro"
                    disabled={ocupado}
                    onClick={() =>
                      void agir(
                        () => api.patch(`/campanhas/${aberta.campanha.id}/status`, { status: 'PAUSADA' }),
                        aberta.campanha.id,
                      )
                    }
                  >
                    Pausar
                  </Button>
                </>
              )}

              {aberta.campanha.contagens.FALHOU + aberta.campanha.contagens.IGNORADO > 0 && (
                <Button
                  variante="neutro"
                  disabled={ocupado}
                  onClick={() =>
                    void agir(() => api.post(`/campanhas/${aberta.campanha.id}/reprocessar`), aberta.campanha.id)
                  }
                >
                  Reprocessar falhas
                </Button>
              )}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card titulo="Situacao dos envios" descricao={`${aberta.campanha.total} contato(s)`}>
              <BarList itens={itensDoGrafico} vazio="Nenhum contato adicionado" />
            </Card>

            <Card titulo="Contatos" descricao="Primeiros 200">
              {aberta.itens.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum contato na campanha.</p>
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
        </div>
      ) : (
        <Card titulo="Detalhe da campanha">
          <p className="text-sm text-slate-500">
            Selecione uma campanha para ver os contatos e disparar os envios.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Campanhas de voz exigem integracao de telefonia (PABX/SIP), que ainda nao existe — o
            disparo e recusado com essa mensagem em vez de falhar silenciosamente.
          </p>
        </Card>
      )}
    </div>
  );
}
