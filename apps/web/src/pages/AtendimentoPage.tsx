import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alerta, Badge, Button, Card, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { CaixaEntradaEquipes } from '../features/atendimento/CaixaEntradaEquipes';
import { ListaConversas } from '../features/atendimento/ListaConversas';
import { ModalTransferir } from '../features/atendimento/ModalTransferir';
import { ModalIniciarConversa } from '../features/atendimento/ModalIniciarConversa';
import { PainelChat } from '../features/atendimento/PainelChat';
import { PainelContato } from '../features/atendimento/PainelContato';
import { useConversas } from '../features/atendimento/useConversas';
import { useCaixaEntrada } from '../features/atendimento/useCaixaEntrada';
import { upsertPrevia } from '../features/atendimento/previas';
import { ConectarWhatsAppCloud } from '../features/atendimento/ConectarWhatsAppCloud';
import { WhatsAppWebCallPanel } from './telefonia/WhatsAppWebCallPanel';
import { clienteAguardandoDesde } from '../features/atendimento/apresentacao';
import { IconeBalao, IconeBusca, IconeChevron, IconeEntrada, IconeMais } from '../features/atendimento/icones';
import {
  LABEL_VISAO_INBOX,
  SEM_FILTRO_ACOMPANHAR,
  visoesDisponiveis,
  type FiltroAcompanhar,
  type VisaoInbox,
} from '../features/atendimento/visao';
import { useAuth } from '../features/auth/AuthProvider';
import { FiltroEtiquetas } from './crm/Etiquetas';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { telefoneLegivel } from '../lib/telefone';
import { useFaixaDeLargura } from '../lib/useFaixaDeLargura';
import type { Acompanhaveis, ConversaDetalhe, Previa } from '../lib/types';

/**
 * Passo do fluxo em telas de uma coluna so (mobile): lista -> conversa ->
 * ficha, sempre uma por vez, com volta explicita — nunca as tres espremidas.
 */
type PassoMobile = 'lista' | 'chat' | 'ficha';

/** Recorte rapido sobre as conversas ja carregadas da aba — nao muda a consulta ao servidor. */
type FiltroRapido = 'TODAS' | 'SEM_RESPOSTA' | 'AGUARDANDO_CLIENTE';
const FILTROS_RAPIDOS: Array<{ id: FiltroRapido; rotulo: string }> = [
  { id: 'TODAS', rotulo: 'Todas' },
  { id: 'SEM_RESPOSTA', rotulo: 'Sem resposta' },
  { id: 'AGUARDANDO_CLIENTE', rotulo: 'Aguardando cliente' },
];

type MinhaLinhaWhatsapp = { id: string; ponteSessao: string | null; modo: string | null; ativo: boolean; nome?: string | null; phoneNumberId?: string | null; whatsappCallingHabilitado?: boolean };

// Lista (esquerda) e ficha (direita) tem faixas proprias — a ficha precisa
// de mais espaco maximo porque "Registrar / agendar" fica cortado em
// larguras estreitas.
const LARGURA_MIN_LISTA = 220;
const LARGURA_MAX_LISTA = 450;
const LARGURA_MIN_FICHA = 260;
const LARGURA_MAX_FICHA = 550;

/**
 * Largura ajustavel por arrasto + recolher, persistida por painel (lista à
 * esquerda, ficha à direita) — só faz sentido no desktop, onde as tres
 * colunas cabem lado a lado; notebook/tablet/mobile já têm layout próprio
 * (`classesLista`/`classesFicha`) que este hook não mexe.
 */
function useLarguraAjustavel(chave: string, padrao: number, min: number, max: number) {
  const [largura, setLargura] = useState(() => {
    try {
      const salva = Number(localStorage.getItem(chave));
      return salva >= min && salva <= max ? salva : padrao;
    } catch {
      return padrao;
    }
  });
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem(`${chave}:recolhida`) === '1';
    } catch {
      return false;
    }
  });

  const salvarLargura = useCallback(
    (valor: number) => {
      setLargura(valor);
      try {
        localStorage.setItem(chave, String(valor));
      } catch {
        // Preferencia de UI, nao dado — sem persistencia se o navegador bloquear.
      }
    },
    [chave],
  );

  const alternarRecolhida = useCallback(() => {
    setRecolhida((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(`${chave}:recolhida`, proximo ? '1' : '0');
      } catch {
        // idem
      }
      return proximo;
    });
  }, [chave]);

  /**
   * `direcao` inverte o sinal do arrasto: a lista (esquerda) cresce puxando
   * pra direita, a ficha (direita) cresce puxando pra esquerda — mesmo
   * puxador, sinal oposto.
   */
  const iniciarArraste = useCallback(
    (e: ReactMouseEvent, direcao: 1 | -1) => {
      e.preventDefault();
      const inicioX = e.clientX;
      const larguraInicial = largura;
      // Sem isto o arrasto seleciona o texto das mensagens por baixo do
      // cursor — o navegador trata o mousemove como selecao de texto por
      // padrao, mesmo com o preventDefault do mousedown acima.
      const estiloAnterior = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const mover = (ev: MouseEvent) => {
        const delta = (ev.clientX - inicioX) * direcao;
        salvarLargura(Math.min(max, Math.max(min, larguraInicial + delta)));
      };
      const soltar = () => {
        document.body.style.userSelect = estiloAnterior;
        window.removeEventListener('mousemove', mover);
        window.removeEventListener('mouseup', soltar);
      };
      window.addEventListener('mousemove', mover);
      window.addEventListener('mouseup', soltar);
    },
    [largura, salvarLargura, min, max],
  );

  return { largura, recolhida, alternarRecolhida, iniciarArraste };
}

/**
 * Puxador vertical entre duas colunas — arrasta para redimensionar. E a
 * propria divisoria de 1px entre os paineis; a area clicavel (`w-2`) invade
 * 4px de cada vizinho (`-mx-1`) para facilitar o clique sem engrossar a linha.
 */
function Puxador({ onArrastar, titulo }: { onArrastar: (e: ReactMouseEvent) => void; titulo: string }) {
  return (
    <div
      onMouseDown={onArrastar}
      role="separator"
      aria-orientation="vertical"
      title={titulo}
      className="group relative z-10 -mx-1 flex w-2 shrink-0 cursor-col-resize items-stretch justify-center self-stretch"
    >
      <div className="w-px bg-slate-200 transition-all group-hover:w-0.5 group-hover:bg-[var(--brand-primary)] group-active:w-0.5 group-active:bg-[var(--brand-primary)]" />
    </div>
  );
}

function Divisoria() {
  return <div className="w-px shrink-0 self-stretch bg-slate-200" aria-hidden="true" />;
}

type QrDaPonte = {
  /** PNG em data URL. Nulo quando nao ha nada para escanear agora. */
  qr: string | null;
  conectado: boolean;
  motivo: string | null;
};

export function AtendimentoPage() {
  const { usuario, temPerfil } = useAuth();
  const mostrar = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ref: containerRef, faixa } = useFaixaDeLargura<HTMLDivElement>();
  const listaAjustavel = useLarguraAjustavel(
    'plataforma:atendimento-largura-lista',
    360,
    LARGURA_MIN_LISTA,
    LARGURA_MAX_LISTA,
  );
  const fichaAjustavel = useLarguraAjustavel(
    'plataforma:atendimento-largura-ficha',
    288,
    LARGURA_MIN_FICHA,
    LARGURA_MAX_FICHA,
  );
  /**
   * Aba do Atendimento (2026-10-05) — Minhas / Fila / Acompanhar, organizadas
   * pelo numero de WhatsApp. Comeca em Fila: e onde ha conversa esperando
   * alguem, o mesmo motivo que fazia "Nao atribuidas" ser a padrao antes.
   */
  const [visao, setVisao] = useState<VisaoInbox>('MINHAS');
  /** ADMIN e SUPERVISOR acompanham outros numeros; a API recusa os demais. */
  const podeAcompanhar = temPerfil('ADMIN', 'SUPERVISOR');
  const [filtroAcompanhar, setFiltroAcompanhar] = useState<FiltroAcompanhar>(SEM_FILTRO_ACOMPANHAR);
  const [acompanhaveis, setAcompanhaveis] = useState<Acompanhaveis | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('TODAS');
  /** Null = automatico: aberta enquanto houver conversa esperando alguem aceitar. */
  const [caixaAberta, setCaixaAberta] = useState<boolean | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  /**
   * Ficha como drawer no notebook/tablet: comeca fechada (a resposta e a
   * tarefa mais frequente, e nao perde espaco pra uma ficha que ninguem pediu
   * ainda), mas fica aberta entre trocas de conversa uma vez que o atendente
   * abriu — reabrir a cada clique custaria mais do que vale.
   */
  const [fichaAberta, setFichaAberta] = useState(false);
  const [passoMobile, setPassoMobile] = useState<PassoMobile>('lista');
  /**
   * Muda quando alguem etiqueta uma conversa, para o catalogo do filtro ser
   * buscado de novo.
   *
   * Sem isto, a etiqueta recem-criada no painel nao apareceria na lista de
   * filtros ate recarregar a pagina — o mesmo defeito que o teste de navegador
   * achou na aba de contatos.
   */
  const [versaoTags, setVersaoTags] = useState(0);
  const [aberta, setAberta] = useState<ConversaDetalhe | null>(null);
  const [aceitandoId, setAceitandoId] = useState<string | null>(null);
  const [transferindo, setTransferindo] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [erroAberta, setErroAberta] = useState<string | null>(null);
  const [previas, setPrevias] = useState<Previa[]>([]);
  const abertaIdRef = useRef<string | null>(null);

  /**
   * Linha pessoal de WhatsApp do proprio usuario logado, e se ela ja esta
   * conectada — self-service para o vendedor conectar o proprio numero sem
   * precisar de um ADMIN em Configuracoes. `null` cobre tanto "ainda nao
   * carregou" quanto "nao tem linha pessoal" (o placeholder de hoje serve
   * igualmente para os dois casos).
   */
  const [minhaLinha, setMinhaLinha] = useState<MinhaLinhaWhatsapp | null>(null);
  const [minhaLinhaConectada, setMinhaLinhaConectada] = useState(false);
  /** Numero conectado na linha pessoal (so digitos), quando o servidor informa. */
  const [numeroConectado, setNumeroConectado] = useState<string | null>(null);
  const [mostrarConectar, setMostrarConectar] = useState(false);
  const [qrConectar, setQrConectar] = useState<QrDaPonte | null>(null);

  /**
   * `carregandoMinhaLinha` evita mostrar "Conectar WhatsApp" por um instante
   * antes do GET /numeros/meu responder — sem isso a tela piscaria o botao de
   * conectar mesmo para quem ja esta conectado, ate a primeira resposta chegar.
   */
  const [carregandoMinhaLinha, setCarregandoMinhaLinha] = useState(true);
  const [conectandoLinha, setConectandoLinha] = useState(false);
  const [desconectandoLinha, setDesconectandoLinha] = useState(false);
  const [erroConectar, setErroConectar] = useState<string | null>(null);
  const [mostrarSucessoConexao, setMostrarSucessoConexao] = useState(false);

  useEffect(() => {
    void api
      .get<{ numero: MinhaLinhaWhatsapp | null }>('/canais/numeros/meu')
      .then(({ numero }) => {
        setMinhaLinha(numero);
        if (numero?.modo === 'OFICIAL' && numero.phoneNumberId) setMinhaLinhaConectada(true);
      })
      .catch(() => undefined)
      .finally(() => setCarregandoMinhaLinha(false));
  }, []);

  // Roda de novo quando a conexao acontece, para trazer o numero que acabou de parear.
  useEffect(() => {
    if (!minhaLinha || minhaLinha.modo !== 'NAO_OFICIAL') return;
    void api
      .get<{ estado: { situacao: string; detalhe: string | null; telefone?: string | null } }>(
        `/canais/numeros/${minhaLinha.id}/ponte/estado`,
      )
      .then(({ estado }) => {
        const conectado = estado.situacao === 'CONECTADO';
        setMinhaLinhaConectada(conectado);
        setNumeroConectado(conectado ? (estado.telefone ?? null) : null);
      })
      .catch(() => undefined);
  }, [minhaLinha, minhaLinhaConectada]);

  /** Insere ou atualiza uma previa recebida por evento de socket — ver `upsertPrevia` (Fase 11.7). */
  const aplicarPrevia = useCallback((p: Previa) => {
    setPrevias((atual) => upsertPrevia(atual, p));
  }, []);

  // Aviso em tempo real de que a propria linha conectou/caiu, e de que uma
  // previa dela foi criada/atualizada — mesmo socket, ja gated por
  // `minhaLinha`: previa so existe para linha pessoal, a mesma condicao.
  useEffect(() => {
    if (!minhaLinha) return;
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.on(EVENTOS.canalStatus, (payload: { id: string; status: string }) => {
      if (payload.id !== minhaLinha.id) return;
      setMinhaLinhaConectada(payload.status === 'CONECTADO');
    });
    // O payload traz `canalConfigId` (usado pelo backend para escopar o
    // destinatario), que `Previa` nao tem — descartado aqui, sem precisar
    // estender o tipo compartilhado por um campo que a tela nunca usa.
    socket.on(EVENTOS.previaAtualizada, ({ canalConfigId: _canalConfigId, ...previa }: Previa & { canalConfigId: string }) => {
      aplicarPrevia(previa);
    });
    return () => {
      socket.disconnect();
    };
  }, [minhaLinha, aplicarPrevia]);

  // Enquanto o card "Conectar WhatsApp" esta aberto, busca o QR e faz
  // polling a cada 5s ate a conexao acontecer — mesmo intervalo de CanaisTab.tsx.
  useEffect(() => {
    if (!mostrarConectar || !minhaLinha) return;
    let vivo = true;

    const buscar = async () => {
      try {
        const r = await api.get<QrDaPonte>(`/canais/numeros/${minhaLinha.id}/ponte/qr`);
        if (!vivo) return;
        setQrConectar(r);
        if (r.conectado) {
          setMinhaLinhaConectada(true);
          setMostrarConectar(false);
        }
      } catch (erro) {
        // Se ainda nao existe QR, mostre a falha da ponte em vez de deixar a
        // tela presa em "Gerando o QR Code...". Preserve um QR ja recebido.
        setQrConectar((atual) => atual?.qr ? atual : {
          qr: null,
          conectado: false,
          motivo: erro instanceof ApiError ? erro.message : 'Não foi possível consultar o conector do WhatsApp. Tente novamente.',
        });
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
  }, [mostrarConectar, minhaLinha]);

  // A conexao confirmada por evento fecha o card mesmo sem o polling ter rodado ainda.
  useEffect(() => {
    if (minhaLinhaConectada) setMostrarConectar(false);
  }, [minhaLinhaConectada]);

  useEffect(() => {
    if (!minhaLinhaConectada) return;
    setMostrarSucessoConexao(true);
    const tempo = setTimeout(() => setMostrarSucessoConexao(false), 4000);
    return () => clearTimeout(tempo);
  }, [minhaLinhaConectada]);

  const semLinhaPessoal = !carregandoMinhaLinha && !minhaLinha;
  const precisaConectarWhatsapp =
    semLinhaPessoal || Boolean(minhaLinha && minhaLinha.modo === 'NAO_OFICIAL' && !minhaLinhaConectada);

  /**
   * "Conectar WhatsApp" de um clique: se a linha pessoal ainda nao existe, cria
   * na hora (self-service — Fase 13.5); se ja existe, so abre o QR. O usuario
   * nunca ve a diferenca entre os dois casos.
   */
  const conectarWhatsapp = useCallback(async () => {
    setErroConectar(null);
    setConectandoLinha(true);
    try {
      // Sempre atualiza a linha antes de buscar o QR. A tela pode ter ficado
      // aberta durante uma troca de sessão/linha; nesse caso, reutilizar o ID
      // antigo fazia o conector responder "Número não encontrado" mesmo com a
      // linha atual cadastrada no servidor.
      let { numero } = await api.get<{ numero: MinhaLinhaWhatsapp | null }>('/canais/numeros/meu');
      if (!numero) {
        ({ numero } = await api.post<{ numero: MinhaLinhaWhatsapp }>('/canais/whatsapp/pessoal/conectar'));
      }
      if (!numero) throw new Error('Não foi possível localizar sua linha do WhatsApp. Atualize a página e tente novamente.');
      setMinhaLinha(numero);
      setMinhaLinhaConectada(false);
      setNumeroConectado(null);
      setMostrarConectar(true);
    } catch (erro) {
      setErroConectar(
        erro instanceof ApiError ? erro.message : 'Não foi possível conectar o WhatsApp. Verifique sua internet e tente novamente.',
      );
    } finally {
      setConectandoLinha(false);
    }
  }, []);

  const atualizarMinhaLinha = useCallback(async () => {
    const { numero } = await api.get<{ numero: MinhaLinhaWhatsapp | null }>('/canais/numeros/meu');
    setMinhaLinha(numero);
    if (numero?.modo === 'OFICIAL' && numero.phoneNumberId) {
      setMinhaLinhaConectada(true);
      setMostrarConectar(false);
      setQrConectar(null);
    }
  }, []);

  const desconectarWhatsapp = useCallback(async () => {
    if (!minhaLinha) return;
    if (!window.confirm('Desconectar seu WhatsApp? Você vai precisar escanear o QR Code de novo para reconectar.')) return;
    setErroConectar(null);
    setDesconectandoLinha(true);
    try {
      await api.post(`/canais/numeros/${minhaLinha.id}/ponte/desconectar`);
      setMinhaLinhaConectada(false);
      setMostrarConectar(false);
      setQrConectar(null);
    } catch (erro) {
      setErroConectar(
        erro instanceof ApiError ? erro.message : 'Não foi possível desconectar agora. Tente novamente.',
      );
    } finally {
      setDesconectandoLinha(false);
    }
  }, [minhaLinha]);

  const {
    conversas,
    contadores,
    carregando,
    erro,
    temMais,
    carregarMais,
    aplicarEvento,
    inscreverMensagens,
    inscreverStatusDeMensagem,
    focarConversa,
    recarregarContadores,
  } = useConversas(visao, tags, usuario?.id ?? null, filtroAcompanhar);
  const caixa = useCaixaEntrada();

  /**
   * Numero de cada aba, com o mesmo filtro da lista dela
   * (`GET /conversas/contadores`). Fila conta so as em espera.
   */
  const contadorDaVisao = (v: VisaoInbox): number | null => contadores[v];

  // Seletor de Acompanhar: so quem pode acompanhar pede a lista.
  useEffect(() => {
    if (!podeAcompanhar) return;
    void api
      .get<Acompanhaveis>('/conversas/acompanhaveis')
      .then(setAcompanhaveis)
      .catch(() => undefined);
  }, [podeAcompanhar]);

  const usuarioAcompanhado = acompanhaveis?.usuarios.find((u) => u.id === filtroAcompanhar.donoId) ?? null;

  useEffect(() => {
    void api
      .get<{ previas: Previa[] }>('/conversas/previas')
      .then(({ previas }) => setPrevias(previas))
      .catch(() => undefined);
  }, []);

  const abrir = useCallback(
    async (id: string) => {
      setErroAberta(null);
      // No mobile, abrir uma conversa e o gesto que avanca da lista pro chat —
      // sem isto a pessoa tocaria na conversa e continuaria olhando a lista.
      setPassoMobile('chat');
      try {
        const { conversa } = await api.get<{ conversa: ConversaDetalhe }>(`/conversas/${id}`);
        focarConversa(id, abertaIdRef.current);
        abertaIdRef.current = id;
        setAberta(conversa);

        if (conversa.naoLidas > 0) {
          const { conversa: lida } = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${id}/ler`);
          setAberta(lida);
          aplicarEvento(lida);
        }
      } catch (err) {
        setErroAberta(err instanceof ApiError ? err.message : 'Não foi possível abrir a conversa');
      }
    },
    [aplicarEvento, focarConversa],
  );

  const aceitar = useCallback(
    async (id: string) => {
      setAceitandoId(id);
      try {
        const { conversa } = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${id}/assumir`);
        mostrar('sucesso', 'Conversa movida para a lista de chats.');
        aplicarEvento(conversa);
        setVisao(conversa.linha?.donoId === usuario?.id ? 'MINHAS' : 'ATRIBUIDAS');
        await abrir(id);
      } catch (e) {
        mostrar('erro', e instanceof ApiError ? e.message : 'Não foi possível aceitar a conversa');
        void caixa.recarregar();
      } finally {
        setAceitandoId(null);
      }
    },
    [abrir, aplicarEvento, caixa.recarregar, mostrar, usuario?.id],
  );

  /**
   * Abre uma previa: reaproveita o Contact existente por telefone, ou cria um
   * minimo -- a ficha completa o vendedor preenche depois, no CRM, se quiser;
   * a prioridade aqui e nao bloquear a conversa por falta de cadastro.
   */
  const abrirPrevia = useCallback(
    async (previa: Previa) => {
      setErroAberta(null);
      try {
        const { contato } = await api.post<{ contato: { id: string } }>('/contatos/por-telefone', {
          telefone: previa.numero,
          nome: previa.nome,
        });
        const { conversa } = await api.post<{ conversa: { id: string } }>('/conversas', { contatoId: contato.id });
        setPrevias((atual) => atual.filter((p) => p.id !== previa.id));
        await abrir(conversa.id);
      } catch (err) {
        setErroAberta(err instanceof ApiError ? err.message : 'Não foi possível abrir a conversa');
      }
    },
    [abrir],
  );

  /**
   * Chega aqui vindo do botao "Iniciar conversa" da ficha do contato
   * (`/atendimento?conversa=<id>`): abre a conversa direto, sem exigir clique
   * na lista. Limpa o parametro logo depois — sem isso, um F5 reabriria a
   * mesma conversa toda vez.
   */
  useEffect(() => {
    const id = searchParams.get('conversa');
    if (!id) return;
    void abrir(id);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Mensagens novas entram direto na conversa aberta, sem recarregar.
  useEffect(
    () =>
      inscreverMensagens(({ conversaId, mensagem }) => {
        setAberta((atual) => {
          if (!atual || atual.id !== conversaId) return atual;
          if (atual.mensagens.some((m) => m.id === mensagem.id)) return atual;
          return { ...atual, mensagens: [...atual.mensagens, mensagem] };
        });
        void recarregarContadores().catch(() => undefined);
      }),
    [inscreverMensagens, recarregarContadores],
  );

  // Ack do provider (entregue, lida) numa mensagem ja exibida na conversa aberta.
  useEffect(
    () =>
      inscreverStatusDeMensagem(({ conversaId, mensagemId, status }) => {
        setAberta((atual) => {
          if (!atual || atual.id !== conversaId) return atual;
          return {
            ...atual,
            mensagens: atual.mensagens.map((m) => (m.id === mensagemId ? { ...m, status } : m)),
          };
        });
      }),
    [inscreverStatusDeMensagem],
  );

  const aoMudar = useCallback(
    (detalhe: ConversaDetalhe) => {
      setAberta(detalhe);
      aplicarEvento(detalhe);
      // Qualquer mudanca na conversa aberta pode ter sido uma etiqueta nova.
      // Incrementar sempre e mais barato que comparar as listas, e o custo e uma
      // consulta ao catalogo — que a tela ja faria ao mudar de filtro.
      setVersaoTags((v) => v + 1);
    },
    [aplicarEvento],
  );

  const alternarTag = useCallback(
    (tag: string) => setTags((atual) => (atual.includes(tag) ? atual.filter((t) => t !== tag) : [...atual, tag])),
    [],
  );

  const porBusca = busca.trim()
    ? conversas.filter((c) => {
        const t = busca.trim().toLowerCase();
        return (
          c.contato.nome.toLowerCase().includes(t) ||
          (c.contato.email ?? '').toLowerCase().includes(t) ||
          (c.ultimaMensagem?.conteudo ?? '').toLowerCase().includes(t)
        );
      })
    : conversas;

  const passaNoFiltroRapido = (c: (typeof conversas)[number], f: FiltroRapido) => {
    if (f === 'SEM_RESPOSTA') return Boolean(c.ultimaMensagem && clienteAguardandoDesde(c.status, [c.ultimaMensagem]));
    if (f === 'AGUARDANDO_CLIENTE') return c.status === 'AGUARDANDO_CLIENTE';
    return true;
  };
  const filtradas = porBusca.filter((c) => passaNoFiltroRapido(c, filtroRapido));
  // Com mais paginas por carregar, a contagem local seria so parcial — melhor nao mostrar numero nenhum.
  const contagemRapida = (f: FiltroRapido): number | null =>
    temMais ? null : porBusca.filter((c) => passaNoFiltroRapido(c, f)).length;
  const caixaVisivel = caixaAberta ?? caixa.total > 0;

  /*
   * Quatro faixas, quatro composicoes — nao a mesma coluna de sempre so
   * encolhendo:
   *
   * - desktop (>=1440 de CONTEUDO, medido no container): as tres colunas
   *   lado a lado, como sempre foi.
   * - notebook/tablet (1024-1439 / 768-1023): lista + chat lado a lado; a
   *   ficha vira um painel que abre por baixo do botao "Ficha do contato" no
   *   cabecalho do chat, e some sem perder a conversa por baixo.
   * - mobile (<768): uma tela por vez — lista, chat ou ficha — com volta
   *   explicita, nunca as tres espremidas.
   */
  const emMobile = faixa === 'mobile';
  const mostrarLista = !emMobile || passoMobile === 'lista';
  const mostrarChat = !emMobile || passoMobile === 'chat';
  const fichaVisivel = Boolean(aberta) && (faixa === 'desktop' || (emMobile ? passoMobile === 'ficha' : fichaAberta));

  const alternarFicha = emMobile ? () => setPassoMobile('ficha') : () => setFichaAberta((v) => !v);
  const fecharFicha = emMobile ? () => setPassoMobile('chat') : () => setFichaAberta(false);

  const emDesktop = faixa === 'desktop';
  const classesLista = emMobile ? 'w-full' : faixa === 'tablet' ? 'w-64 shrink-0' : 'w-80 shrink-0';
  const classesFicha = emMobile ? 'w-full' : 'w-72 shrink-0';
  // No desktop a largura vira inline style (arrastavel); nos outros tamanhos
  // continua a classe fixa de sempre — o recurso so existe onde as tres
  // colunas cabem lado a lado.
  const larguraListaEstilo = emDesktop
    ? { width: listaAjustavel.recolhida ? 44 : listaAjustavel.largura, flexShrink: 0 }
    : undefined;
  const larguraFichaEstilo = emDesktop
    ? { width: fichaAjustavel.recolhida ? 44 : fichaAjustavel.largura, flexShrink: 0 }
    : undefined;

  return (
    <div
      ref={containerRef}
      className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {mostrarLista && (
        <section
          aria-label="Conversas"
          className={`flex ${emDesktop ? '' : classesLista} min-w-0 flex-col overflow-hidden bg-white`}
          style={larguraListaEstilo}
        >
          {emDesktop && listaAjustavel.recolhida ? (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={listaAjustavel.alternarRecolhida}
                title="Expandir lista de conversas"
                aria-label="Expandir lista de conversas"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                »
              </button>
            </div>
          ) : (
          <>
          {/*
            Caixa de entrada das equipes: antes uma coluna inteira so para ela,
            quase sempre com "Sem equipe" e nada mais. Agora e um bloco no topo
            da lista que abre sozinho quando ha conversa esperando alguem aceitar.
          */}
          <div className="border-b border-slate-100">
            <button
              type="button"
              onClick={() => setCaixaAberta(!caixaVisivel)}
              aria-expanded={caixaVisivel}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-slate-700 transition hover:bg-slate-50"
            >
              <IconeEntrada tamanho={16} className="text-slate-500" />
              <span className="font-semibold">Caixa de entrada</span>
              {caixa.total > 0 ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  {caixa.total} aguardando
                </span>
              ) : (
                <span className="text-xs text-slate-500">{caixa.carregando ? 'carregando…' : 'nenhuma nova'}</span>
              )}
              <IconeChevron tamanho={16} className={`ml-auto text-slate-500 transition ${caixaVisivel ? 'rotate-180' : ''}`} />
            </button>
            {caixaVisivel && (
              <div className="max-h-64 overflow-y-auto border-t border-slate-100">
                <CaixaEntradaEquipes
                  grupos={caixa.grupos}
                  carregando={caixa.carregando}
                  erro={caixa.erro}
                  aceitandoId={aceitandoId}
                  onAceitar={(id) => void aceitar(id)}
                  semCabecalho
                />
              </div>
            )}
          </div>

          <div className="space-y-3 border-b border-slate-100 p-3">
            <div
              role="tablist"
              aria-label="Visão da caixa"
              className="flex gap-1 rounded-lg bg-slate-100 p-1"
            >
              {visoesDisponiveis(podeAcompanhar).map((v) => {
                const ativa = visao === v;
                const n = contadorDaVisao(v);
                return (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={ativa}
                    onClick={() => setVisao(v)}
                    className={`flex h-8 min-w-0 flex-auto items-center justify-center gap-1 rounded-md px-1.5 text-xs transition ${
                      ativa ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'font-medium text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span className="truncate">{LABEL_VISAO_INBOX[v]}</span>
                    {n !== null && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 text-[11px] tabular-nums ${
                          ativa ? 'bg-[var(--brand-primary)] font-semibold texto-sobre-cor-fixa' : 'text-slate-500'
                        }`}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <label className="relative flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-400 transition focus-within:border-[var(--brand-primary)]">
                <IconeBusca tamanho={16} />
                <span className="sr-only">Buscar conversas</span>
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por contato ou mensagem"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </label>
              <button
                type="button"
                title="Iniciar nova conversa"
                aria-label="Iniciar nova conversa"
                onClick={() => setIniciando(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700"
              >
                <IconeMais tamanho={18} />
              </button>
              {emDesktop && (
                <button
                  type="button"
                  onClick={listaAjustavel.alternarRecolhida}
                  title="Recolher lista de conversas"
                  aria-label="Recolher lista de conversas"
                  className="flex h-10 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  «
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5" aria-label="Filtro rápido">
              {FILTROS_RAPIDOS.map((f) => {
                const ativo = filtroRapido === f.id;
                const n = contagemRapida(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltroRapido(f.id)}
                    className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium transition ${
                      ativo
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {f.rotulo}
                    {n !== null && <span className="tabular-nums opacity-75">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {visao === 'ACOMPANHAR' && (
            <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2">
              <Select
                aria-label="Acompanhar conversas de"
                value={filtroAcompanhar.donoId ?? ''}
                onChange={(e) => setFiltroAcompanhar({ donoId: e.target.value || null, canalConfigId: null })}
              >
                <option value="">Todos os usuários permitidos</option>
                {acompanhaveis?.empresa && <option value="EMPRESA">Número da empresa</option>}
                {acompanhaveis?.usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </Select>
              {usuarioAcompanhado && usuarioAcompanhado.numeros.length > 1 && (
                <Select
                  aria-label="Número"
                  value={filtroAcompanhar.canalConfigId ?? ''}
                  onChange={(e) => setFiltroAcompanhar({ ...filtroAcompanhar, canalConfigId: e.target.value || null })}
                >
                  <option value="">Todos os números de {usuarioAcompanhado.nome}</option>
                  {usuarioAcompanhado.numeros.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          {/*
            O filtro fica fora da area que rola, junto da busca e das abas: ele
            descreve o que a lista mostra, e rolar junto com o resultado o
            esconderia justamente quando a pessoa procura por que a lista esta
            curta. `FiltroEtiquetas` devolve null quando nao ha etiqueta nenhuma,
            entao nao ocupa espaco antes de existir a primeira.
          */}
          <div className="border-b border-slate-100 px-3 py-2 empty:hidden">
            <FiltroEtiquetas ativas={tags} aoAlternar={alternarTag} campo="conversas" versao={versaoTags} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {erro ? (
              <div className="p-4"><Alerta>{erro}</Alerta></div>
            ) : visao === 'MINHAS' && !carregandoMinhaLinha && minhaLinha === null && !carregando && filtradas.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Você não tem um número de WhatsApp conectado. Use “Conectar WhatsApp” para trazer suas conversas para cá.
              </p>
            ) : (
              <ListaConversas
                conversas={filtradas}
                // Previa e o espelho do meu celular: pertence a Minhas. Nao e
                // atendimento formal, entao sai de qualquer filtro rapido.
                previas={visao === 'MINHAS' && filtroRapido === 'TODAS' ? previas : []}
                usuarioId={usuario?.id ?? null}
                onAbrirPrevia={(p) => void abrirPrevia(p)}
                selecionadaId={aberta?.id ?? null}
                onSelecionar={(id) => void abrir(id)}
                carregando={carregando}
                temMais={temMais}
                onCarregarMais={() => void carregarMais()}
              />
            )}
          </div>
          </>
          )}
        </section>
      )}

      {mostrarLista && mostrarChat && (
        emDesktop && !listaAjustavel.recolhida
          ? <Puxador titulo="Arrastar para redimensionar a lista" onArrastar={(e) => listaAjustavel.iniciarArraste(e, 1)} />
          : <Divisoria />
      )}

      {mostrarChat && (
        <section aria-label="Conversa" className="min-w-0 flex-1 overflow-hidden bg-white">
          {erroAberta ? (
            <div className="p-5"><Alerta>{erroAberta}</Alerta></div>
          ) : aberta ? (
            <PainelChat
              conversa={aberta}
              onMudou={aoMudar}
              aoTransferir={() => setTransferindo(true)}
              aoVoltarParaLista={emMobile ? () => setPassoMobile('lista') : undefined}
              aoAlternarFicha={faixa === 'desktop' ? undefined : alternarFicha}
              fichaAberta={fichaVisivel}
            />
          ) : precisaConectarWhatsapp ? (
            <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-8">
              <div className="w-full max-w-sm">
                <Card>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Badge tom={erroConectar ? 'erro' : mostrarConectar ? 'alerta' : 'erro'}>
                      {erroConectar ? '⚠️ Erro' : mostrarConectar ? '🟡 Conectando' : '🔴 Não conectado'}
                    </Badge>

                    {!mostrarConectar ? (
                      <>
                        <h2 className="text-base font-semibold text-slate-800">Conecte seu WhatsApp ao Atendimento</h2>
                        <p className="text-xs text-slate-500">
                          Receba e responda as mensagens dos seus clientes diretamente por aqui.
                        </p>
                        {erroConectar && (
                          <div className="w-full">
                            <Alerta>{erroConectar}</Alerta>
                          </div>
                        )}
                        <Button
                          type="button"
                          onClick={() => void conectarWhatsapp()}
                          disabled={conectandoLinha}
                          className="mt-1 w-full"
                        >
                          {conectandoLinha ? 'Conectando...' : erroConectar ? 'Tentar novamente' : 'Conectar WhatsApp'}
                        </Button>
                        <div className="w-full border-t border-slate-100 pt-3">
                          <p className="mb-2 text-left text-xs font-medium text-slate-700">Alternativa: API Oficial (sem QR)</p>
                          <ConectarWhatsAppCloud onConnected={() => void atualizarMinhaLinha()} />
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className="text-base font-semibold text-slate-800">Escaneie o QR Code pelo WhatsApp</h2>
                        {qrConectar?.qr ? (
                          <>
                            <img
                              src={qrConectar.qr}
                              alt="QR Code do WhatsApp"
                              className="h-56 w-56 rounded-lg border border-slate-200"
                            />
                            <ol className="w-full space-y-1 text-left text-xs text-slate-600">
                              <li>1. Abra o WhatsApp no seu celular</li>
                              <li>
                                2. Toque em <strong>Aparelhos conectados</strong>
                              </li>
                              <li>
                                3. Toque em <strong>Conectar aparelho</strong>
                              </li>
                              <li>4. Aponte a camera para o código acima</li>
                            </ol>
                            <p className="text-xs text-slate-400">Aguardando conexão...</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">{qrConectar?.motivo ?? 'Gerando o QR Code...'}</p>
                        )}
                        <p className="w-full rounded-lg bg-amber-50 p-2 text-left text-xs text-amber-800">
                          O QR conecta uma conta ativa no aplicativo WhatsApp Business. Se este número foi migrado exclusivamente para a API Oficial, ele não poderá ser pareado por QR.
                        </p>
                        <Button
                          type="button"
                          variante="neutro"
                          onClick={() => setMostrarConectar(false)}
                          className="mt-1 w-full"
                        >
                          Cancelar
                        </Button>
                        <div className="w-full border-t border-slate-100 pt-3">
                          <p className="mb-2 text-left text-xs font-medium text-slate-700">Ou migrar para a API Oficial (sem QR)</p>
                          <ConectarWhatsAppCloud onConnected={() => void atualizarMinhaLinha()} />
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-slate-50 px-6 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                <IconeBalao tamanho={22} />
              </span>
              <p className="text-sm font-semibold text-slate-700">Selecione uma conversa</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">Escolha um atendimento na lista ou use + para iniciar uma nova conversa.</p>

              {minhaLinha && minhaLinhaConectada && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  {erroConectar ? (
                    <div className="w-full max-w-xs">
                      <Alerta>{erroConectar}</Alerta>
                    </div>
                  ) : (
                    mostrarSucessoConexao && <Alerta tipo="sucesso">WhatsApp conectado</Alerta>
                  )}
                  <Badge tom="sucesso">🟢 WhatsApp conectado</Badge>
                  {numeroConectado && (
                    <p className="text-sm text-slate-600">
                      Número: <span className="font-medium text-slate-800">{telefoneLegivel(numeroConectado)}</span>
                    </p>
                  )}
                  <Button
                    type="button"
                    variante="neutro"
                    tamanho="sm"
                    disabled={desconectandoLinha}
                    onClick={() => void desconectarWhatsapp()}
                  >
                    {desconectandoLinha ? 'Desconectando...' : 'Desconectar'}
                  </Button>
                  {minhaLinha.modo === 'NAO_OFICIAL' && (
                    <div className="mt-2 w-full max-w-xs text-left">
                      <p className="mb-2 text-xs font-medium text-slate-700">Migrar para a conexão oficial</p>
                      <ConectarWhatsAppCloud onConnected={() => void atualizarMinhaLinha()} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {aberta && (
        <ModalTransferir
          conversa={aberta}
          aberto={transferindo}
          aoFechar={() => setTransferindo(false)}
          aoTransferir={aoMudar}
        />
      )}
      <ModalIniciarConversa aberto={iniciando} aoFechar={() => setIniciando(false)} aoIniciar={(id) => void abrir(id)} />
      {minhaLinha?.modo === 'NAO_OFICIAL' && minhaLinha.ativo && minhaLinhaConectada && (
        <WhatsAppWebCallPanel somenteRecebidas sessao={minhaLinha.ponteSessao ?? 'teste-local'} numeroId={minhaLinha.id} />
      )}

      {/*
        Quem e essa pessoa, sem sair da conversa.

        No desktop e coluna fixa; fora dele e um painel que so ocupa espaco
        quando alguem pediu — reabrir a cada troca de conversa custaria mais
        cliques do que vale, entao o estado fica aberto entre trocas.
      */}
      {fichaVisivel && aberta && !emMobile && (
        emDesktop && !fichaAjustavel.recolhida
          ? <Puxador titulo="Arrastar para redimensionar a ficha" onArrastar={(e) => fichaAjustavel.iniciarArraste(e, -1)} />
          : <Divisoria />
      )}

      {fichaVisivel && aberta && (
        <aside
          aria-label="Ficha do contato"
          className={`flex ${emDesktop ? '' : classesFicha} min-h-0 flex-col overflow-hidden bg-white`}
          style={larguraFichaEstilo}
        >
          {emDesktop && (
            <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5">
              <button
                type="button"
                onClick={fichaAjustavel.alternarRecolhida}
                title={fichaAjustavel.recolhida ? 'Expandir ficha do contato' : 'Recolher ficha do contato'}
                aria-label={fichaAjustavel.recolhida ? 'Expandir ficha do contato' : 'Recolher ficha do contato'}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                {fichaAjustavel.recolhida ? '«' : '»'}
              </button>
              {!fichaAjustavel.recolhida && (
                <span className="pr-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ficha do contato</span>
              )}
            </div>
          )}
          {(!emDesktop || !fichaAjustavel.recolhida) && (
            <PainelContato
              contatoId={aberta.contato.id}
              aoFechar={faixa === 'desktop' ? undefined : fecharFicha}
              conversaId={aberta.id}
              conversaTags={aberta.tags}
              aoMudarConversa={aoMudar}
              conversa={aberta}
            />
          )}
        </aside>
      )}
    </div>
  );
}
