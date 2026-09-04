import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  LABEL_SENTIMENTO,
  type AnaliseDaLigacao,
  type SentimentoDaLigacao,
} from '../../lib/types';

/**
 * Assistente da ligacao (item E.2): resumo, sentimento, transcricao e proximas
 * acoes de uma chamada.
 *
 * Duas coisas nesta tela sao decisao de produto, e nao acabamento:
 *
 * 1. **Sem analise nao mostra nada em cinza.** Enquanto nenhum motor tiver
 *    analisado a ligacao, o painel diz isso com palavras. Um "Neutro" ou um
 *    "Resumo: —" faria a ausencia de analise parecer uma analise morna, que e
 *    exatamente a leitura errada que este item existe para evitar.
 * 2. **As proximas acoes viram tarefa.** Era o que a demonstracao mostrava, e e
 *    o que separa o assistente de um resumo bonito: sugestao que nao pode virar
 *    compromisso na agenda de alguem e enfeite.
 */

const TOM: Record<SentimentoDaLigacao, 'sucesso' | 'neutro' | 'alerta'> = {
  POSITIVO: 'sucesso',
  NEUTRO: 'neutro',
  // Ligacao que terminou mal e o unico caso aqui em que alguem precisa agir, e
  // por isso e o unico que ganha ambar.
  NEGATIVO: 'alerta',
};

export function AssistenteDaLigacao({ chamadaId }: { chamadaId: string }) {
  const [analise, setAnalise] = useState<AnaliseDaLigacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verTranscricao, setVerTranscricao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<{ analise: AnaliseDaLigacao }>(`/voz/chamadas/${chamadaId}/analise`);
      setAnalise(r.analise);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a analise da ligacao');
    }
  }, [chamadaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criarTarefa = async (acaoId: string) => {
    setOcupado(acaoId);
    setErro(null);
    try {
      const r = await api.post<{ atividade: { titulo: string; responsavelId: string | null } }>(
        `/voz/chamadas/${chamadaId}/acoes/${acaoId}/tarefa`,
        {},
      );
      // O aviso diz o que foi criado, e nao "sucesso": quem clicou precisa saber
      // que existe agora uma tarefa, e onde ela foi parar.
      setAviso(`Tarefa criada: ${r.atividade.titulo}`);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao criar a tarefa');
    } finally {
      setOcupado(null);
    }
  };

  const descartar = async (acaoId: string) => {
    setOcupado(acaoId);
    setErro(null);
    try {
      const r = await api.post<{ analise: AnaliseDaLigacao }>(
        `/voz/chamadas/${chamadaId}/acoes/${acaoId}/descartar`,
        {},
      );
      setAnalise(r.analise);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao descartar a sugestao');
    } finally {
      setOcupado(null);
    }
  };

  if (erro) return <Alerta>{erro}</Alerta>;
  if (!analise) return <p className="text-sm text-slate-500">Carregando a analise...</p>;

  /*
   * O estado vazio honesto, pelo mesmo raciocinio do medidor de IA (item 6.8).
   *
   * A plataforma nao transcreve: sem motor ligado, nao existe analise nenhuma —
   * e dizer isso e mais util que mostrar campos vazios, que pareceriam falha de
   * carregamento.
   */
  if (analise.estado === 'SEM_ANALISE') {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-3">
        <p className="text-sm text-slate-600">
          Nenhum motor analisou esta ligacao. A plataforma guarda a gravacao e o registro; a
          transcricao, o resumo e o sentimento vem de um motor externo pela ponte de integracao.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Enquanto isso, o sentimento fica vazio em vez de "neutro" &mdash; ausencia de analise nao
          e uma ligacao morna.
        </p>
      </div>
    );
  }

  const pendentes = analise.acoes.filter((a) => a.estado === 'PENDENTE');
  const resolvidas = analise.acoes.filter((a) => a.estado !== 'PENDENTE');

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <div className="flex flex-wrap items-center gap-2">
        {analise.sentimento ? (
          <Badge tom={TOM[analise.sentimento]}>{LABEL_SENTIMENTO[analise.sentimento]}</Badge>
        ) : (
          <span className="text-xs text-slate-500">Sentimento nao lido pelo motor</span>
        )}
        {analise.analisadoPor && (
          <span className="text-xs text-slate-500">
            analise de <strong className="font-medium text-slate-600">{analise.analisadoPor}</strong>
          </span>
        )}
      </div>

      {analise.resumo ? (
        <div>
          <p className="text-xs font-medium text-slate-500">Resumo</p>
          <p className="mt-0.5 text-sm text-slate-800">{analise.resumo}</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">O motor nao mandou resumo desta ligacao.</p>
      )}

      <div>
        <p className="text-xs font-medium text-slate-500">
          Proximas acoes {pendentes.length > 0 && `(${pendentes.length} em aberto)`}
        </p>
        {analise.acoes.length === 0 ? (
          // Analisada e sem sugestao e resultado legitimo, e a frase diz isso —
          // "nenhuma acao" aqui nao significa "o motor falhou".
          <p className="mt-0.5 text-sm text-slate-600">
            O motor ouviu a ligacao e nao sugeriu nenhuma proxima acao.
          </p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {[...pendentes, ...resolvidas].map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className={a.estado === 'PENDENTE' ? 'text-slate-800' : 'text-slate-400 line-through'}>
                  {a.texto}
                </span>
                {a.estado === 'VIROU_TAREFA' && <Badge tom="sucesso">virou tarefa</Badge>}
                {a.estado === 'DESCARTADA' && <Badge tom="neutro">descartada</Badge>}
                {a.estado === 'PENDENTE' &&
                  // O motivo aparece NO LUGAR do botao. Um botao que falha depois
                  // do clique ensina a nao clicar.
                  (a.impedimento ? (
                    <span className="text-xs text-slate-500">{a.impedimento}</span>
                  ) : (
                    <>
                      <Button
                        variante="neutro"
                        onClick={() => void criarTarefa(a.id)}
                        disabled={ocupado === a.id}
                      >
                        Criar tarefa
                      </Button>
                      <button
                        type="button"
                        onClick={() => void descartar(a.id)}
                        disabled={ocupado === a.id}
                        className="text-xs text-slate-500 underline-offset-2 hover:underline"
                      >
                        Descartar
                      </button>
                    </>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {analise.transcricao && (
        <div>
          <button
            type="button"
            onClick={() => setVerTranscricao((v) => !v)}
            className="text-xs text-slate-600 underline-offset-2 hover:underline"
          >
            {verTranscricao ? 'Esconder transcricao' : 'Ver transcricao'}
          </button>
          {/* Fechada por padrao: transcricao de tres minutos empurraria o resumo
              e as acoes para fora da tela, e sao eles que decidem o que fazer. */}
          {verTranscricao && (
            <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
              {analise.transcricao}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
