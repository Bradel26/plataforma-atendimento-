import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { CANAIS_IA, type Canal, type EstadoIa, type TokenIntegracao } from '../../lib/types';

/**
 * Ponte com o motor de IA externo (o whatsbot-pro, pelo plugin `plataforma`).
 *
 * Duas metades, e as duas moram aqui porque nenhuma funciona sozinha: o token e
 * como o motor entra na plataforma; a configuracao do canal e para onde a
 * plataforma manda o que chega. Faltando qualquer uma, o agente nao responde.
 */

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export function IaTab() {
  const [tokens, setTokens] = useState<TokenIntegracao[]>([]);
  const [nome, setNome] = useState('');
  /** Valor em claro do token recem-criado. Existe so nesta sessao de tela. */
  const [novoToken, setNovoToken] = useState<string | null>(null);

  const [canal, setCanal] = useState<Canal>('WHATSAPP');
  const [estado, setEstado] = useState<EstadoIa | null>(null);
  const [webhook, setWebhook] = useState('');
  const [segredo, setSegredo] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /**
   * Trocar o canal dispara uma busca, e a resposta reescreve webhook e segredo.
   * Sem travar os campos, quem comeca a digitar durante a troca perde o que
   * escreveu quando ela volta — e nao ha aviso nenhum de que isso aconteceu.
   */
  const [carregandoCanal, setCarregandoCanal] = useState(true);
  /**
   * Revogados ficam escondidos.
   *
   * Revogar nao apaga — o registro e a trilha de que aquele token existiu. Mas
   * numa instalacao com meses de uso os revogados passam de longe os ativos, e a
   * pergunta de todo dia e "quais estao valendo".
   */
  const [verRevogados, setVerRevogados] = useState(false);

  const carregarTokens = useCallback(async () => {
    try {
      const { tokens: lista } = await api.get<{ tokens: TokenIntegracao[] }>('/integracoes/tokens');
      setTokens(lista);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os tokens');
    }
  }, []);

  /**
   * Espelho do canal selecionado, para a resposta saber se ainda interessa.
   *
   * Duas buscas em voo voltam fora de ordem, e a ultima a chegar escreve na
   * tela: sem guarda, a tela mostrava o estado de OUTRO canal — "IA ligada" num
   * canal desligado, com o webhook errado no campo.
   *
   * A comparacao e com o canal *selecionado*, e nao com a ultima busca
   * iniciada. Guardando a ultima busca, o efeito dobrado do StrictMode inverte
   * a ordem — a montagem dispara a busca do canal inicial depois da troca — e a
   * guarda passa a descartar justamente a resposta certa. Foi um teste de
   * navegador que expos isso, comparando o que a tela dizia com o banco.
   */
  const canalNaTela = useRef(canal);
  canalNaTela.current = canal;

  const carregarCanal = useCallback(async (qual: Canal) => {
    setCarregandoCanal(true);
    try {
      const { ia } = await api.get<{ ia: EstadoIa }>(`/canais/${qual}/ia`);
      if (canalNaTela.current !== qual) return;
      setEstado(ia);
      setWebhook(ia.webhook ?? '');
      // Segredo nunca volta da API: campo vazio significa "manter o atual".
      setSegredo('');
    } catch (e) {
      if (canalNaTela.current !== qual) return;
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a ponte deste canal');
    } finally {
      if (canalNaTela.current === qual) setCarregandoCanal(false);
    }
  }, []);

  useEffect(() => {
    void carregarTokens();
  }, [carregarTokens]);

  useEffect(() => {
    void carregarCanal(canal);
  }, [canal, carregarCanal]);

  const criar = async () => {
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      const { valor } = await api.post<{ valor: string }>('/integracoes/tokens', { nome: nome.trim() });
      setNovoToken(valor);
      setNome('');
      await carregarTokens();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao criar o token');
    } finally {
      setOcupado(false);
    }
  };

  const revogar = async (token: TokenIntegracao) => {
    setErro(null);
    setOk(null);
    try {
      await api.del(`/integracoes/tokens/${token.id}`);
      // Se o valor visivel na tela e justamente o revogado, para de mostrar.
      if (novoToken?.startsWith(token.prefixo)) setNovoToken(null);
      await carregarTokens();
      setOk(`Token "${token.nome}" revogado. Deixa de funcionar na proxima chamada.`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao revogar');
    }
  };

  const salvarPonte = async (ativa: boolean) => {
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      const { ia } = await api.put<{ ia: EstadoIa }>(`/canais/${canal}/ia`, {
        iaAtiva: ativa,
        iaUrlWebhook: webhook.trim() || null,
        ...(segredo.trim() ? { iaSegredo: segredo.trim() } : {}),
      });
      setEstado(ia);
      setSegredo('');
      setOk(ativa ? `IA ligada no canal ${canal}.` : `IA desligada no canal ${canal}.`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar');
    } finally {
      setOcupado(false);
    }
  };

  const podeLigar = Boolean(webhook.trim()) && (Boolean(segredo.trim()) || Boolean(estado?.assinado));
  const revogados = tokens.filter((t) => !t.ativo).length;
  const visiveis = verRevogados ? tokens : tokens.filter((t) => t.ativo);

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}
      {ok && <Alerta tipo="sucesso">{ok}</Alerta>}

      <Card
        titulo="Ponte por canal"
        descricao="Para onde a plataforma entrega o que chega, e com que segredo assina a entrega"
      >
        <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
          <Field label="Canal">
            <Select
              value={canal}
              onChange={(e) => {
                // Trava no mesmo render da troca. Deixar para o efeito ligar a
                // trava abre uma janela de um render em que os campos ainda
                // aceitam texto — e esse texto e apagado quando a busca volta.
                setCarregandoCanal(true);
                setCanal(e.target.value as Canal);
              }}
            >
              {CANAIS_IA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tom={estado?.ativa ? 'sucesso' : 'neutro'}>
                {estado?.ativa ? 'IA ligada' : 'IA desligada'}
              </Badge>
              <Badge tom={estado?.assinado ? 'sucesso' : 'alerta'}>
                {estado?.assinado ? 'Entrega assinada' : 'Sem segredo'}
              </Badge>
              {estado ? (
                <Badge>
                  {estado.janelaHoras > 0 ? `Janela de ${estado.janelaHoras}h` : 'Sem janela'}
                </Badge>
              ) : null}
            </div>

            <Field
              label="Webhook do motor de IA"
              hint="A URL que o painel do WhatsBot mostra depois de criar o canal la."
            >
              <Input
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                disabled={carregandoCanal}
                placeholder="https://whatsbot.suaempresa.com.br/api/webhook/plataforma/<id-do-canal>"
              />
            </Field>

            <Field
              label="Segredo de assinatura"
              hint={
                estado?.assinado
                  ? 'Ja existe um segredo gravado. Deixe vazio para manter; preencha para trocar.'
                  : 'O mesmo valor configurado como webhook_secret no canal do WhatsBot. Minimo 16 caracteres.'
              }
            >
              <Input
                type="password"
                value={segredo}
                onChange={(e) => setSegredo(e.target.value)}
                disabled={carregandoCanal}
                placeholder={estado?.assinado ? '••••••••' : 'openssl rand -hex 24'}
                autoComplete="new-password"
              />
            </Field>

            <div className="flex flex-wrap justify-end gap-2">
              {estado?.ativa && (
                <Button
                  variante="neutro"
                  disabled={ocupado || carregandoCanal}
                  onClick={() => void salvarPonte(false)}
                >
                  Desligar a IA
                </Button>
              )}
              <Button disabled={ocupado || carregandoCanal || !podeLigar} onClick={() => void salvarPonte(true)}>
                {estado?.ativa ? 'Salvar' : 'Ligar a IA'}
              </Button>
            </div>

            {!podeLigar && (
              <p className="text-right text-xs text-slate-400">
                Informe o webhook e o segredo para poder ligar.
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Com a IA ligada e entregando, o <strong>Chatbot</strong> por palavras-chave cala neste canal
          — dois bots respondendo a mesma mensagem e pior que nenhum. Fora da janela do canal, o
          agente nao manda texto livre: so template aprovado, enviado pela propria plataforma.
        </p>
      </Card>

      <Card
        titulo="Tokens de integracao"
        descricao="Como o motor de IA entra na plataforma. Um token por integracao, revogavel um a um."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nome da integracao">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="whatsbot-pro"
              maxLength={80}
            />
          </Field>
          <Button disabled={ocupado || nome.trim().length < 3} onClick={() => void criar()}>
            Criar token
          </Button>
        </div>

        {novoToken && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-xs font-medium text-amber-700">
              Copie agora. Este valor nao aparece de novo — se perder, revogue e crie outro.
            </p>
            {/* `readOnly` e nao texto solto: o campo permite selecionar tudo com
                um clique, e o valor nao pode ser editado por engano antes de
                alguem copiar. */}
            <Input
              readOnly
              value={novoToken}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setNovoToken(null)}
              className="mt-2 text-xs font-medium text-amber-700 hover:underline"
            >
              Ja copiei, esconder
            </button>
          </div>
        )}

        <div className="mt-4">
          {tokens.length === 0 ? (
            <EmptyState
              titulo="Nenhum token"
              descricao="Crie um token para o motor de IA poder responder pela plataforma."
            />
          ) : visiveis.length === 0 ? (
            <EmptyState
              titulo="Nenhum token ativo"
              descricao="Todos os tokens desta instalacao foram revogados. Crie um novo para religar a ponte."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visiveis.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{t.nome}</p>
                      <Badge tom={t.ativo ? 'sucesso' : 'neutro'}>{t.ativo ? 'Ativo' : 'Revogado'}</Badge>
                      <span className="font-mono text-xs text-slate-400">{t.prefixo}…</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Criado em {dataHora(t.criadoEm)}
                      {/* Ultimo uso e o que responde "esse token ainda esta em
                          producao?" na hora de limpar a lista. */}
                      {t.ultimoUsoEm ? ` · usado em ${dataHora(t.ultimoUsoEm)}` : ' · nunca usado'}
                    </p>
                  </div>
                  {t.ativo && (
                    <Button variante="perigo" onClick={() => void revogar(t)}>
                      Revogar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {revogados > 0 && (
            <button
              type="button"
              onClick={() => setVerRevogados((v) => !v)}
              aria-expanded={verRevogados}
              className="mt-3 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              {verRevogados
                ? 'Esconder revogados'
                : `Mostrar ${revogados} token(s) revogado(s)`}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
