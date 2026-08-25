import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { ConfigVoz, Fila } from '../../lib/types';

const VAZIO = {
  provedor: 'twilio',
  contaSid: '',
  authToken: '',
  numeroPadrao: '',
  urlWebhook: '',
  filaId: '',
  guardarGravacao: true,
};

/** Credenciais do provedor de voz e as URLs que ele precisa conhecer. */
export function VozTab() {
  const [config, setConfig] = useState<ConfigVoz | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [{ config: c }, { filas: f }] = await Promise.all([
        api.get<{ config: ConfigVoz }>('/voz/config'),
        api.get<{ filas: Fila[] }>('/filas'),
      ]);
      setConfig(c);
      setFilas(f);
      setForm({
        provedor: c.provedor,
        contaSid: c.contaSid ?? '',
        // Token nunca volta em claro: campo vazio significa "manter o atual".
        authToken: '',
        numeroPadrao: c.numeroPadrao ?? '',
        urlWebhook: c.urlWebhook ?? '',
        filaId: c.filaId ?? '',
        guardarGravacao: c.guardarGravacao,
      });
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a configuracao de voz');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async (ativo?: boolean) => {
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      const { config: novo } = await api.put<{ config: ConfigVoz }>('/voz/config', {
        provedor: form.provedor,
        contaSid: form.contaSid.trim() || null,
        ...(form.authToken.trim() ? { authToken: form.authToken.trim() } : {}),
        numeroPadrao: form.numeroPadrao.trim() || null,
        urlWebhook: form.urlWebhook.trim() || null,
        filaId: form.filaId || null,
        guardarGravacao: form.guardarGravacao,
        ...(ativo === undefined ? {} : { ativo }),
      });
      setConfig(novo);
      setForm((f) => ({ ...f, authToken: '' }));
      setOk('Configuracao de voz salva.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card
        titulo="Provedor de voz"
        descricao="A plataforma nao fala SIP: ela fala com um provedor por HTTP"
        acao={<Badge tom={config?.ativo ? 'sucesso' : 'neutro'}>{config?.ativo ? 'ativo' : 'inativo'}</Badge>}
      >
        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}
        {ok && <div className="mb-4"><Alerta tipo="sucesso">{ok}</Alerta></div>}

        <div className="space-y-4">
          <Field label="Provedor">
            <Select value={form.provedor} onChange={(e) => setForm({ ...form, provedor: e.target.value })}>
              {(config?.provedoresDisponiveis ?? ['twilio']).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>

          <Field label="Identificador da conta (Account SID)">
            <Input value={form.contaSid} onChange={(e) => setForm({ ...form, contaSid: e.target.value })} />
          </Field>

          <Field
            label="Token de autenticacao"
            hint={config?.authTokenMascarado ? `Atual: ${config.authTokenMascarado} — deixe vazio para manter` : 'Nunca e devolvido em claro pela API'}
          >
            <Input
              type="password"
              autoComplete="off"
              value={form.authToken}
              onChange={(e) => setForm({ ...form, authToken: e.target.value })}
            />
          </Field>

          <Field label="Numero de saida" hint="Formato internacional, ex.: +551140028922">
            <Input value={form.numeroPadrao} onChange={(e) => setForm({ ...form, numeroPadrao: e.target.value })} />
          </Field>

          <Field label="URL publica de webhook" hint="Precisa ser HTTPS: e por ela que o provedor reporta os eventos">
            <Input
              type="url"
              placeholder="https://seu-dominio/api/webhooks/voz"
              value={form.urlWebhook}
              onChange={(e) => setForm({ ...form, urlWebhook: e.target.value })}
            />
          </Field>

          <Field label="Fila das chamadas entrantes">
            <Select value={form.filaId} onChange={(e) => setForm({ ...form, filaId: e.target.value })}>
              <option value="">Sem fila definida</option>
              {filas.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </Select>
          </Field>

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.guardarGravacao}
              onChange={(e) => setForm({ ...form, guardarGravacao: e.target.checked })}
            />
            <span>
              Guardar a gravacao no storage da plataforma
              <span className="block text-xs text-slate-400">
                A URL do provedor exige credencial e expira; sem copia, a gravacao se perde.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button disabled={ocupado} onClick={() => void salvar()}>Salvar</Button>
            {config?.ativo ? (
              <Button variante="perigo" disabled={ocupado} onClick={() => void salvar(false)}>Desativar</Button>
            ) : (
              <Button variante="neutro" disabled={ocupado} onClick={() => void salvar(true)}>Salvar e ativar</Button>
            )}
          </div>
        </div>
      </Card>

      <Card titulo="No painel do provedor" descricao="Aponte estas duas URLs na configuracao do numero">
        <ol className="space-y-3 text-xs text-slate-600">
          <li>
            <p className="font-medium text-slate-700">Instrucoes da chamada (Voice URL)</p>
            <code className="mt-1 block overflow-x-auto rounded bg-slate-100 px-2 py-1">
              {(form.urlWebhook || 'https://seu-dominio/api/webhooks/voz') + '/instrucoes'}
            </code>
          </li>
          <li>
            <p className="font-medium text-slate-700">Eventos de status (Status Callback)</p>
            <code className="mt-1 block overflow-x-auto rounded bg-slate-100 px-2 py-1">
              {(form.urlWebhook || 'https://seu-dominio/api/webhooks/voz') + '/eventos'}
            </code>
          </li>
        </ol>

        <p className="mt-4 text-xs text-slate-400">
          Toda requisicao do provedor e conferida pela assinatura dele. Sem assinatura valida, a
          plataforma responde 401 e nao registra nada.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Softphone no navegador, ramais, URA e monitoria (escuta/sussurro) precisam do SDK e do
          console do provedor — nao estao implementados. Ver "Voz" no SCOPE.md.
        </p>
      </Card>
    </div>
  );
}
