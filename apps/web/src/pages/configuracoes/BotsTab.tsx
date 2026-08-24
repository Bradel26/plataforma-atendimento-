import { useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { Bot, BotAcao, BotPasso, Canal, Fila } from '../../lib/types';

const ACOES: Array<{ valor: BotAcao; label: string }> = [
  { valor: 'RESPONDER', label: 'Responder e continuar' },
  { valor: 'TRANSFERIR', label: 'Transferir para fila' },
  { valor: 'ENCERRAR', label: 'Encerrar atendimento' },
];

const CANAIS: Array<{ valor: string; label: string }> = [
  { valor: '', label: 'Todos os canais' },
  { valor: 'WEBCHAT', label: 'Webchat' },
  { valor: 'WHATSAPP', label: 'WhatsApp' },
  { valor: 'INSTAGRAM', label: 'Instagram' },
  { valor: 'FACEBOOK', label: 'Facebook' },
];

const PASSO_VAZIO: BotPasso = { gatilhos: [], resposta: '', acao: 'RESPONDER', filaId: null };

const novoBot = () => ({
  nome: 'Atendente virtual',
  ativo: false,
  canal: '' as string,
  mensagemBoasVindas: 'Ola! Sou o assistente virtual e vou tentar te ajudar.',
  fallback: 'Nao entendi. Digite "atendente" para falar com uma pessoa.',
  limiteSemResposta: 2,
  passos: [{ ...PASSO_VAZIO }] as BotPasso[],
});

/** Fluxo por palavra-chave. Responde so enquanto ninguem assumiu a conversa. */
export function BotsTab() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [form, setForm] = useState<ReturnType<typeof novoBot> & { id?: string }>(novoBot());
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    try {
      const [b, f] = await Promise.all([
        api.get<{ bots: Bot[] }>('/bots'),
        api.get<{ filas: Fila[] }>('/filas'),
      ]);
      setBots(b.bots);
      setFilas(f.filas);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar bots');
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const editar = (bot: Bot) =>
    setForm({
      id: bot.id,
      nome: bot.nome,
      ativo: bot.ativo,
      canal: bot.canal ?? '',
      mensagemBoasVindas: bot.mensagemBoasVindas,
      fallback: bot.fallback,
      limiteSemResposta: bot.limiteSemResposta,
      passos: bot.passos.map((p) => ({ ...p })),
    });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      await api.put('/bots', {
        ...(form.id ? { id: form.id } : {}),
        nome: form.nome,
        ativo: form.ativo,
        canal: form.canal ? (form.canal as Canal) : null,
        mensagemBoasVindas: form.mensagemBoasVindas,
        fallback: form.fallback,
        limiteSemResposta: form.limiteSemResposta,
        passos: form.passos
          .filter((p) => p.gatilhos.length > 0 && p.resposta.trim())
          .map((p) => ({
            gatilhos: p.gatilhos,
            resposta: p.resposta,
            acao: p.acao,
            filaId: p.acao === 'TRANSFERIR' ? p.filaId : null,
          })),
      });
      setOk('Bot salvo.');
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar o bot');
    } finally {
      setOcupado(false);
    }
  };

  const atualizarPasso = (indice: number, mudanca: Partial<BotPasso>) =>
    setForm({
      ...form,
      passos: form.passos.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)),
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card titulo="Bots" descricao={`${bots.length} cadastrado(s)`}>
        {bots.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum bot configurado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bots.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{b.nome}</p>
                  <p className="text-xs text-slate-500">
                    {b.canal ?? 'todos os canais'} · {b.passos.length} passo(s)
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {b.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge>Inativo</Badge>}
                  <Button variante="neutro" onClick={() => editar(b)}>Editar</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button variante="neutro" className="mt-4 w-full" onClick={() => setForm(novoBot())}>
          Novo bot
        </Button>
      </Card>

      <Card titulo={form.id ? `Editando: ${form.nome}` : 'Novo bot'} descricao="O bot cala assim que um agente assume">
        <form onSubmit={salvar} className="space-y-4">
          {erro && <Alerta>{erro}</Alerta>}
          {ok && <Alerta tipo="sucesso">{ok}</Alerta>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nome">
              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Field>
            <Field label="Canal">
              <Select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })}>
                {CANAIS.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tentativas sem entender" hint="Depois disso o bot desiste">
              <Input
                type="number"
                min={1}
                max={5}
                value={form.limiteSemResposta}
                onChange={(e) => setForm({ ...form, limiteSemResposta: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Mensagem de boas-vindas">
            <Input
              required
              value={form.mensagemBoasVindas}
              onChange={(e) => setForm({ ...form, mensagemBoasVindas: e.target.value })}
            />
          </Field>
          <Field label="Resposta quando nao entende">
            <Input required value={form.fallback} onChange={(e) => setForm({ ...form, fallback: e.target.value })} />
          </Field>

          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passos</p>
            {form.passos.map((passo, i) => (
              <div key={i} className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 sm:grid-cols-2">
                <Field label="Gatilhos" hint="Separados por virgula; ignora acento e caixa">
                  <Input
                    value={passo.gatilhos.join(', ')}
                    onChange={(e) =>
                      atualizarPasso(i, {
                        gatilhos: e.target.value.split(',').map((g) => g.trim()).filter(Boolean),
                      })
                    }
                  />
                </Field>
                <Field label="Resposta">
                  <Input value={passo.resposta} onChange={(e) => atualizarPasso(i, { resposta: e.target.value })} />
                </Field>
                <Field label="Acao">
                  <Select value={passo.acao} onChange={(e) => atualizarPasso(i, { acao: e.target.value as BotAcao })}>
                    {ACOES.map((a) => (
                      <option key={a.valor} value={a.valor}>{a.label}</option>
                    ))}
                  </Select>
                </Field>
                {passo.acao === 'TRANSFERIR' && (
                  <Field label="Fila de destino">
                    <Select
                      value={passo.filaId ?? ''}
                      onChange={(e) => atualizarPasso(i, { filaId: e.target.value || null })}
                    >
                      <option value="">Manter a fila atual</option>
                      {filas.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            ))}
            <Button
              variante="neutro"
              onClick={() => setForm({ ...form, passos: [...form.passos, { ...PASSO_VAZIO }] })}
            >
              Adicionar passo
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Bot ativo
          </label>

          <Button type="submit" disabled={ocupado}>{ocupado ? 'Salvando...' : 'Salvar bot'}</Button>
        </form>
      </Card>
    </div>
  );
}
