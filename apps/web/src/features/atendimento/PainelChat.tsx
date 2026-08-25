import { useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button, Select } from '../../components/ui';
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
        <p className={`mt-1 text-right text-[10px] ${doAgente ? 'text-white/70' : 'text-slate-400'}`}>
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
}: {
  conversa: ConversaDetalhe;
  agentes: Usuario[];
  onMudou: (detalhe: ConversaDetalhe) => void;
}) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [conversa.mensagens.length, conversa.id]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{conversa.contato.nome}</p>
          <p className="truncate text-xs text-slate-500">
            {conversa.contato.email ?? conversa.contato.telefone ?? 'Sem contato informado'}
            {conversa.fila ? ` · ${conversa.fila.nome}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tom={finalizada ? 'neutro' : 'sucesso'}>{LABEL_CONVERSA_STATUS[conversa.status]}</Badge>

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
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-4">
        <ul className="space-y-2">
          {conversa.mensagens.map((m) => (
            <Bolha key={m.id} mensagem={m} />
          ))}
        </ul>
        <div ref={fim} />
      </div>

      <footer className="border-t border-slate-200 bg-white p-4">
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
            <Button type="submit" disabled={ocupado || !texto.trim()}>
              Enviar
            </Button>
          </form>
        )}
      </footer>
    </div>
  );
}
