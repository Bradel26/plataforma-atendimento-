import { Fragment, useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ApiError, api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import type { Canal, Fila, Usuario } from '../../lib/types';

type CanalConfig = {
  id: string;
  canal: Canal;
  ativo: boolean;
  /** Rotulo da linha — so importa quando ha mais de um numero do mesmo canal. */
  nome: string | null;
  /** Dono da linha pessoal (vendedor com numero proprio). Nulo = linha compartilhada. */
  dono: { id: string; nome: string } | null;
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
  /** Ultimo status que a ponte avisou para esta linha. Nulo antes do primeiro aviso. */
  ponteStatus?: string | null;
  ponteStatusEm?: string | null;
};

type IaDoNumero = { ativa: boolean; webhook: string | null; assinado: boolean };

const numeroVazio = {
  id: null as string | null,
  nome: '',
  donoId: '',
  modo: 'OFICIAL' as 'OFICIAL' | 'NAO_OFICIAL',
  phoneNumberId: '',
  accessToken: '',
  appSecret: '',
  verifyToken: '',
  ponteUrl: '',
  ponteToken: '',
  ponteSegredo: '',
  ponteSessao: '',
  filaId: '',
  ativo: true,
  iaAtiva: false,
  iaUrlWebhook: '',
  iaSegredo: '',
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
  const confirmar = useConfirm();
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

  // ----- Numeros pessoais (vendedor com WhatsApp proprio) -----
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [numeroForm, setNumeroForm] = useState(numeroVazio);
  const [numeroErro, setNumeroErro] = useState<string | null>(null);
  const [numeroOk, setNumeroOk] = useState<string | null>(null);
  const [numeroOcupado, setNumeroOcupado] = useState(false);
  /** Qual linha pessoal esta com o painel de conexao aberto — nulo = nenhuma. */
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null);
  const [estadoLinha, setEstadoLinha] = useState<EstadoDaPonte | null>(null);
  const [qrLinha, setQrLinha] = useState<QrDaPonte | null>(null);
  const [trocandoLinha, setTrocandoLinha] = useState(false);

  const carregar = async () => {
    try {
      const [c, f, u] = await Promise.all([
        api.get<{ canais: CanalConfig[] }>('/canais'),
        api.get<{ filas: Fila[] }>('/filas'),
        api.get<{ usuarios: Usuario[] }>('/usuarios'),
      ]);
      setCanais(c.canais);
      setFilas(f.filas);
      // So quem pode atuar em conversa entra na lista de donos: dar numero
      // proprio a um GESTOR ou ADMIN nao tem para onde a conversa ir depois.
      setUsuarios(u.usuarios.filter((x) => x.perfil === 'COMERCIAL' || x.perfil === 'AGENTE'));

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
   * Aviso em tempo real de que uma sessao da ponte conectou ou caiu.
   *
   * Sem isto so daria para saber pelo botao "Conectar" de cada linha, um por
   * vez — e o vendedor cujo WhatsApp caiu no meio do expediente nao esperaria a
   * gestao ir clicar cada linha para descobrir qual e a dele.
   */
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });

    socket.on(EVENTOS.canalStatus, (payload: { id: string; status: string; detalhe: string | null; em: string }) => {
      setCanais((atual) =>
        atual.map((c) => (c.id === payload.id ? { ...c, ponteStatus: payload.status, ponteStatusEm: payload.em } : c)),
      );
    });

    return () => {
      socket.disconnect();
    };
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

  useEffect(() => {
    /*
     * Limpa o estado da linha ANTERIOR assim que `linhaAberta` muda — inclusive
     * quando muda direto de uma linha para outra, sem passar por nulo.
     *
     * Sem isto, clicar "Conectar" na linha do vendedor B enquanto o painel do
     * vendedor A ainda esta aberto deixava o QR e o estado de A visiveis sob o
     * rotulo de B ate a primeira busca desta linha responder (ate 5s) — risco
     * real de parear o celular errado com a linha errada.
     */
    setQrLinha(null);
    setEstadoLinha(null);

    if (!linhaAberta) {
      return;
    }

    let vivo = true;

    const buscar = async () => {
      try {
        const [e, q] = await Promise.all([
          api.get<{ estado: EstadoDaPonte }>(`/canais/numeros/${linhaAberta}/ponte/estado`),
          api.get<QrDaPonte>(`/canais/numeros/${linhaAberta}/ponte/qr`),
        ]);
        if (vivo) {
          setEstadoLinha(e.estado);
          setQrLinha(q);
        }
      } catch {
        // Mesma razao do polling compartilhado: a ponte cair nao pode apagar o
        // QR que a pessoa esta escaneando agora.
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
  }, [linhaAberta]);

  /**
   * Trocar de numero: desfaz o pareamento e volta a pedir QR.
   *
   * Confirma antes porque a acao derruba o WhatsApp da operacao na hora — quem
   * clicar sem querer deixa o atendimento mudo ate alguem escanear de novo.
   */
  const trocarNumero = () => {
    confirmar({
      titulo: 'Desconectar o numero atual?',
      descricao: 'O WhatsApp para de receber ate alguem escanear o novo QR.',
      variante: 'perigo',
      rotuloConfirmar: 'Desconectar',
      aoConfirmar: async () => {
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
      },
    });
  };

  const trocarLinha = (numero: CanalConfig) => {
    confirmar({
      titulo: `Desconectar o WhatsApp de ${numero.dono?.nome}?`,
      descricao: 'Ele para de receber pelo WhatsApp ate escanear o novo QR.',
      variante: 'perigo',
      rotuloConfirmar: 'Desconectar',
      aoConfirmar: async () => {
        setTrocandoLinha(true);
        setNumeroErro(null);
        try {
          await api.post(`/canais/numeros/${numero.id}/ponte/desconectar`, {});
          setQrLinha(null);
          setEstadoLinha(null);
        } catch (e) {
          setNumeroErro(e instanceof ApiError ? e.message : 'Falha ao desconectar o numero');
        } finally {
          setTrocandoLinha(false);
        }
      },
    });
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

  const numeros = canais.filter((c) => c.canal === 'WHATSAPP' && c.dono);

  const editarNumero = async (numero: CanalConfig) => {
    setNumeroErro(null);
    setNumeroOk(null);
    let ia: IaDoNumero | null = null;
    try {
      ia = (await api.get<{ ia: IaDoNumero }>(`/canais/numeros/${numero.id}/ia`)).ia;
    } catch {
      // Sem IA configurada ainda nesta linha — segue com os campos em branco.
    }
    setNumeroForm({
      ...numeroVazio,
      id: numero.id,
      nome: numero.nome ?? '',
      donoId: numero.dono?.id ?? '',
      modo: numero.modo ?? 'OFICIAL',
      filaId: numero.fila?.id ?? '',
      ativo: numero.ativo,
      iaAtiva: ia?.ativa ?? false,
      iaUrlWebhook: ia?.webhook ?? '',
    });
  };

  const cancelarEdicaoNumero = () => {
    setNumeroForm(numeroVazio);
    setNumeroErro(null);
  };

  const salvarNumero = async () => {
    setNumeroErro(null);
    setNumeroOk(null);
    if (!numeroForm.id && !numeroForm.donoId) {
      setNumeroErro('Escolha o vendedor dono do numero');
      return;
    }
    setNumeroOcupado(true);
    try {
      const corpo: Record<string, unknown> = { ativo: numeroForm.ativo, modo: numeroForm.modo };
      if (numeroForm.nome) corpo.nome = numeroForm.nome;
      if (numeroForm.donoId) corpo.donoId = numeroForm.donoId;
      if (numeroForm.filaId) corpo.filaId = numeroForm.filaId;
      // Modo NAO_OFICIAL nao manda campos de ponte: o formulario nao os
      // exibe mais, e o backend herda da configuracao compartilhada quando
      // eles vem em branco — mandar vazio/nulo apagaria credenciais existentes.
      if (numeroForm.modo !== 'NAO_OFICIAL') {
        if (numeroForm.phoneNumberId) corpo.phoneNumberId = numeroForm.phoneNumberId;
        if (numeroForm.accessToken) corpo.accessToken = numeroForm.accessToken;
        if (numeroForm.appSecret) corpo.appSecret = numeroForm.appSecret;
        if (numeroForm.verifyToken) corpo.verifyToken = numeroForm.verifyToken;
      }

      const id = numeroForm.id
        ? (await api.put<{ canal: CanalConfig }>(`/canais/numeros/${numeroForm.id}`, corpo)).canal.id
        : (await api.post<{ canal: CanalConfig }>('/canais/whatsapp/numeros', corpo)).canal.id;

      // IA vai numa chamada separada: e outro recurso, com o proprio
      // liga/desliga — mandar junto faria desligar a IA de uma linha exigir
      // reenviar credencial da Meta que nao mudou em nada.
      if (numeroForm.iaAtiva || numeroForm.iaUrlWebhook || numeroForm.iaSegredo) {
        await api.put(`/canais/numeros/${id}/ia`, {
          iaAtiva: numeroForm.iaAtiva,
          ...(numeroForm.iaUrlWebhook ? { iaUrlWebhook: numeroForm.iaUrlWebhook } : {}),
          ...(numeroForm.iaSegredo ? { iaSegredo: numeroForm.iaSegredo } : {}),
        });
      }

      setNumeroForm(numeroVazio);
      setNumeroOk(numeroForm.id ? 'Numero atualizado.' : 'Numero criado.');
      await carregar();
    } catch (e) {
      setNumeroErro(e instanceof ApiError ? e.message : 'Falha ao salvar numero');
    } finally {
      setNumeroOcupado(false);
    }
  };

  const excluirNumero = (numero: CanalConfig) => {
    confirmar({
      titulo: `Remover o numero de ${numero.dono?.nome}?`,
      descricao: 'Conversas ja existentes so perdem a referencia.',
      variante: 'perigo',
      rotuloConfirmar: 'Remover',
      aoConfirmar: async () => {
        setNumeroErro(null);
        setNumeroOk(null);
        try {
          await api.del(`/canais/numeros/${numero.id}`);
          setNumeroOk('Numero removido.');
          await carregar();
        } catch (e) {
          setNumeroErro(e instanceof ApiError ? e.message : 'Falha ao remover numero');
        }
      },
    });
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
                  {estadoPonte.detalhe && <span className="text-slate-500">{estadoPonte.detalhe}</span>}
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
                        <p className="mt-2 text-slate-500">
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

      {editando === 'WHATSAPP' && (
        <div className="lg:col-span-2">
        <Card
          titulo="Numeros pessoais"
          descricao="Um WhatsApp proprio por vendedor: a conversa nasce ja atribuida a ele, sem passar por fila"
        >
          <div className="space-y-4">
            {numeroErro && <Alerta>{numeroErro}</Alerta>}
            {numeroOk && <Alerta tipo="sucesso">{numeroOk}</Alerta>}

            {numeros.length === 0 ? (
              <EmptyState
                titulo="Nenhum numero pessoal"
                descricao="Cadastre o WhatsApp de um vendedor abaixo — ele passa a atender pelo painel de Atendimento"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="pb-2 font-medium">Vendedor</th>
                      <th className="pb-2 font-medium">Numero</th>
                      <th className="pb-2 font-medium">Fila de espera</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {numeros.map((n) => (
                      <Fragment key={n.id}>
                        <tr>
                          <td className="py-2 pr-2 text-slate-800">{n.dono?.nome}</td>
                          <td className="py-2 pr-2 text-slate-600">{n.phoneNumberId ?? n.ponteSessao ?? '—'}</td>
                          <td className="py-2 pr-2 text-slate-600">{n.fila?.nome ?? 'nenhuma (linha direta)'}</td>
                          <td className="py-2 pr-2">
                            <div className="flex flex-wrap gap-1">
                              {n.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge>Inativo</Badge>}
                              {n.modo === 'NAO_OFICIAL' && n.ponteStatus === 'CONECTADO' && (
                                <Badge tom="sucesso">Conectado</Badge>
                              )}
                              {n.modo === 'NAO_OFICIAL' && n.ponteStatus === 'DESCONECTADO' && (
                                <Badge tom="alerta">Desconectado</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              {n.modo === 'NAO_OFICIAL' && (
                                <Button
                                  variante="neutro"
                                  onClick={() => setLinhaAberta(linhaAberta === n.id ? null : n.id)}
                                >
                                  {linhaAberta === n.id ? 'Fechar' : 'Conectar'}
                                </Button>
                              )}
                              <Button variante="neutro" onClick={() => void editarNumero(n)}>Editar</Button>
                              <Button variante="perigo" onClick={() => void excluirNumero(n)}>Remover</Button>
                            </div>
                          </td>
                        </tr>
                        {linhaAberta === n.id && (
                          <tr>
                            <td colSpan={5} className="bg-slate-50 px-2 py-3">
                              {estadoLinha && (
                                <p className="mb-2 flex items-center gap-2 text-xs">
                                  <span className="text-slate-500">Sessao:</span>
                                  <Badge
                                    tom={
                                      estadoLinha.situacao === 'CONECTADO'
                                        ? 'sucesso'
                                        : estadoLinha.situacao === 'DESCONECTADO'
                                          ? 'alerta'
                                          : 'neutro'
                                    }
                                  >
                                    {estadoLinha.situacao === 'CONECTADO'
                                      ? 'conectada'
                                      : estadoLinha.situacao === 'DESCONECTADO'
                                        ? 'desconectada'
                                        : 'nao confirmada'}
                                  </Badge>
                                </p>
                              )}
                              {qrLinha?.conectado ? (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-sm text-slate-700">
                                    <span className="font-medium text-emerald-700">Numero conectado.</span>
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => trocarLinha(n)}
                                    disabled={trocandoLinha}
                                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {trocandoLinha ? 'Desconectando...' : 'Trocar de numero'}
                                  </button>
                                </div>
                              ) : qrLinha?.qr ? (
                                <div className="flex flex-wrap items-center gap-4">
                                  <img
                                    src={qrLinha.qr}
                                    alt={`QR Code para conectar o WhatsApp de ${n.dono?.nome}`}
                                    width={180}
                                    height={180}
                                    className="rounded border border-slate-200"
                                  />
                                  <p className="text-xs text-slate-600">
                                    Peca para {n.dono?.nome} abrir o WhatsApp, tocar em{' '}
                                    <strong>Aparelhos conectados</strong> e apontar a camera para este codigo.
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  {qrLinha?.motivo ?? 'Gerando o QR Code...'}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="mb-3 text-xs font-medium text-slate-700">
                {numeroForm.id ? 'Editar numero' : 'Adicionar numero'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vendedor" hint="Quem recebe as conversas deste numero">
                  <Select
                    value={numeroForm.donoId}
                    disabled={Boolean(numeroForm.id)}
                    onChange={(e) => setNumeroForm({ ...numeroForm, donoId: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Rotulo" hint="Como este numero aparece na lista">
                  <Input
                    value={numeroForm.nome}
                    placeholder="Ex.: Vendedor 1"
                    onChange={(e) => setNumeroForm({ ...numeroForm, nome: e.target.value })}
                  />
                </Field>
                <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-700">Como este vendedor conecta</p>
                  <div className="mt-2 flex gap-4">
                    {(['OFICIAL', 'NAO_OFICIAL'] as const).map((opcao) => (
                      <label key={opcao} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="modo-numero"
                          value={opcao}
                          checked={numeroForm.modo === opcao}
                          onChange={() => setNumeroForm({ ...numeroForm, modo: opcao })}
                        />
                        {opcao === 'OFICIAL' ? 'API oficial (Meta)' : 'Ponte (QR Code)'}
                      </label>
                    ))}
                  </div>
                </div>

                {numeroForm.modo === 'NAO_OFICIAL' ? (
                  <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    As configuracoes de conexao sao definidas automaticamente pela configuracao do
                    WhatsApp da empresa. Depois de salvar, use o botao "Conectar" para escanear o QR Code.
                  </div>
                ) : (
                  <>
                    <Field label="Phone Number ID">
                      <Input
                        value={numeroForm.phoneNumberId}
                        onChange={(e) => setNumeroForm({ ...numeroForm, phoneNumberId: e.target.value })}
                      />
                    </Field>
                    <Field label="Access Token" hint="Nunca e exibido de volta">
                      <Input
                        type="password"
                        value={numeroForm.accessToken}
                        onChange={(e) => setNumeroForm({ ...numeroForm, accessToken: e.target.value })}
                      />
                    </Field>
                    <Field label="App Secret">
                      <Input
                        type="password"
                        value={numeroForm.appSecret}
                        onChange={(e) => setNumeroForm({ ...numeroForm, appSecret: e.target.value })}
                      />
                    </Field>
                    <Field label="Verify Token">
                      <Input
                        value={numeroForm.verifyToken}
                        onChange={(e) => setNumeroForm({ ...numeroForm, verifyToken: e.target.value })}
                      />
                    </Field>
                  </>
                )}
                <Field
                  label="Fila de espera (opcional)"
                  hint="Deixe vazio: a conversa vai direto para o vendedor, sem espera"
                >
                  <Select
                    value={numeroForm.filaId}
                    onChange={(e) => setNumeroForm({ ...numeroForm, filaId: e.target.value })}
                  >
                    <option value="">Nenhuma — direto para o vendedor</option>
                    {filas.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={numeroForm.iaAtiva}
                    onChange={(e) => setNumeroForm({ ...numeroForm, iaAtiva: e.target.checked })}
                  />
                  IA responde por este numero antes do vendedor
                </label>
                {numeroForm.iaAtiva && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Webhook do motor de IA">
                      <Input
                        value={numeroForm.iaUrlWebhook}
                        placeholder="https://whatsbot/api/webhook/plataforma/..."
                        onChange={(e) => setNumeroForm({ ...numeroForm, iaUrlWebhook: e.target.value })}
                      />
                    </Field>
                    <Field label="Segredo de assinatura" hint="Nunca e exibido de volta">
                      <Input
                        type="password"
                        value={numeroForm.iaSegredo}
                        onChange={(e) => setNumeroForm({ ...numeroForm, iaSegredo: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={numeroForm.ativo}
                    onChange={(e) => setNumeroForm({ ...numeroForm, ativo: e.target.checked })}
                  />
                  Ativo
                </label>
                <Button disabled={numeroOcupado} onClick={() => void salvarNumero()}>
                  {numeroForm.id ? 'Salvar alteracoes' : 'Adicionar numero'}
                </Button>
                {numeroForm.id && (
                  <Button variante="neutro" disabled={numeroOcupado} onClick={cancelarEdicaoNumero}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
        </div>
      )}

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

        <p className="mt-3 text-xs text-slate-500">
          Opcionais: <code>data-fila="&lt;id&gt;"</code> direciona para uma fila especifica e{' '}
          <code>data-titulo="..."</code> troca o texto do botao.
        </p>
      </Card>
    </div>
  );
}
