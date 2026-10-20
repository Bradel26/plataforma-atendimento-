import { Fragment, useEffect, useRef, useState } from 'react';
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
  IconeClipe,
  IconeCopiar,
  IconeEncerrar,
  IconeEnviar,
  IconeFicha,
  IconeMaisAcoes,
  IconeRaio,
  IconeRelogio,
  IconeTransferir,
  IconeVoltar,
} from './icones';
import { partesComLinks } from './links';
import { useAtendimentosAnteriores, type BlocoAnterior } from './useAtendimentosAnteriores';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

const BOTAO_SECUNDARIO =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const BOTAO_FERRAMENTA =
  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';

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
    <li className="my-3 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium text-slate-500">{rotuloDoDia(iso)}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </li>
  );
}

/** Mensagens com um separador sempre que o dia muda. */
function MensagensComDias({ mensagens }: { mensagens: Mensagem[] }) {
  return (
    <>
      {mensagens.map((m, i) => {
        const anterior = mensagens[i - 1];
        const novoDia = !anterior || new Date(anterior.criadoEm).toDateString() !== new Date(m.criadoEm).toDateString();
        return (
          <Fragment key={m.id}>
            {novoDia && <SeparadorDia iso={m.criadoEm} />}
            <Bolha mensagem={m} />
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

function Bolha({ mensagem }: { mensagem: Mensagem }) {
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
        <div className="max-w-[75%] rounded-2xl rounded-br-md border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-slate-800">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-700">
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
  const doAgente = mensagem.autor === 'AGENTE' && !mensagem.enviadaPorDispositivo;
  const rotulo = rotuloDoAutor(mensagem);
  const forma = daEmpresa ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md';
  const cores = doAgente
    ? 'border border-[color-mix(in_srgb,var(--brand-primary)_22%,transparent)] bg-[var(--brand-primary-soft)]'
    : 'border border-slate-200 bg-white shadow-[0_1px_1px_rgba(15,23,42,0.04)]';
  return (
    <li className={`flex ${daEmpresa ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] px-3.5 py-2 text-sm leading-relaxed text-slate-800 ${forma} ${cores}`}>
        {rotulo && (
          <p className={`mb-0.5 text-xs font-semibold ${doAgente ? 'text-[var(--brand-primary)]' : 'text-slate-600'}`}>{rotulo}</p>
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
  const [respostasRapidas, setRespostasRapidas] = useState<RespostaRapida[]>([]);
  const [janelaFechada, setJanelaFechada] = useState(false);
  const [seletorRapido, setSeletorRapido] = useState<{ inicio: number; fim: number; busca: string } | null>(null);
  const textareaResposta = useRef<HTMLTextAreaElement>(null);
  const [anterioresDaConversa, setAnterioresDaConversa] = useState<Mensagem[]>([]);
  const [cursorHistorico, setCursorHistorico] = useState<string | null>(null);
  const [fimDoHistorico, setFimDoHistorico] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const topo = useRef<HTMLDivElement>(null);
  const mostrar = useToast();
  const { usuario } = useAuth();
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
    setSeletorRapido(null);
    requestAnimationFrame(() => {
      textareaResposta.current?.focus();
      textareaResposta.current?.setSelectionRange(cursor, cursor);
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
    enviandoMensagem.current = true;
    setErro(null);
    setOcupado(true);
    try {
      const resp = await api.post<{ mensagem: Mensagem; conversa: ConversaDetalhe }>(
        `/conversas/${conversa.id}/mensagens`,
        { conteudo },
      );
      setTexto('');
      onMudou(resp.conversa);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao enviar');
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
      setErro(err instanceof ApiError ? err.message : 'Falha ao enviar o arquivo');
    } finally {
      setOcupado(false);
    }
  };

  const contatoLegivel = conversa.contato.telefone
    ? telefoneLegivel(conversa.contato.telefone)
    : (conversa.contato.email ?? 'Sem contato informado');

  return (
    // `@container`: os rotulos dos botoes do cabecalho somem quando o PAINEL fica
    // estreito (ficha aberta ao lado), nao quando a janela fica estreita.
    <div className="@container flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
          <AvatarConversa conversaId={conversa.id} nome={conversa.contato.nome} className="h-10 w-10 text-sm" />
          <div className="min-w-[14rem] flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-slate-800">{conversa.contato.nome}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASSE_STATUS[conversa.status]}`}>
                {LABEL_CONVERSA_STATUS[conversa.status]}
              </span>
              {conversa.arquivada && <Badge tom="neutro">Arquivada</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span className="tabular-nums">{contatoLegivel}</span>
              {conversa.linha?.nome && <span>· {conversa.linha.nome}</span>}
              {conversa.fila && <span>· {conversa.fila.nome}</span>}
              <span>· {conversa.origem === 'ATIVO' ? '↗ Ativo' : '↙ Receptivo'}</span>
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
                  · Protocolo <span className="font-mono text-slate-700">{conversa.protocolo}</span>
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
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
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
        Largura maxima no conteudo, nao no fundo: o painel continua esticando
        em telas largas, mas a linha de texto para de crescer alem do
        confortavel pra ler.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-5">
        <div className="mx-auto max-w-3xl">
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

          <ul className="space-y-2">
            {atendimentosAnteriores.blocos.map((bloco) => (
              <Fragment key={bloco.id}>
                <SeparadorAnterior bloco={bloco} />
                {bloco.mensagens.map((m) => <Bolha key={m.id} mensagem={m} />)}
              </Fragment>
            ))}
            {atendimentosAnteriores.blocos.length > 0 && (
              <li className="my-3 flex justify-center">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                  Atendimento atual{conversa.protocolo ? ` - ${conversa.protocolo}` : ''}
                </span>
              </li>
            )}
            <MensagensComDias mensagens={[...anterioresDaConversa, ...conversa.mensagens]} />
          </ul>
          <div ref={fim} />
        </div>
      </div>

      {!somenteLeitura && <footer className="border-t border-slate-200 bg-white px-5 pb-4">
        <div className="mx-auto max-w-3xl">
        {finalizada ? (
          <>
            {erro && <div className="pt-3"><Alerta>{erro}</Alerta></div>}
            <p className="pt-4 text-center text-sm text-slate-500">
              Atendimento finalizado em {new Date(conversa.finalizadoEm!).toLocaleString('pt-BR')}.
            </p>
          </>
        ) : (
          <>
            <div role="tablist" className="mb-3 flex gap-5 border-b border-slate-100">
              <button
                type="button"
                role="tab"
                aria-selected={abaRodape === 'responder'}
                onClick={() => setAbaRodape('responder')}
                className={`-mb-px h-11 border-b-2 text-sm font-semibold transition ${
                  abaRodape === 'responder'
                    ? 'border-[var(--brand-primary)] text-slate-800'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Responder
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={abaRodape === 'privada'}
                onClick={() => setAbaRodape('privada')}
                className={`-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 text-sm font-semibold transition ${
                  abaRodape === 'privada' ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <IconeCadeado tamanho={14} />
                Mensagem Privada
              </button>
            </div>

            {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}

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
                <div className="rounded-xl border border-slate-300 bg-white shadow-sm transition focus-within:border-[var(--brand-primary)]">
                  <label htmlFor={`resposta-${conversa.id}`} className="sr-only">Resposta para o cliente</label>
                  <textarea
                    id={`resposta-${conversa.id}`}
                    ref={textareaResposta}
                    value={texto}
                    onChange={(e) => {
                      const valor = e.target.value;
                      const caret = e.target.selectionStart;
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
                    rows={2}
                    disabled={janelaFechada || ocupado}
                    placeholder={janelaFechada ? 'Janela fechada — texto livre indisponível' : 'Escreva sua resposta…  Digite / para mensagens rápidas'}
                    className="block max-h-40 min-h-[52px] w-full resize-none rounded-t-xl bg-transparent px-3.5 pb-1 pt-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                  />
                  <div className="flex flex-wrap items-center gap-1 px-2 pb-2 pt-1">
                    <button
                      type="button"
                      className={BOTAO_FERRAMENTA}
                      disabled={janelaFechada || ocupado || respostasRapidas.length === 0}
                      title="Inserir mensagem rápida"
                      onClick={() => {
                        const campo = textareaResposta.current;
                        const pos = campo?.selectionStart ?? texto.length;
                        const fim = campo?.selectionEnd ?? pos;
                        setSeletorRapido({ inicio: pos, fim, busca: '' });
                        campo?.focus();
                      }}
                    >
                      <IconeRaio tamanho={15} />
                      Rápidas
                      <kbd className="rounded border border-slate-300 px-1 font-mono text-[11px] text-slate-500">/</kbd>
                    </button>
                    <label title="Anexar arquivo" className={`${BOTAO_FERRAMENTA} ${ocupado || janelaFechada ? 'pointer-events-none opacity-50' : ''}`}>
                      <IconeClipe tamanho={15} />
                      Anexar
                      <input
                        type="file"
                        className="hidden"
                        disabled={ocupado || janelaFechada}
                        onChange={(e) => {
                          const arquivo = e.target.files?.[0];
                          e.target.value = '';
                          if (arquivo) void anexar(arquivo);
                        }}
                      />
                    </label>
                    <span className="ml-auto hidden pr-1 text-xs text-slate-500 md:inline">Enter envia · Shift+Enter quebra linha</span>
                    <button
                      type="submit"
                      disabled={ocupado || janelaFechada || !texto.trim()}
                      className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-4 text-[13px] font-semibold texto-sobre-cor-fixa transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 md:ml-0"
                    >
                      Enviar
                      <IconeEnviar tamanho={14} />
                    </button>
                  </div>
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
                    setErro(err instanceof ApiError ? err.message : 'Falha ao enviar a nota interna');
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                <div className="relative rounded-xl border border-amber-200 bg-amber-50 transition focus-within:border-amber-500">
                  <label htmlFor={`nota-${conversa.id}`} className="sr-only">Nota interna para a equipe</label>
                  <textarea
                    id={`nota-${conversa.id}`}
                    value={textoPrivado}
                    onChange={(e) => setTextoPrivado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.target as HTMLTextAreaElement).form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    placeholder="Escreva uma nota interna... só a equipe vê (Enter envia, Shift+Enter quebra linha)"
                    className="block max-h-40 min-h-[52px] w-full resize-none rounded-t-xl bg-transparent px-3.5 pb-1 pt-3 text-sm text-slate-800 outline-none placeholder:text-slate-500"
                  />
                  <div className="flex flex-wrap items-center gap-1 px-2 pb-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 px-1.5 text-xs text-amber-700">
                      <IconeCadeado tamanho={13} />
                      O cliente não vê esta nota
                    </span>
                    <label
                      title="Anexar arquivo (nota interna)"
                      className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-amber-700 hover:bg-amber-200/40 ${ocupado ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <IconeClipe tamanho={15} />
                      Anexar
                      <input
                        type="file"
                        className="hidden"
                        disabled={ocupado}
                        onChange={(e) => {
                          const arquivo = e.target.files?.[0];
                          e.target.value = '';
                          if (arquivo) void anexar(arquivo, true);
                        }}
                      />
                    </label>
                    {/* Cor fixa nos dois temas: o ambar da escala vira tom claro no escuro e apagaria o texto branco. */}
                    <button
                      type="submit"
                      disabled={ocupado || !textoPrivado.trim()}
                      className="ml-auto inline-flex h-9 items-center rounded-lg px-4 text-[13px] font-semibold texto-sobre-cor-fixa transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: '#b54708' }}
                    >
                      Salvar nota
                    </button>
                  </div>
                </div>
              </form>
            )}
          </>
        )}
        </div>
      </footer>}
    </div>
  );
}
