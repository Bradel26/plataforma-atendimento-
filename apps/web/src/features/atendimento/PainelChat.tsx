import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Button } from '../../components/ui';
import { Dropdown } from '../../components/ui/Dropdown';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../auth/AuthProvider';
import { ApiError, api } from '../../lib/api';
import { telefoneLegivel } from '../../lib/telefone';
import { LABEL_CONVERSA_STATUS, type ConversaDetalhe, type Mensagem } from '../../lib/types';
import { AvatarConversa } from './AvatarConversa';
import { CLASSE_STATUS, clienteAguardandoDesde, esperaPorExtenso, rotuloDoDia } from './apresentacao';
import {
  IconeCadeado,
  IconeCheck,
  IconeCopiar,
  IconeEncerrar,
  IconeEnviar,
  IconeMicrofone,
  IconeFicha,
  IconeMaisAcoes,
  IconeRelogio,
  IconeTelefone,
  IconeTransferir,
  IconeVoltar,
  IconeWhatsapp,
} from './icones';
import { BarraDeGravacao, MenuAnexos, ModalCamera, useGravadorDeVoz } from './AnexosEGravacao';
import { microfoneLiberado } from './gravacao';
import { textoDoErroDeEnvio } from './mensagemDeErroDeEnvio';
import { BOTAO_ICONE, BotaoEmoji } from './FerramentasResposta';
import { partesComLinks } from './links';
import { useAtendimentosAnteriores, type BlocoAnterior } from './useAtendimentosAnteriores';

/** Botao redondo de enviar, como o do WhatsApp. */
const BOTAO_ENVIAR =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] texto-sobre-cor-fixa transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

const BOTAO_SECUNDARIO =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function TextoComLinks({ texto }: { texto: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {partesComLinks(texto).map((parte, i) =>
        parte.href ? (
          <a key={i} href={parte.href} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-primary)] underline">
            {parte.texto}
          </a>
        ) : (
          <Fragment key={i}>{parte.texto}</Fragment>
        ),
      )}
    </p>
  );
}

function EventoConversa({ mensagem }: { mensagem: Mensagem }) {
  return (
    <li className="my-2 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
        <IconeCheck tamanho={13} />
        <span className="font-medium">{mensagem.conteudo}</span>
        <span className="tabular-nums text-slate-500">{dataHora(mensagem.criadoEm)}</span>
      </span>
    </li>
  );
}

function SeparadorAnterior({ bloco }: { bloco: BlocoAnterior }) {
  const data = new Date(bloco.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return (
    <li className="my-3 flex justify-center">
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
        {data} - Conversa anterior{bloco.protocolo ? ` - ${bloco.protocolo}` : ''}
      </span>
    </li>
  );
}

function SeparadorDia({ iso }: { iso: string }) {
  return (
    <li className="my-4 flex items-center justify-center gap-3" aria-hidden="true">
      <span className="h-px w-12 bg-slate-200" />
      <span className="rounded-full border border-slate-200 bg-white px-3.5 py-1 text-[11.5px] font-semibold text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {rotuloDoDia(iso)}
      </span>
      <span className="h-px w-12 bg-slate-200" />
    </li>
  );
}

/** Mensagens com um separador sempre que o dia muda. */
function MensagensComDias({ mensagens, nomeContato }: { mensagens: Mensagem[]; nomeContato?: string }) {
  return (
    <>
      {mensagens.map((m, i) => {
        const anterior = mensagens[i - 1];
        const novoDia = !anterior || new Date(anterior.criadoEm).toDateString() !== new Date(m.criadoEm).toDateString();
        return (
          <Fragment key={m.id}>
            {novoDia && <SeparadorDia iso={m.criadoEm} />}
            <Bolha mensagem={m} nomeContato={nomeContato} />
          </Fragment>
        );
      })}
    </>
  );
}

function rotuloDoAutor(m: Mensagem): string | null {
  if (m.enviadaPorDispositivo) return 'Mensagem enviada por outro dispositivo';
  if (m.autor === 'BOT') return 'Mensagem do sistema';
  if (m.autor === 'AGENTE') return m.autorNome;
  return null;
}

/**
 * Midia recebida do cliente. A URL vem assinada pela API e expira; imagem
 * quebrada aqui quer dizer conversa aberta ha mais de uma hora — recarregar
 * resolve. Anexo que a plataforma nao conseguiu baixar fica sem `anexoUrl` e a
 * bolha mostra apenas o texto ("[imagem recebida]").
 */
function Anexo({ mensagem }: { mensagem: Mensagem }) {
  const { tipoAnexo, anexoUrl, conteudo } = mensagem;
  if (!anexoUrl || tipoAnexo === 'TEXTO') return null;

  if (tipoAnexo === 'IMAGEM') {
    return (
      <a href={anexoUrl} target="_blank" rel="noreferrer" className="mb-1.5 block">
        <img src={anexoUrl} alt={conteudo} className="max-h-64 w-auto rounded-lg" />
      </a>
    );
  }
  if (tipoAnexo === 'AUDIO') {
    return <audio controls src={anexoUrl} className="mb-1.5 w-full max-w-[260px]" />;
  }
  if (tipoAnexo === 'VIDEO') {
    return <video controls src={anexoUrl} className="mb-1.5 max-h-64 w-auto rounded-lg" />;
  }
  return (
    <a href={anexoUrl} target="_blank" rel="noreferrer" className="mb-1.5 block text-xs underline">
      Abrir arquivo recebido
    </a>
  );
}

/**
 * Tique de status no padrao visual do WhatsApp: um `check` cinza (enviada),
 * dois `check` cinza (entregue) ou dois `check` azuis (lida). `null`/PENDENTE
 * nao desenha nada (ainda sem confirmacao do provider); FALHOU vira um alerta.
 *
 * So aparece para mensagem da empresa — o status de entrega e sempre sobre o
 * que A EMPRESA mandou para o cliente, nunca o contrario.
 */
function TiqueDeStatus({ status }: { status: Mensagem['status'] }) {
  if (status === 'FALHOU') {
    return (
      <span className="text-[10px] font-semibold text-red-500" title="Falha no envio">
        !
      </span>
    );
  }
  if (!status || status === 'PENDENTE') return null;

  const cor = status === 'LIDA' ? '#2a8fd6' : '#8696a0';
  const duplo = status === 'ENTREGUE' || status === 'LIDA';
  const rotulo = status === 'ENTREGUE' ? 'Entregue' : status === 'LIDA' ? 'Lida' : 'Enviada';

  return (
    <svg width={duplo ? '14' : '10'} height="10" viewBox={duplo ? '0 0 16 11' : '0 0 11 11'} fill="none" aria-label={rotulo}>
      <path
        d={duplo ? 'M1 5.5L4.5 9L11 1.5M5.5 5.5L9 9L15.5 1.5' : 'M1 5.5L4.5 9L10.5 1.5'}
        stroke={cor}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Bolha({ mensagem, nomeContato }: { mensagem: Mensagem; nomeContato?: string }) {
  if (mensagem.autor === 'SISTEMA') {
    if (mensagem.evento) return <EventoConversa mensagem={mensagem} />;
    return (
      <li className="my-2 text-center">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{mensagem.conteudo}</span>
      </li>
    );
  }

  if (mensagem.interno) {
    return (
      <li className="flex justify-end">
        <div className="max-w-[min(75%,42rem)] rounded-[18px] rounded-br-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-slate-800">
          <p className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold text-amber-700">
            <IconeCadeado tamanho={12} />
            Nota interna{mensagem.autorNome ? ` · ${mensagem.autorNome}` : ''}
          </p>
          <Anexo mensagem={mensagem} />
          <TextoComLinks texto={mensagem.conteudo} />
          <p className="mt-1 text-right text-[11px] tabular-nums text-amber-700">{hora(mensagem.criadoEm)}</p>
        </div>
      </li>
    );
  }

  const daEmpresa = mensagem.autor !== 'CLIENTE';
  const rotulo = rotuloDoAutor(mensagem);
  const forma = daEmpresa ? 'rounded-[18px] rounded-br-md' : 'rounded-[18px] rounded-bl-md';
  // Modelo WhatsApp: o que a empresa envia (agente, bot ou outro aparelho) e verde; o que o cliente
  // manda e branco, com a inicial ao lado.
  const cores = daEmpresa
    ? 'bg-[var(--bolha-enviada)] shadow-[0_1px_1px_rgba(11,20,26,0.15)]'
    : 'border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]';
  return (
    <li className={`flex items-end gap-2 ${daEmpresa ? 'justify-end' : 'justify-start'}`}>
      {!daEmpresa && (
        <span
          aria-hidden="true"
          className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[11px] font-semibold text-[var(--brand-primary)]"
        >
          {(nomeContato ?? '?').charAt(0).toUpperCase()}
        </span>
      )}
      <div className={`max-w-[min(75%,42rem)] px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 ${forma} ${cores}`}>
        {rotulo && (
          <p className={`mb-0.5 text-[11.5px] font-semibold ${daEmpresa ? 'text-emerald-700' : 'text-slate-500'}`}>{rotulo}</p>
        )}
        <Anexo mensagem={mensagem} />
        <TextoComLinks texto={mensagem.conteudo} />
        <p className="mt-1 flex items-center justify-end gap-1 text-right text-[11px] tabular-nums text-slate-500">
          {hora(mensagem.criadoEm)}
          {daEmpresa && <TiqueDeStatus status={mensagem.status} />}
        </p>
      </div>
    </li>
  );
}

export function PainelChat({
  conversa,
  onMudou,
  aoTransferir,
  aoVoltarParaLista,
  aoAlternarFicha,
  fichaAberta,
  somenteLeitura = false,
}: {
  conversa: ConversaDetalhe;
  onMudou: (detalhe: ConversaDetalhe) => void;
  aoTransferir?: () => void;
  /** So existe no passo mobile "chat": volta pra lista sem perder a conversa aberta. */
  aoVoltarParaLista?: () => void;
  /** So existe fora do desktop, onde a ficha e um drawer/passo em vez de coluna fixa. */
  aoAlternarFicha?: () => void;
  fichaAberta?: boolean;
  somenteLeitura?: boolean;
}) {
  type RespostaRapida = { id: string; titulo: string; atalho: string | null; conteudo: string; categoria: string };
  const [texto, setTexto] = useState('');
  const [abaRodape, setAbaRodape] = useState<'responder' | 'privada'>('responder');
  const [textoPrivado, setTextoPrivado] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviandoMensagem = useRef(false);
  const chavesEnvioPendente = useRef(new Map<string, { conteudo: string; chave: string }>());
  const [respostasRapidas, setRespostasRapidas] = useState<RespostaRapida[]>([]);
  const [janelaFechada, setJanelaFechada] = useState(false);
  const [seletorRapido, setSeletorRapido] = useState<{ inicio: number; fim: number; busca: string } | null>(null);
  const textareaResposta = useRef<HTMLTextAreaElement>(null);
  const textareaNota = useRef<HTMLTextAreaElement>(null);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [anterioresDaConversa, setAnterioresDaConversa] = useState<Mensagem[]>([]);
  const [cursorHistorico, setCursorHistorico] = useState<string | null>(null);
  const [fimDoHistorico, setFimDoHistorico] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const topo = useRef<HTMLDivElement>(null);
  const mostrar = useToast();
  const { usuario, temModulo } = useAuth();
  // "Ligar": leva para a Telefonia ja com o numero do cliente. So em conversa de WhatsApp com telefone e para
  // quem tem o modulo Telefonia (sem ele a rota nem abriria).
  const telefoneParaLigar = (conversa.contato.telefone ?? '').replace(/\D/g, '');
  const podeLigar = conversa.canal === 'WHATSAPP' && telefoneParaLigar.length >= 8 && Boolean(temModulo?.('telefonia'));
  const atendimentosAnteriores = useAtendimentosAnteriores(conversa.id);
  const rascunhos = useRef<Map<string, { texto: string; textoPrivado: string }>>(new Map());
  const conversaIdAnterior = useRef(conversa.id);

  useEffect(() => {
    let ativo = true;
    void api.get<{ mensagens: RespostaRapida[] }>('/mensagens-rapidas')
      .then(({ mensagens }) => { if (ativo) setRespostasRapidas(mensagens); })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    let ativo = true;
    setJanelaFechada(false);
    const carregarJanela = async () => {
      try {
        const { janela } = await api.get<{ janela: { aplica: boolean; aberta: boolean } }>(`/conversas/${conversa.id}/janela-whatsapp`);
        if (ativo) setJanelaFechada(janela.aplica && !janela.aberta);
      } catch {
        if (ativo) setJanelaFechada(false);
      }
    };
    void carregarJanela();
    const intervalo = window.setInterval(() => void carregarJanela(), 60_000);
    return () => { ativo = false; window.clearInterval(intervalo); };
  }, [conversa.id, conversa.mensagens[conversa.mensagens.length - 1]?.id]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [conversa.mensagens.length, conversa.id]);

  // Trocar de conversa zera o historico carregado: sem isto, as mensagens
  // antigas de uma conversa apareceriam no topo da proxima.
  useEffect(() => {
    setAnterioresDaConversa([]);
    setCursorHistorico(null);
    setFimDoHistorico(false);
  }, [conversa.id]);

  /*
   * O rascunho nao enviado troca junto com a conversa, em vez de vazar de uma
   * pra outra ou se perder. Cobre tanto a resposta normal (`texto`) quanto a
   * nota interna (`textoPrivado`) — um rascunho de nota interna pro cliente A
   * nao pode continuar na caixa ao abrir a conversa do cliente B.
   *
   * A aba do rodape tambem volta para "Responder" ao trocar de conversa: e o
   * comportamento mais seguro (nunca abre sozinho numa aba que manda pro
   * cliente errado) e o mais previsivel (aba padrao de conversa nova).
   */
  useEffect(() => {
    const idAnterior = conversaIdAnterior.current;
    if (idAnterior === conversa.id) return;
    rascunhos.current.set(idAnterior, { texto, textoPrivado });
    const salvo = rascunhos.current.get(conversa.id);
    setTexto(salvo?.texto ?? '');
    setTextoPrivado(salvo?.textoPrivado ?? '');
    setAbaRodape('responder');
    conversaIdAnterior.current = conversa.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id]);

  const finalizada = conversa.status === 'FINALIZADO';
  const aguardandoDesde = clienteAguardandoDesde(conversa.status, conversa.mensagens);

  const visiveisRapidas = respostasRapidas.filter((item) =>
    `${item.titulo} ${item.atalho ?? ''} ${item.categoria} ${item.conteudo}`.toLocaleLowerCase('pt-BR')
      .includes((seletorRapido?.busca ?? '').replace(/^\//, '').toLocaleLowerCase('pt-BR')),
  );

  const escolherRapida = (item: RespostaRapida) => {
    if (!seletorRapido) return;
    const antes = texto.slice(0, seletorRapido.inicio);
    const depois = texto.slice(seletorRapido.fim);
    const conteudo = item.conteudo
      .replace(/\{\{\s*nome_contato\s*\}\}/gi, conversa.contato.nome)
      .replace(/\{\{\s*atendente\s*\}\}/gi, usuario?.nome ?? '')
      .replace(/\{\{\s*protocolo\s*\}\}/gi, conversa.protocolo ?? '');
    const proximo = `${antes}${conteudo}${depois}`;
    const cursor = antes.length + conteudo.length;
    setTexto(proximo);
    if (chavesEnvioPendente.current.get(conversa.id)?.conteudo !== proximo.trim()) chavesEnvioPendente.current.delete(conversa.id);
    setSeletorRapido(null);
    requestAnimationFrame(() => {
      textareaResposta.current?.focus();
      textareaResposta.current?.setSelectionRange(cursor, cursor);
    });
  };

  /** Abre a lista de mensagens rapidas no ponto do cursor (o mesmo que digitar "/"). */
  const abrirRapidas = () => {
    const campo = textareaResposta.current;
    const pos = campo?.selectionStart ?? texto.length;
    const fim = campo?.selectionEnd ?? pos;
    setSeletorRapido({ inicio: pos, fim, busca: '' });
    campo?.focus();
  };

  /** Insere o emoji na posicao do cursor (ou no fim) da resposta ou da nota privada. */
  const inserirEmoji = (emoji: string, privada = false) => {
    const campo = privada ? textareaNota.current : textareaResposta.current;
    const atual = privada ? textoPrivado : texto;
    const ini = campo?.selectionStart ?? atual.length;
    const fim = campo?.selectionEnd ?? ini;
    const proximo = `${atual.slice(0, ini)}${emoji}${atual.slice(fim)}`;
    if (privada) setTextoPrivado(proximo);
    else {
      setTexto(proximo);
      if (chavesEnvioPendente.current.get(conversa.id)?.conteudo !== proximo.trim()) chavesEnvioPendente.current.delete(conversa.id);
    }
    const cursor = ini + emoji.length;
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(cursor, cursor);
    });
  };

  const executar = async (acao: () => Promise<{ conversa: ConversaDetalhe }>) => {
    setErro(null);
    setOcupado(true);
    try {
      const { conversa: nova } = await acao();
      onMudou(nova);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha na operação');
    } finally {
      setOcupado(false);
    }
  };

  // Antes ficava escondido num menu; agora e um botao visivel, entao pede
  // confirmacao para um clique acidental nao encerrar o atendimento do cliente.
  const encerrar = () => {
    if (!window.confirm(`Encerrar o atendimento de ${conversa.contato.nome}?`)) return;
    void executar(async () => {
      const r = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${conversa.id}/finalizar`);
      mostrar('sucesso', 'Chat encerrado com sucesso.');
      return r;
    });
  };

  const enviarPesquisa = () => {
    if (!window.confirm(`Enviar a pesquisa de satisfação para ${conversa.contato.nome}?`)) return;
    void executar(async () => {
      const r = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${conversa.id}/pesquisa`);
      mostrar('sucesso', 'Pesquisa enviada ao cliente.');
      return r;
    });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guarda tambem contra o Enter do textarea, que chama `enviar` direto sem
    // passar pelo `disabled` do botao — sem isto da pra disparar um envio
    // duplicado/concorrente pelo teclado com um envio ja em voo.
    if (enviandoMensagem.current) return;
    if (janelaFechada) {
      setErro('A janela de 24 horas do WhatsApp está fechada. Envie um template aprovado pela Meta e aguarde o cliente responder.');
      return;
    }
    const conteudo = texto.trim();
    if (!conteudo) return;
    let envioPendente = chavesEnvioPendente.current.get(conversa.id);
    if (!envioPendente || envioPendente.conteudo !== conteudo) {
      envioPendente = { conteudo, chave: crypto.randomUUID() };
      chavesEnvioPendente.current.set(conversa.id, envioPendente);
    }
    enviandoMensagem.current = true;
    setErro(null);
    setOcupado(true);
    try {
      const resp = await api.post<{ mensagem: Mensagem; conversa: ConversaDetalhe }>(
        `/conversas/${conversa.id}/mensagens`,
        { conteudo, chaveIdempotencia: envioPendente.chave },
      );
      chavesEnvioPendente.current.delete(conversa.id);
      setTexto('');
      onMudou(resp.conversa);
    } catch (err) {
      setErro(textoDoErroDeEnvio(err, 'Falha ao enviar'));
    } finally {
      enviandoMensagem.current = false;
      setOcupado(false);
    }
  };

  /**
   * Historico anterior sob demanda. A conversa abre com as ultimas mensagens; o
   * resto vem por pagina, da mais recente para a mais antiga.
   */
  const carregarAnteriores = async () => {
    const cursor = cursorHistorico ?? conversa.cursorAnterior;
    if (!cursor) return;
    setOcupado(true);
    try {
      const resp = await api.get<{ mensagens: Mensagem[]; proximoCursor: string | null }>(
        `/conversas/${conversa.id}/mensagens?cursor=${encodeURIComponent(cursor)}`,
      );
      setAnterioresDaConversa((atual) => [...resp.mensagens, ...atual]);
      setCursorHistorico(resp.proximoCursor);
      setFimDoHistorico(resp.proximoCursor === null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao carregar o histórico');
    } finally {
      setOcupado(false);
    }
  };

  const historicoAtualEsgotado = !(conversa.temHistoricoAnterior ?? false) || fimDoHistorico;
  useEffect(() => {
    const alvo = topo.current;
    if (!alvo || !historicoAtualEsgotado || atendimentosAnteriores.fim) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) void atendimentosAnteriores.carregarMais();
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [historicoAtualEsgotado, atendimentosAnteriores.fim, atendimentosAnteriores.carregarMais, conversa.id]);

  /**
   * Anexo do agente. A legenda vai junto quando o campo de texto tem algo
   * escrito: e o comportamento que o agente espera de qualquer mensageiro.
   *
   * `interno` manda o anexo como nota interna: legenda vem de `textoPrivado`,
   * nunca sai pelo canal externo, e o campo limpo depois e o da aba certa.
   */
  const anexar = async (arquivo: File, interno = false) => {
    setErro(null);
    setOcupado(true);
    try {
      const legenda = (interno ? textoPrivado : texto).trim();
      const resp = await api.upload<{ mensagem: Mensagem; conversa: ConversaDetalhe }>(
        `/conversas/${conversa.id}/anexos`,
        arquivo,
        'arquivo',
        { ...(legenda ? { legenda } : {}), ...(interno ? { interno: 'true' } : {}) },
      );
      if (interno) setTextoPrivado('');
      else setTexto('');
      onMudou(resp.conversa);
    } catch (err) {
      setErro(textoDoErroDeEnvio(err, 'Falha ao enviar o arquivo'));
    } finally {
      setOcupado(false);
    }
  };

  // Microfone do campo de resposta: grava no navegador e manda pelo mesmo caminho dos anexos.
  const gravador = useGravadorDeVoz((arquivo) => void anexar(arquivo));
  // Escondido por padrao ate o audio ser aceito pelo WhatsApp; liga com ?microfone=1 (ver gravacao.ts).
  const [microfoneAtivo] = useState(() =>
    typeof window === 'undefined' ? false : microfoneLiberado(window.location.search, (() => { try { return window.localStorage; } catch { return null; } })()),
  );
  const mostrarMicrofone = gravador.suportado && microfoneAtivo;

  // Campo de uma linha que cresce com o texto (ate ~5 linhas), como o do WhatsApp.
  useLayoutEffect(() => {
    for (const campo of [textareaResposta.current, textareaNota.current]) {
      if (!campo) continue;
      campo.style.height = 'auto';
      campo.style.height = `${Math.min(campo.scrollHeight, 128)}px`;
    }
  }, [texto, textoPrivado, abaRodape, gravador.gravando]);

  const contatoLegivel = conversa.contato.telefone
    ? telefoneLegivel(conversa.contato.telefone)
    : (conversa.contato.email ?? 'Sem contato informado');

  return (
    // `@container`: os rotulos dos botoes do cabecalho somem quando o PAINEL fica
    // estreito (ficha aberta ao lado), nao quando a janela fica estreita.
    <div className="@container flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-200 bg-white px-5 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {/* So existe no passo mobile "chat" — no notebook/tablet/desktop a
              lista fica sempre visivel ao lado, sem precisar de volta. */}
          {aoVoltarParaLista && (
            <button
              type="button"
              onClick={aoVoltarParaLista}
              aria-label="Voltar para a lista de conversas"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <IconeVoltar tamanho={18} />
            </button>
          )}
          <AvatarConversa conversaId={conversa.id} nome={conversa.contato.nome} className="h-12 w-12 text-base" avatarPath={`/contatos/${conversa.contato.id}/avatar`} />
          <div className="min-w-[14rem] flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h2 className="truncate text-[17px] font-semibold text-slate-900">{conversa.contato.nome}</h2>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold ${CLASSE_STATUS[conversa.status]}`}>
                <IconeRelogio tamanho={12} />
                {LABEL_CONVERSA_STATUS[conversa.status]}
              </span>
              {conversa.arquivada && <Badge tom="neutro">Arquivada</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-slate-600">
                {conversa.canal === 'WHATSAPP' && <IconeWhatsapp tamanho={14} className="text-emerald-500" />}
                {contatoLegivel}
              </span>
              {conversa.linha?.nome && <><span aria-hidden="true" className="h-3.5 w-px bg-slate-200" /><span>{conversa.linha.nome}</span></>}
              {conversa.fila && <><span aria-hidden="true" className="h-3.5 w-px bg-slate-200" /><span>{conversa.fila.nome}</span></>}
              <span aria-hidden="true" className="h-3.5 w-px bg-slate-200" />
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${conversa.origem === 'ATIVO' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                {conversa.origem === 'ATIVO' ? 'Ativo' : 'Receptivo'}
              </span>
              {conversa.protocolo && (
                <button
                  type="button"
                  title="Copiar protocolo"
                  onClick={() => {
                    void navigator.clipboard?.writeText(conversa.protocolo!);
                    mostrar('info', `Protocolo ${conversa.protocolo} copiado`);
                  }}
                  className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  Protocolo <span className="font-mono text-slate-700">{conversa.protocolo}</span>
                  <IconeCopiar tamanho={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* So existe fora do desktop: la a ficha e coluna fixa e sempre
                visivel, entao um botao pra abrir o que ja esta aberto so
                ocuparia espaco atoa. */}
            {aoAlternarFicha && (
              <button
                type="button"
                onClick={aoAlternarFicha}
                aria-pressed={fichaAberta}
                aria-label="Ficha do contato"
                title="Ficha do contato"
                className={`${BOTAO_SECUNDARIO} ${fichaAberta ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]' : ''}`}
              >
                <IconeFicha tamanho={15} />
                <span className="hidden @[52rem]:inline">Ficha do contato</span>
              </button>
            )}
            {!somenteLeitura && (
              <>
                {conversa.status === 'EM_ESPERA' && (
                  <Button disabled={ocupado} onClick={() => void executar(() => api.post(`/conversas/${conversa.id}/assumir`))}>
                    Aceitar
                  </Button>
                )}
                {podeLigar && (
                  <Link
                    // Telefone vai no estado de navegacao, nao na URL: fora do historico, de logs e do referrer.
                    to="/telefonia"
                    state={{ ligar: telefoneParaLigar }}
                    aria-label="Ligar para o cliente"
                    title={`Ligar para ${telefoneLegivel(telefoneParaLigar)} pela Telefonia`}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] bg-green-600 px-3.5 text-[13px] font-semibold texto-sobre-cor-fixa shadow-[0_2px_6px_rgba(22,163,74,0.28)] transition hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
                  >
                    <IconeTelefone tamanho={16} />
                    <span className="hidden @[46rem]:inline">Ligar</span>
                  </Link>
                )}
                {!finalizada && aoTransferir && (
                  <button type="button" disabled={ocupado} onClick={aoTransferir} aria-label="Transferir" title="Transferir" className={BOTAO_SECUNDARIO}>
                    <IconeTransferir tamanho={15} />
                    <span className="hidden @[46rem]:inline">Transferir</span>
                  </button>
                )}
                {!finalizada && (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={encerrar}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--brand-secondary)] px-4 text-[13px] font-semibold texto-sobre-cor-fixa transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IconeEncerrar tamanho={15} />
                    Encerrar
                  </button>
                )}
                <Dropdown
                  rotulo={
                    <span aria-label="Ações da conversa" className="flex items-center">
                      <IconeMaisAcoes tamanho={16} />
                    </span>
                  }
                  itens={[
                    ...(!finalizada && conversa.fila && conversa.agente
                      ? [{
                          chave: 'devolver',
                          rotulo: `Devolver à equipe ${conversa.fila.nome}`,
                          desabilitado: ocupado,
                          aoSelecionar: () => void executar(() => api.post(`/conversas/${conversa.id}/transferir`, { filaId: conversa.fila!.id })),
                        }]
                      : []),
                    {
                      chave: 'arquivar',
                      rotulo: conversa.arquivada ? 'Desarquivar' : 'Arquivar',
                      desabilitado: ocupado,
                      aoSelecionar: () =>
                        void executar(() => api.post(`/conversas/${conversa.id}/${conversa.arquivada ? 'desarquivar' : 'arquivar'}`)),
                    },
                  ]}
                />
              </>
            )}
          </div>
        </div>
      </header>

      {aguardandoDesde && !somenteLeitura && (
        <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-[13px] text-amber-700">
          <IconeRelogio tamanho={15} />
          <span>
            <strong className="font-semibold">Cliente aguardando resposta há {esperaPorExtenso(aguardandoDesde)}</strong>
            {' · '}última mensagem em {dataHora(aguardandoDesde)}
          </span>
        </div>
      )}

      {/*
        Padrao unico em todas as telas: a lista de mensagens ocupa a largura inteira do painel
        (enviadas na borda direita, recebidas na esquerda). O que limita a leitura e a largura de
        cada balao (max-w-[min(75%,42rem)] em Bolha), nao uma coluna central estreita.
      */}
      <div className="fundo-chat min-h-0 flex-1 overflow-y-auto px-5 py-6 @[40rem]:px-8">
        <div className="w-full">
          <div ref={topo} aria-hidden="true" />
          {atendimentosAnteriores.carregando && (
            <p className="mb-2 text-center text-xs text-slate-500">Carregando atendimento anterior...</p>
          )}
          {(conversa.temHistoricoAnterior ?? false) && !fimDoHistorico && (
            <button
              type="button"
              onClick={() => void carregarAnteriores()}
              disabled={ocupado}
              className="mx-auto mb-3 block rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Carregar mensagens anteriores
            </button>
          )}

          <ul className="space-y-2.5">
            {atendimentosAnteriores.blocos.map((bloco) => (
              <Fragment key={bloco.id}>
                <SeparadorAnterior bloco={bloco} />
                {bloco.mensagens.map((m) => <Bolha key={m.id} mensagem={m} nomeContato={conversa.contato.nome} />)}
              </Fragment>
            ))}
            {atendimentosAnteriores.blocos.length > 0 && (
              <li className="my-3 flex justify-center">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                  Atendimento atual{conversa.protocolo ? ` - ${conversa.protocolo}` : ''}
                </span>
              </li>
            )}
            <MensagensComDias mensagens={[...anterioresDaConversa, ...conversa.mensagens]} nomeContato={conversa.contato.nome} />
          </ul>
          <div ref={fim} />
        </div>
      </div>

      {!somenteLeitura && <footer className="border-t border-slate-200 bg-white px-3 pb-3 pt-2.5 @[40rem]:px-8">
        <div className="w-full">
        {finalizada ? (
          <>
            {erro && <div className="pt-3"><Alerta>{erro}</Alerta></div>}
            <p className="pt-4 text-center text-sm text-slate-500">
              Atendimento finalizado em {new Date(conversa.finalizadoEm!).toLocaleString('pt-BR')}.
            </p>
            {conversa.pesquisaManual && (
              <div className="flex justify-center pt-3">
                <Button disabled={ocupado} onClick={enviarPesquisa}>Enviar pesquisa de satisfação</Button>
              </div>
            )}
          </>
        ) : (
          <>
            {erro && <div className="mb-2"><Alerta>{erro}</Alerta></div>}
            {gravador.erro && <div className="mb-2"><Alerta>{gravador.erro}</Alerta></div>}

            {abaRodape === 'responder' ? (
              <>
              {janelaFechada && (
                <div role="status" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Janela de 24 horas fechada. Texto livre e mensagens rápidas estão bloqueados. Envie um template aprovado pelo WhatsApp Manager e aguarde a resposta do cliente para reabrir a janela. O envio de templates ainda não está disponível nesta tela.
                </div>
              )}
              <form onSubmit={enviar} className="relative">
                {seletorRapido && (
                  <div role="listbox" aria-label="Mensagens rápidas" className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                    {visiveisRapidas.length ? visiveisRapidas.map((item) => (
                      <button key={item.id} type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => escolherRapida(item)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                        <span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-800"><span>{item.titulo}</span><span className="text-xs font-normal text-slate-400">{item.categoria}{item.atalho ? ` · /${item.atalho}` : ''}</span></span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{item.conteudo}</span>
                      </button>
                    )) : respostasRapidas.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-slate-500">
                        Nenhuma mensagem rápida cadastrada.{' '}
                        <Link to="/configuracoes?aba=mensagens-rapidas" className="font-medium text-[var(--brand-primary)] underline">Cadastre em Configurações → Mensagens rápidas</Link>.
                      </p>
                    ) : <p className="px-3 py-2 text-sm text-slate-500">Nenhuma mensagem encontrada. Esc para fechar.</p>}
                  </div>
                )}
                {/* Uma linha so, como o WhatsApp: clipe, emoji, campo e microfone/enviar. */}
                <div className="flex items-end gap-0.5 rounded-[26px] border border-slate-300 bg-white px-1.5 py-1 shadow-sm transition focus-within:border-[var(--brand-primary)]">
                  {gravador.gravando ? (
                    <BarraDeGravacao segundos={gravador.segundos} aoCancelar={gravador.cancelar} />
                  ) : (
                    <>
                      <MenuAnexos
                        desabilitado={janelaFechada || ocupado}
                        aoArquivo={(arquivo) => void anexar(arquivo)}
                        aoAbrirCamera={() => setCameraAberta(true)}
                        rapidasDisponiveis={respostasRapidas.length > 0}
                        aoRapidas={abrirRapidas}
                      />
                      <BotaoEmoji desabilitado={janelaFechada || ocupado} aoEscolher={(emoji) => inserirEmoji(emoji)} />
                      <button
                        type="button"
                        className={BOTAO_ICONE}
                        disabled={ocupado}
                        aria-label="Nota interna"
                        title="Nota interna (só a equipe vê)"
                        onClick={() => setAbaRodape('privada')}
                      >
                        <IconeCadeado tamanho={18} />
                      </button>
                      <label htmlFor={`resposta-${conversa.id}`} className="sr-only">Resposta para o cliente</label>
                      <textarea
                        id={`resposta-${conversa.id}`}
                        ref={textareaResposta}
                        value={texto}
                        onChange={(e) => {
                          const valor = e.target.value;
                          const caret = e.target.selectionStart;
                          if (chavesEnvioPendente.current.get(conversa.id)?.conteudo !== valor.trim()) chavesEnvioPendente.current.delete(conversa.id);
                          setTexto(valor);
                          const trecho = valor.slice(0, caret);
                          const gatilho = /(?:^|\s)\/([^\s]*)$/.exec(trecho);
                          if (gatilho) {
                            const token = gatilho[0];
                            setSeletorRapido({ inicio: caret - token.length, fim: caret, busca: gatilho[1] ?? '' });
                          } else setSeletorRapido(null);
                        }}
                        onKeyDown={(e) => {
                          if (seletorRapido && e.key === 'Escape') { e.preventDefault(); setSeletorRapido(null); return; }
                          if (seletorRapido && e.key === 'Enter' && visiveisRapidas[0]) { e.preventDefault(); escolherRapida(visiveisRapidas[0]); return; }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void enviar(e);
                          }
                        }}
                        rows={1}
                        disabled={janelaFechada || ocupado}
                        title="Enter envia · Shift+Enter quebra linha · Digite / para mensagens rápidas"
                        placeholder={janelaFechada ? 'Janela fechada — texto livre indisponível' : 'Digite uma mensagem'}
                        className="mx-1 block max-h-32 min-h-[40px] min-w-0 flex-1 resize-none self-center bg-transparent py-2.5 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                      />
                    </>
                  )}
                  {gravador.gravando ? (
                    <button type="button" onClick={gravador.enviar} aria-label="Enviar áudio" title="Enviar áudio" className={BOTAO_ENVIAR}>
                      <IconeEnviar tamanho={17} />
                    </button>
                  ) : texto.trim() || !mostrarMicrofone ? (
                    <button
                      type="submit"
                      disabled={ocupado || janelaFechada || !texto.trim()}
                      aria-label="Enviar"
                      title="Enviar"
                      className={BOTAO_ENVIAR}
                    >
                      <IconeEnviar tamanho={17} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={ocupado || janelaFechada}
                      onClick={() => void gravador.iniciar()}
                      aria-label="Gravar áudio"
                      title="Gravar áudio"
                      className={`${BOTAO_ICONE} h-10 w-10 rounded-full`}
                    >
                      <IconeMicrofone tamanho={20} />
                    </button>
                  )}
                </div>
              </form>
              </>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!textoPrivado.trim() || ocupado) return;
                  setOcupado(true);
                  setErro(null);
                  try {
                    const { conversa: nova } = await api.post<{ conversa: ConversaDetalhe }>(
                      `/conversas/${conversa.id}/mensagens`,
                      { conteudo: textoPrivado, interno: true },
                    );
                    onMudou(nova);
                    setTextoPrivado('');
                  } catch (err) {
                    setErro(textoDoErroDeEnvio(err, 'Falha ao enviar a nota interna'));
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                {/* Mesma linha unica, em ambar: a cor avisa que o cliente nao ve. */}
                <div className="flex items-end gap-0.5 rounded-[26px] border border-amber-300 bg-amber-50 px-1.5 py-1 transition focus-within:border-amber-500">
                  <button
                    type="button"
                    className={`${BOTAO_ICONE} bg-amber-200/70 text-amber-800`}
                    aria-label="Voltar para a resposta ao cliente"
                    title="Nota interna ligada — clique para voltar a responder o cliente"
                    onClick={() => setAbaRodape('responder')}
                  >
                    <IconeCadeado tamanho={18} />
                  </button>
                  <MenuAnexos
                    desabilitado={ocupado}
                    aoArquivo={(arquivo) => void anexar(arquivo, true)}
                    aoAbrirCamera={() => setCameraAberta(true)}
                    rapidasDisponiveis={false}
                    aoRapidas={() => undefined}
                    semRapidas
                  />
                  <BotaoEmoji desabilitado={ocupado} aoEscolher={(emoji) => inserirEmoji(emoji, true)} />
                  <label htmlFor={`nota-${conversa.id}`} className="sr-only">Nota interna para a equipe</label>
                  <textarea
                    id={`nota-${conversa.id}`}
                    ref={textareaNota}
                    value={textoPrivado}
                    onChange={(e) => setTextoPrivado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.target as HTMLTextAreaElement).form?.requestSubmit();
                      }
                    }}
                    rows={1}
                    title="Enter salva · Shift+Enter quebra linha"
                    placeholder="Nota interna — só a equipe vê"
                    className="mx-1 block max-h-32 min-h-[40px] min-w-0 flex-1 resize-none self-center bg-transparent py-2.5 text-sm leading-5 text-slate-800 outline-none placeholder:text-amber-800/70"
                  />
                  {/* Cor fixa nos dois temas: o ambar da escala vira tom claro no escuro e apagaria o icone branco. */}
                  <button
                    type="submit"
                    disabled={ocupado || !textoPrivado.trim()}
                    aria-label="Salvar nota"
                    title="Salvar nota"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full texto-sobre-cor-fixa transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: '#b54708' }}
                  >
                    <IconeEnviar tamanho={17} />
                  </button>
                </div>
              </form>
            )}
            <ModalCamera
              aberto={cameraAberta}
              aoFechar={() => setCameraAberta(false)}
              aoCapturar={(arquivo) => void anexar(arquivo, abaRodape === 'privada')}
            />
          </>
        )}
        </div>
      </footer>}
    </div>
  );
}
