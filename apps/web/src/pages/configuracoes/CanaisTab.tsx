import { useEffect, useRef, useState } from 'react';
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
  /*
   * Modo do WhatsApp (item do WhatsApp nos dois modos). Nulo nos outros canais,
   * e nulo no WhatsApp significa OFICIAL — o canal foi configurado antes de a
   * pergunta existir.
   */
  modo?: 'OFICIAL' | 'NAO_OFICIAL' | null;
  ponteUrl?: string | null;
  ponteSessao?: string | null;
  ponteTokenMascarado?: string | null;
  ponteSegredoMascarado?: string | null;
};

type QrDaPonte = {
  /** PNG em data URL. Nulo quando nao ha nada para escanear agora. */
  qr: string | null;
  conectado: boolean;
  motivo: string | null;
};

type EstadoDaPonte = {
  situacao: 'CONECTADO' | 'DESCONECTADO' | 'DESCONHECIDO';
  detalhe: string | null;
};

const SUPORTADOS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'] as const;
type CanalSuportado = (typeof SUPORTADOS)[number];

const ROTULO: Record<CanalSuportado, string> = {
  WHATSAPP: 'WhatsApp Business',
  INSTAGRAM: 'Instagram Direct',
  FACEBOOK: 'Facebook Messenger',
};

const vazio = {
  ponteUrl: '',
  ponteToken: '',
  ponteSegredo: '',
  ponteSessao: '',
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
  /** Modo escolhido no formulario. */
  const [modo, setModo] = useState<'OFICIAL' | 'NAO_OFICIAL'>('OFICIAL');
  /*
   * O usuario ja mexeu no modo?
   *
   * Sem esta trava havia uma corrida silenciosa: se o carregamento terminasse
   * DEPOIS do clique no radio, ele reescrevia a escolha com o valor gravado, e a
   * pessoa via o formulario voltar sozinho para o outro modo. Foi o teste de
   * navegador que expos isso — na leitura o codigo parecia correto, porque o
   * carregamento "acontece antes".
   *
   * E `useRef`, e nao `useState`, por um motivo que custou uma segunda rodada de
   * teste: `carregar` e criada a cada render e a chamada em voo captura o valor
   * do render em que nasceu. Com estado, a trava lida por ela era sempre o
   * `false` inicial — a correcao nao corrigia nada. O ref e uma caixa: quem tem a
   * referencia le o valor de agora.
   *
   * Volta a falso depois de gravar: dali em diante o valor do servidor E a
   * escolha da pessoa.
   */
  const modoTocado = useRef(false);
  const [estadoPonte, setEstadoPonte] = useState<EstadoDaPonte | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** O QR de pareamento. Nulo enquanto nunca foi buscado. */
  const [qrPonte, setQrPonte] = useState<QrDaPonte | null>(null);
  const [trocandoNumero, setTrocandoNumero] = useState(false);
  /** Caminho que a ponte deve chamar. Vem da API porque leva o id da organizacao. */
  const [caminhoPonte, setCaminhoPonte] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const [c, f] = await Promise.all([
        api.get<{ canais: CanalConfig[] }>('/canais'),
        api.get<{ filas: Fila[] }>('/filas'),
      ]);
      setCanais(c.canais);
      setFilas(f.filas);

      const zap = c.canais.find((x) => x.canal === 'WHATSAPP');
      if (!modoTocado.current) setModo(zap?.modo ?? 'OFICIAL');

      /*
       * O estado da ponte e buscado SEMPRE, e a falha e engolida.
       *
       * Duas razoes:
       *
       * - diagnostico que derruba a tela de configuracao impede justamente quem
       *   esta tentando arrumar a sessao;
       * - e o caminho do webhook precisa estar em mao ANTES de gravar o modo. A
       *   primeira versao so buscava quando o modo JA estava gravado como nao
       *   oficial, e o resultado era que quem estava escolhendo o modo nao via a
       *   URL que ele precisa dar para a ponte — descobri isso pelo teste de
       *   navegador, nao pela leitura.
       *
       * O estado da sessao so e exibido no modo nao oficial; no oficial a
       * resposta diz "nao esta no modo nao oficial", que nao e informacao para
       * ninguem.
       */
      try {
        const e = await api.get<{ estado: EstadoDaPonte; aviso: string; caminhoWebhook: string }>(
          '/canais/whatsapp/ponte/estado',
        );
        setAviso(e.aviso);
        setCaminhoPonte(e.caminhoWebhook);
        setEstadoPonte((zap?.modo ?? 'OFICIAL') === 'NAO_OFICIAL' ? e.estado : null);
      } catch {
        setEstadoPonte(null);
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar canais');
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  /**
   * O QR expira sozinho a cada ~20 segundos, e a ponte gera o proximo.
   *
   * Por isso a tela busca em intervalo em vez de uma vez so: um QR parado na
   * tela e um QR que nao funciona mais, e a pessoa fica apontando a camera para
   * um codigo morto sem entender por que nada acontece.
   *
   * So roda com o painel do WhatsApp aberto no modo nao oficial. Para de rodar
   * quando conecta: dali em diante nao ha o que escanear.
   */
  useEffect(() => {
    if (editando !== 'WHATSAPP' || modo !== 'NAO_OFICIAL') {
      setQrPonte(null);
      return;
    }

    let vivo = true;

    const buscar = async () => {
      try {
        const r = await api.get<QrDaPonte>('/canais/whatsapp/ponte/qr');
        if (vivo) setQrPonte(r);
      } catch {
        // Silencio proposital: a ponte cair nao pode apagar o QR que ja esta na
        // tela, que pode ser justamente o que a pessoa esta escaneando.
      }
    };

    void buscar();
    const timer = window.setInterval(() => {
      void buscar();
    }, 5_000);

    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [editando, modo]);

  /**
   * Trocar de numero: desfaz o pareamento e volta a pedir QR.
   *
   * Confirma antes porque a acao derruba o WhatsApp da operacao na hora — quem
   * clicar sem querer deixa o atendimento mudo ate alguem escanear o novo QR.
   */
  const trocarNumero = async () => {
    if (!window.confirm('Desconectar o numero atual? O WhatsApp para de receber ate alguem escanear o novo QR.')) {
      return;
    }

    setTrocandoNumero(true);
    setErro(null);
    try {
      await api.post('/canais/whatsapp/ponte/desconectar', {});
      setQrPonte(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao desconectar a ponte');
    } finally {
      setTrocandoNumero(false);
    }
  };

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
      if (editando === 'WHATSAPP') {
        // O modo vai SEMPRE que o canal e WhatsApp: e uma escolha de radio, e
        // mandar so quando muda faria a primeira gravacao nao registrar nada.
        corpo.modo = modo;
        if (form.ponteUrl) corpo.ponteUrl = form.ponteUrl;
        if (form.ponteToken) corpo.ponteToken = form.ponteToken;
        if (form.ponteSegredo) corpo.ponteSegredo = form.ponteSegredo;
        if (form.ponteSessao) corpo.ponteSessao = form.ponteSessao;
      }
      if (ativo !== undefined) corpo.ativo = ativo;

      if (Object.keys(corpo).length === 0) {
        setErro('Informe ao menos um campo');
        return;
      }

      await api.put(`/canais/${editando.toLowerCase()}`, corpo);
      setForm(vazio);
      modoTocado.current = false;
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
          {/* No modo nao oficial a URL e outra, e quem a cadastra e a ponte — nao
              a Meta. Mostrar as duas juntas evita cadastrar a errada no lugar
              errado, que produz um canal silencioso. */}
          {editando === 'WHATSAPP' && modo === 'NAO_OFICIAL' && caminhoPonte && (
            <>
              <p className="mt-3 font-medium text-slate-700">No modo nao oficial</p>
              <p className="mt-1">
                Nada e cadastrado na Meta. Configure a PONTE para postar cada mensagem recebida em:
              </p>
              <code className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-slate-800">
                {window.location.origin}
                {caminhoPonte}
              </code>
              <p className="mt-2">
                Assinada com HMAC-SHA256 do corpo, no cabecalho <code>X-Ponte-Assinatura</code>, usando o
                segredo configurado ao lado. Corpo:{' '}
                <code>{'{ numero, texto, idExterno, nome? }'}</code> &mdash; o <code>idExterno</code> e
                obrigatorio porque e ele que evita mensagem duplicada quando a ponte reentrega.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card titulo={`Configurar ${ROTULO[editando]}`} descricao="Campos em branco nao alteram o valor salvo">
        <div className="space-y-3">
          {editando === 'WHATSAPP' && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-700">Como conectar</p>
              <div className="mt-2 space-y-2">
                {(['OFICIAL', 'NAO_OFICIAL'] as const).map((opcao) => (
                  <label key={opcao} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="modo-whatsapp"
                      value={opcao}
                      checked={modo === opcao}
                      onChange={() => {
                        setModo(opcao);
                        modoTocado.current = true;
                      }}
                      className="mt-0.5"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-slate-800">
                        {opcao === 'OFICIAL' ? 'API oficial (Meta Cloud API)' : 'Sem API oficial (ponte externa)'}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {opcao === 'OFICIAL'
                          ? 'Numero em uma WABA verificada. Custo por conversa, template para iniciar contato, e continuidade garantida pela Meta.'
                          : 'Sessao de WhatsApp Web mantida por uma ponte externa (Baileys, WPPConnect). Funciona com qualquer numero e sem custo por mensagem.'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {/* O aviso aparece SO no modo que tem risco, e diz o risco.
                  Um aviso permanente nos dois modos seria ignorado nos dois. */}
              {modo === 'NAO_OFICIAL' && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">Leia antes de ligar</p>
                  <p className="mt-1">
                    {aviso ??
                      'O modo nao oficial se conecta como WhatsApp Web e viola os termos de uso do WhatsApp: o numero pode ser bloqueado sem aviso. Use um numero que a operacao possa perder.'}
                  </p>
                  <p className="mt-1">
                    A plataforma nao hospeda a ponte: ela conversa por HTTP com um servico separado, que
                    mantem a sessao do QR Code. Trocar de modo depois nao apaga as credenciais do outro.
                  </p>
                </div>
              )}

              {estadoPonte && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">Sessao da ponte:</span>
                  <Badge
                    tom={
                      estadoPonte.situacao === 'CONECTADO'
                        ? 'sucesso'
                        : estadoPonte.situacao === 'DESCONECTADO'
                          ? 'alerta'
                          : 'neutro'
                    }
                  >
                    {estadoPonte.situacao === 'CONECTADO'
                      ? 'conectada'
                      : estadoPonte.situacao === 'DESCONECTADO'
                        ? 'desconectada'
                        : 'nao confirmada'}
                  </Badge>
                  {/* Desconhecido nao e desconectado: a frase diz qual dos dois. */}
                  {estadoPonte.detalhe && <span className="text-slate-400">{estadoPonte.detalhe}</span>}
                </p>
              )}

              {/*
                O pareamento pela tela.

                So aparece depois que a ponte esta configurada — antes disso nao
                ha a quem pedir QR, e um quadro vazio faria parecer defeito.
              */}
              {qrPonte && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
                  {qrPonte.conectado ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium text-emerald-700">Numero conectado.</span> Nao ha nada
                        para escanear.
                      </p>
                      <button
                        type="button"
                        onClick={() => void trocarNumero()}
                        disabled={trocandoNumero}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {trocandoNumero ? 'Desconectando...' : 'Trocar de numero'}
                      </button>
                    </div>
                  ) : qrPonte.qr ? (
                    <div className="flex flex-wrap items-center gap-4">
                      <img
                        src={qrPonte.qr}
                        alt="QR Code para conectar o WhatsApp"
                        width={200}
                        height={200}
                        className="rounded border border-slate-200"
                      />
                      <div className="text-xs text-slate-600">
                        <p className="text-sm font-medium text-slate-800">Conecte o WhatsApp</p>
                        <ol className="mt-2 list-decimal space-y-1 pl-4">
                          <li>Abra o WhatsApp no celular do numero da operacao</li>
                          <li>
                            Toque em <strong>Aparelhos conectados</strong> e depois em{' '}
                            <strong>Conectar aparelho</strong>
                          </li>
                          <li>Aponte a camera para este codigo</li>
                        </ol>
                        {/* Sem este aviso, ver o codigo mudar sozinho parece falha. */}
                        <p className="mt-2 text-slate-400">
                          O codigo se renova a cada poucos segundos. Se perder, espere o proximo.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {qrPonte.motivo ?? 'Gerando o QR Code...'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {editando === 'WHATSAPP' && modo === 'NAO_OFICIAL' ? (
            <>
              <Field label="Endereco da ponte" hint="Ex.: http://wpp:3000/api — a plataforma chama /mensagens, /arquivos e /estado">
                <Input
                  value={form.ponteUrl}
                  placeholder={atual?.ponteUrl ?? 'http://localhost:3000/api'}
                  onChange={(e) => setForm({ ...form, ponteUrl: e.target.value })}
                />
              </Field>
              <Field label="Token da ponte" hint="Com que a plataforma se autentica NA ponte">
                <Input
                  type="password"
                  value={form.ponteToken}
                  onChange={(e) => setForm({ ...form, ponteToken: e.target.value })}
                />
              </Field>
              <Field
                label="Segredo de assinatura"
                hint="Com que a PONTE assina o que manda para ca (HMAC-SHA256, minimo 16 caracteres). Sem ele nada e recebido."
              >
                <Input
                  type="password"
                  value={form.ponteSegredo}
                  onChange={(e) => setForm({ ...form, ponteSegredo: e.target.value })}
                />
              </Field>
              <Field label="Sessao / instancia" hint="Se a ponte hospeda mais de um numero. Em branco = sessao unica">
                <Input
                  value={form.ponteSessao}
                  placeholder={atual?.ponteSessao ?? ''}
                  onChange={(e) => setForm({ ...form, ponteSessao: e.target.value })}
                />
              </Field>
            </>
          ) : (
          <>
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

          </>
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
