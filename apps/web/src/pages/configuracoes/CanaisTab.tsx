import { useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { Canal, Fila } from '../../lib/types';

type CanalConfig = {
  id: string;
  canal: Canal;
  ativo: boolean;
  phoneNumberId: string | null;
  pageId: string | null;
  igUserId: string | null;
  fila: { id: string; nome: string } | null;
  accessTokenMascarado: string | null;
  configurado: boolean;
};

const SUPORTADOS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'] as const;
type CanalSuportado = (typeof SUPORTADOS)[number];

const ROTULO: Record<CanalSuportado, string> = {
  WHATSAPP: 'WhatsApp Business',
  INSTAGRAM: 'Instagram Direct',
  FACEBOOK: 'Facebook Messenger',
};

const vazio = {
  accessToken: '',
  appSecret: '',
  verifyToken: '',
  phoneNumberId: '',
  pageId: '',
  igUserId: '',
  filaId: '',
};

/** Configuracao dos canais da Meta. Segredos sao enviados, nunca lidos de volta. */
export function CanaisTab() {
  const [canais, setCanais] = useState<CanalConfig[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [editando, setEditando] = useState<CanalSuportado>('WHATSAPP');
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    try {
      const [c, f] = await Promise.all([
        api.get<{ canais: CanalConfig[] }>('/canais'),
        api.get<{ filas: Fila[] }>('/filas'),
      ]);
      setCanais(c.canais);
      setFilas(f.filas);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar canais');
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const salvar = async (ativo?: boolean) => {
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      const corpo: Record<string, unknown> = {};
      if (form.accessToken) corpo.accessToken = form.accessToken;
      if (form.appSecret) corpo.appSecret = form.appSecret;
      if (form.verifyToken) corpo.verifyToken = form.verifyToken;
      if (form.filaId) corpo.filaId = form.filaId;
      if (editando === 'WHATSAPP' && form.phoneNumberId) corpo.phoneNumberId = form.phoneNumberId;
      if (editando !== 'WHATSAPP' && form.pageId) corpo.pageId = form.pageId;
      if (editando === 'INSTAGRAM' && form.igUserId) corpo.igUserId = form.igUserId;
      if (ativo !== undefined) corpo.ativo = ativo;

      if (Object.keys(corpo).length === 0) {
        setErro('Informe ao menos um campo');
        return;
      }

      await api.put(`/canais/${editando.toLowerCase()}`, corpo);
      setForm(vazio);
      setOk('Canal atualizado.');
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar canal');
    } finally {
      setOcupado(false);
    }
  };

  const atual = canais.find((c) => c.canal === editando);
  const urlWebhook = `${window.location.origin}/api/webhooks/${editando.toLowerCase()}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card titulo="Canais externos" descricao="Integracoes oficiais da Meta">
        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}
        {ok && <div className="mb-4"><Alerta tipo="sucesso">{ok}</Alerta></div>}

        <ul className="divide-y divide-slate-100">
          {SUPORTADOS.map((canal) => {
            const config = canais.find((c) => c.canal === canal);
            return (
              <li key={canal} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{ROTULO[canal]}</p>
                  <p className="text-xs text-slate-500">
                    {config?.configurado ? `Credenciais: ${config.accessTokenMascarado}` : 'Sem credenciais'}
                    {config?.fila ? ` · fila ${config.fila.nome}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {config?.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge>Inativo</Badge>}
                  <Button variante="neutro" onClick={() => setEditando(canal)}>Configurar</Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Antes de ativar</p>
          <p className="mt-1">
            O WhatsApp Business API oficial exige conta verificada na Meta (CNPJ, comprovante de
            endereco e site) — o processo leva dias ou semanas. A URL de webhook a cadastrar no painel
            da Meta, para este canal, e:
          </p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-slate-800">
            {urlWebhook}
          </code>
          <p className="mt-2">
            Em desenvolvimento a Meta exige HTTPS publico — use um tunel (ngrok, cloudflared) apontando
            para esta porta.
          </p>
        </div>
      </Card>

      <Card titulo={`Configurar ${ROTULO[editando]}`} descricao="Campos em branco nao alteram o valor salvo">
        <div className="space-y-3">
          <Field label="Access Token" hint="Token da Graph API (nunca e exibido de volta)">
            <Input
              type="password"
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            />
          </Field>
          <Field label="App Secret" hint="Valida a assinatura X-Hub-Signature-256">
            <Input
              type="password"
              value={form.appSecret}
              onChange={(e) => setForm({ ...form, appSecret: e.target.value })}
            />
          </Field>
          <Field label="Verify Token" hint="Voce escolhe; o mesmo valor vai no painel da Meta">
            <Input value={form.verifyToken} onChange={(e) => setForm({ ...form, verifyToken: e.target.value })} />
          </Field>

          {editando === 'WHATSAPP' ? (
            <Field label="Phone Number ID">
              <Input
                value={form.phoneNumberId}
                onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="Page ID">
              <Input value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} />
            </Field>
          )}

          {editando === 'INSTAGRAM' && (
            <Field label="Instagram User ID">
              <Input value={form.igUserId} onChange={(e) => setForm({ ...form, igUserId: e.target.value })} />
            </Field>
          )}

          <Field label="Fila de destino">
            <Select value={form.filaId} onChange={(e) => setForm({ ...form, filaId: e.target.value })}>
              <option value="">{atual?.fila ? `Manter (${atual.fila.nome})` : 'Primeira fila ativa'}</option>
              {filas.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button disabled={ocupado} onClick={() => void salvar()}>Salvar</Button>
            {atual?.ativo ? (
              <Button variante="perigo" disabled={ocupado} onClick={() => void salvar(false)}>Desativar</Button>
            ) : (
              <Button variante="neutro" disabled={ocupado} onClick={() => void salvar(true)}>Salvar e ativar</Button>
            )}
          </div>
        </div>
      </Card>

      <Card
        titulo="Widget do site"
        descricao="Uma tag no site do cliente abre o Webchat como bolha flutuante"
      >
        <p className="text-xs text-slate-500">
          O widget carrega o Webchat dentro de um iframe: o CSS do site nao afeta o chat e o chat nao
          afeta o site. As cores vem do White Label.
        </p>

        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">
{`<script src="${window.location.origin}/api/widget.js" defer></script>`}
        </pre>

        <Button
          className="mt-3"
          variante="neutro"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(`<script src="${window.location.origin}/api/widget.js" defer></script>`)
              .then(() => setOk('Tag copiada.'))
              .catch(() => setErro('Nao foi possivel copiar — selecione o texto acima.'));
          }}
        >
          Copiar tag
        </Button>

        <p className="mt-3 text-xs text-slate-400">
          Opcionais: <code>data-fila="&lt;id&gt;"</code> direciona para uma fila especifica e{' '}
          <code>data-titulo="..."</code> troca o texto do botao.
        </p>
      </Card>
    </div>
  );
}
