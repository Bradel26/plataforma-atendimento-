import { useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button, Select } from '../../components/ui';
import { EditorEtiquetas } from '../../pages/crm/Etiquetas';
import { ApiError, api } from '../../lib/api';
import { LABEL_CONVERSA_STATUS, type ConversaDetalhe, type Mensagem, type Usuario } from '../../lib/types';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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

function Bolha({ mensagem }: { mensagem: Mensagem }) {
  if (mensagem.autor === 'SISTEMA') {
    return (
      <li className="my-2 text-center">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{mensagem.conteudo}</span>
      </li>
    );
  }

  const doAgente = mensagem.autor === 'AGENTE';
  return (
    <li className={`flex ${doAgente ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
          doAgente ? 'text-white' : 'border border-slate-200 bg-white text-slate-800'
        }`}
        style={doAgente ? { backgroundColor: 'var(--brand-primary)' } : undefined}
      >
        <Anexo mensagem={mensagem} />
        <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
        <p className={`mt-1 text-right text-[10px] ${doAgente ? 'text-white/70' : 'text-slate-500'}`}>
          {hora(mensagem.criadoEm)}
        </p>
      </div>
    </li>
  );
}

export function PainelChat({
  conversa,
  agentes,
  onMudou,
  aoVoltarParaLista,
  aoAlternarFicha,
  fichaAberta,
}: {
  conversa: ConversaDetalhe;
  agentes: Usuario[];
  onMudou: (detalhe: ConversaDetalhe) => void;
  /** So existe no passo mobile "chat": volta pra lista sem perder a conversa aberta. */
  aoVoltarParaLista?: () => void;
  /** So existe fora do desktop, onde a ficha e um drawer/passo em vez de coluna fixa. */
  aoAlternarFicha?: () => void;
  fichaAberta?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [anteriores, setAnteriores] = useState<Mensagem[]>([]);
  const [cursorHistorico, setCursorHistorico] = useState<string | null>(null);
  const [fimDoHistorico, setFimDoHistorico] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const rascunhos = useRef<Map<string, string>>(new Map());
  const conversaIdAnterior = useRef(conversa.id);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [conversa.mensagens.length, conversa.id]);

  // Trocar de conversa zera o historico carregado: sem isto, as mensagens
  // antigas de uma conversa apareceriam no topo da proxima.
  useEffect(() => {
    setAnteriores([]);
    setCursorHistorico(null);
    setFimDoHistorico(false);
  }, [conversa.id]);

  /*
   * O rascunho nao enviado troca junto com a conversa, em vez de vazar de uma
   * pra outra ou se perder.
   *
   * Sem isto, o campo de texto e um unico `useState` que sobrevive a troca de
   * conversa (o componente nao desmonta): quem comecava a escrever pra um
   * cliente, trocava de aba pra atender outro, e via o texto do primeiro
   * aparecer na caixa do segundo — ou pior, mandava sem perceber. Guardar por
   * `conversa.id` deixa cada conversa com o proprio rascunho, do jeito que
   * WhatsApp Web e qualquer mensageiro profissional ja fazem.
   */
  useEffect(() => {
    const idAnterior = conversaIdAnterior.current;
    if (idAnterior === conversa.id) return;
    rascunhos.current.set(idAnterior, texto);
    setTexto(rascunhos.current.get(conversa.id) ?? '');
    conversaIdAnterior.current = conversa.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id]);

  const finalizada = conversa.status === 'FINALIZADO';

  const executar = async (acao: () => Promise<{ conversa: ConversaDetalhe }>) => {
    setErro(null);
    setOcupado(true);
    try {
      const { conversa: nova } = await acao();
      onMudou(nova);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha na operacao');
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return;
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
      setAnteriores((atual) => [...resp.mensagens, ...atual]);
      setCursorHistorico(resp.proximoCursor);
      setFimDoHistorico(resp.proximoCursor === null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao carregar o historico');
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Anexo do agente. A legenda vai junto quando o campo de texto tem algo
   * escrito: e o comportamento que o agente espera de qualquer mensageiro.
   */
  const anexar = async (arquivo: File) => {
    setErro(null);
    setOcupado(true);
    try {
      const resp = await api.upload<{ mensagem: Mensagem; conversa: ConversaDetalhe }>(
        `/conversas/${conversa.id}/anexos`,
        arquivo,
        'arquivo',
        texto.trim() ? { legenda: texto.trim() } : undefined,
      );
      setTexto('');
      onMudou(resp.conversa);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao enviar o arquivo');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* So existe no passo mobile "chat" — no notebook/tablet/desktop a
              lista fica sempre visivel ao lado, sem precisar de volta. */}
          {aoVoltarParaLista && (
            <Button
              variante="neutro"
              tamanho="sm"
              onClick={aoVoltarParaLista}
              aria-label="Voltar para a lista de conversas"
              className="shrink-0"
            >
              &larr;
            </Button>
          )}
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
          >
            {conversa.contato.nome.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{conversa.contato.nome}</p>
            <p className="truncate text-xs text-slate-500">
              {conversa.contato.email ?? conversa.contato.telefone ?? 'Sem contato informado'}
              {conversa.fila ? ` · ${conversa.fila.nome}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tom={finalizada ? 'neutro' : 'sucesso'}>{LABEL_CONVERSA_STATUS[conversa.status]}</Badge>
          {/* Arquivamento e ortogonal ao status (Fase 11.9-B): a conversa pode
              estar arquivada em qualquer um dos badges acima. */}
          {conversa.arquivada && <Badge tom="neutro">Arquivada</Badge>}

          {/* So existe fora do desktop: la a ficha e coluna fixa e sempre
              visivel, entao um botao pra abrir o que ja esta aberto so
              ocuparia espaco atoa. */}
          {aoAlternarFicha && (
            <Button
              variante={fichaAberta ? 'primario' : 'neutro'}
              tamanho="sm"
              onClick={aoAlternarFicha}
              aria-pressed={fichaAberta}
            >
              Ficha do contato
            </Button>
          )}

          {conversa.status === 'EM_ESPERA' && (
            <Button
              disabled={ocupado}
              onClick={() => void executar(() => api.post(`/conversas/${conversa.id}/assumir`))}
            >
              Assumir
            </Button>
          )}

          {!finalizada && (
            <>
              <Select
                aria-label="Transferir para agente"
                disabled={ocupado}
                value=""
                onChange={(e) => {
                  const agenteId = e.target.value;
                  if (agenteId) {
                    void executar(() => api.post(`/conversas/${conversa.id}/transferir`, { agenteId }));
                  }
                }}
                className="w-44"
              >
                <option value="">Transferir para...</option>
                {agentes
                  .filter((a) => a.id !== conversa.agente?.id && a.ativo)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
              </Select>

              {conversa.fila && conversa.agente && (
                <Button
                  variante="neutro"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(() =>
                      api.post(`/conversas/${conversa.id}/transferir`, { filaId: conversa.fila!.id }),
                    )
                  }
                >
                  Devolver a fila
                </Button>
              )}

              <Button
                variante="perigo"
                disabled={ocupado}
                onClick={() => void executar(() => api.post(`/conversas/${conversa.id}/finalizar`))}
              >
                Finalizar
              </Button>
            </>
          )}

          {/*
            Fora do `!finalizada`, de proposito: arquivar e ortogonal ao
            status (Fase 11.9-A/B) — uma conversa finalizada continua
            podendo ser arquivada/desarquivada.
          */}
          <Button
            variante="neutro"
            disabled={ocupado}
            onClick={() =>
              void executar(() =>
                api.post(`/conversas/${conversa.id}/${conversa.arquivada ? 'desarquivar' : 'arquivar'}`),
              )
            }
          >
            {conversa.arquivada ? 'Desarquivar' : 'Arquivar'}
          </Button>
        </div>
      </header>

      {/*
        Barra propria entre o cabecalho e as mensagens.
        Nao entrou no cabecalho porque o editor cresce — o campo de texto abre
        uma lista de sugestoes por baixo, e dentro de um `flex-wrap` com os
        botoes de acao ela empurraria "Finalizar" para outra linha no meio do
        atendimento. Fica acima das mensagens, e nao no rodape, porque
        classificar e contexto do atendimento, nao parte de responder.
      */}
      <div className="flex items-start gap-2 border-b border-slate-100 bg-white px-5 py-2">
        <span className="mt-1 shrink-0 text-xs font-medium text-slate-500">Etiquetas</span>
        <div className="min-w-0 flex-1">
          <EditorEtiquetas
            tags={conversa.tags}
            aoSalvar={async (tags) => {
              const { conversa: nova } = await api.put<{ conversa: ConversaDetalhe }>(
                `/conversas/${conversa.id}/etiquetas`,
                { tags },
              );
              onMudou(nova);
            }}
          />
        </div>
      </div>

      {/*
        Largura maxima no conteudo, nao no fundo: o painel continua esticando
        em telas largas (sem faixa vazia estranha do lado), mas a linha de
        texto para de crescer alem do confortavel pra ler — 75% de uma coluna
        de 1800px+ vira uma bolha do tamanho da tela inteira sem isto.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-4">
        <div className="mx-auto max-w-3xl">
          {(conversa.temHistoricoAnterior ?? false) && !fimDoHistorico && (
            <button
              type="button"
              onClick={() => void carregarAnteriores()}
              disabled={ocupado}
              className="mx-auto mb-3 block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Carregar mensagens anteriores
            </button>
          )}

          <ul className="space-y-2">
            {[...anteriores, ...conversa.mensagens].map((m) => (
              <Bolha key={m.id} mensagem={m} />
            ))}
          </ul>
          <div ref={fim} />
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white p-4">
        <div className="mx-auto max-w-3xl">
        {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}
        {finalizada ? (
          <p className="text-center text-sm text-slate-500">
            Atendimento finalizado em {new Date(conversa.finalizadoEm!).toLocaleString('pt-BR')}.
          </p>
        ) : (
          <form onSubmit={enviar} className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void enviar(e);
                }
              }}
              rows={2}
              placeholder="Escreva sua resposta... (Enter envia, Shift+Enter quebra linha)"
              className="max-h-32 min-h-[44px] flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
            <label
              title="Anexar arquivo"
              className="flex h-[44px] cursor-pointer items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50"
            >
              Anexar
              <input
                type="file"
                className="hidden"
                disabled={ocupado}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = '';
                  if (arquivo) void anexar(arquivo);
                }}
              />
            </label>
            <Button type="submit" disabled={ocupado || !texto.trim()}>
              Enviar
            </Button>
          </form>
        )}
        </div>
      </footer>
    </div>
  );
}
