import { useEffect, useState } from 'react';
import { Alerta, Badge, Card } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  AJUDA_CICLO_DE_VIDA,
  LABEL_CICLO_DE_VIDA,
  type CicloDeVida,
  type FunilDeCicloDeVida as Funil,
} from '../../lib/types';

/**
 * O funil de ciclo de vida (item E.4) — o "Leads -> Suspects" da demonstracao.
 *
 * **Nao e um funil de conversao**, e a tela diz isso com palavras. Isto e uma
 * foto de onde cada contato esta hoje: cada um aparece em exatamente um degrau, e
 * a soma dos degraus e o total da base. Um funil de fluxo responderia outra
 * pergunta (quantos passaram de um degrau ao outro no mes), e ler um como o
 * outro produz a conclusao errada — "perdemos 80% entre lead e cliente" quando o
 * que a foto mostra e que a base e nova.
 *
 * Barras horizontais e nao um funil desenhado: o funil em trapezio faz a area
 * mentir sobre a proporcao, e a barra mede o que ela mostra. Cada barra tem o
 * numero ao lado — nunca so a barra.
 */

/** Marcadores suaves por etapa: ajudam a ler o funil sem competir com a marca. */
const COR_ETAPA: Record<CicloDeVida, { barra: string; ponto: string }> = {
  CLIENTE: { barra: 'bg-emerald-500', ponto: 'bg-emerald-500' },
  EM_NEGOCIACAO: { barra: 'bg-amber-500', ponto: 'bg-amber-500' },
  PERDIDO: { barra: 'bg-rose-400', ponto: 'bg-rose-400' },
  QUALIFICADO: { barra: 'bg-indigo-400', ponto: 'bg-indigo-400' },
  CONTATADO: { barra: 'bg-sky-500', ponto: 'bg-sky-500' },
  LEAD: { barra: 'bg-slate-400', ponto: 'bg-slate-400' },
};

export function FunilDeCicloDeVida({
  aoFiltrar,
  ativos = [],
}: {
  aoFiltrar?: (ciclo: CicloDeVida) => void;
  ativos?: CicloDeVida[];
}) {
  const [funil, setFunil] = useState<Funil | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ funil: Funil }>('/contatos/ciclo-de-vida')
      .then((r) => setFunil(r.funil))
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o ciclo de vida'));
  }, []);

  if (erro) return <Alerta>{erro}</Alerta>;
  if (!funil) {
    return (
      <Card titulo="Ciclo de vida">
        <p className="text-sm text-slate-500">Carregando...</p>
      </Card>
    );
  }

  if (funil.total === 0) {
    return (
      <Card titulo="Ciclo de vida" descricao="Onde cada contato da carteira esta hoje">
        <p className="text-sm text-slate-600">
          Nenhum contato na sua carteira ainda. O degrau de cada um e calculado do que acontece com
          ele &mdash; uma conversa, uma negociação, uma venda &mdash; é não de um campo preenchido a
          mão.
        </p>
      </Card>
    );
  }

  const maior = Math.max(...funil.degraus.map((d) => d.total));

  return (
    <Card
      titulo="Ciclo de vida"
      descricao={`${funil.total} contato(s) na carteira · foto de hoje, não conversão do período`}
    >
      <ul className="space-y-2.5">
        {funil.degraus.map((d) => {
          const ativo = ativos.includes(d.ciclo);
          const conteudo = (
            <>
              <span className="flex w-32 shrink-0 items-center gap-2 text-xs font-medium text-slate-600">
                <span className={`size-2 shrink-0 rounded-full ${COR_ETAPA[d.ciclo].ponto}`} />
                {LABEL_CICLO_DE_VIDA[d.ciclo]}
              </span>
              <span className="h-2.5 min-w-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full transition-[width] duration-500 ${COR_ETAPA[d.ciclo].barra}`}
                  // Largura relativa ao MAIOR degrau, e nao ao total: com uma base
                  // muito concentrada, todas as outras barras ficariam invisiveis.
                  style={{ width: `${maior === 0 ? 0 : Math.max(2, (d.total / maior) * 100)}%` }}
                />
              </span>
              {/* O numero ao lado da barra, sempre. Barra sozinha obriga a
                  estimar de olho, e a fracao vem depois porque ela e derivada. */}
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
                <strong className="font-semibold text-slate-700">{d.total}</strong>
                {d.fracao !== null && ` · ${Math.round(d.fracao * 100)}%`}
              </span>
            </>
          );

          const linha = 'flex items-center gap-2';

          return (
            <li key={d.ciclo} title={AJUDA_CICLO_DE_VIDA[d.ciclo]}>
              {aoFiltrar ? (
                <button
                  type="button"
                  onClick={() => aoFiltrar(d.ciclo)}
                  className={`${linha} w-full rounded px-1 py-0.5 text-left hover:bg-slate-50 ${
                    ativo ? 'bg-slate-100 ring-1 ring-slate-300' : ''
                  }`}
                  aria-pressed={ativo}
                >
                  {conteudo}
                </button>
              ) : (
                <div className={`${linha} px-1 py-0.5`}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
        <Badge tom="neutro">derivado</Badge>
        <p className="max-w-2xl text-[11px] leading-relaxed text-slate-500">
          Nenhum degrau e digitado: o ciclo sai do que a plataforma já sabe. Não existe degrau
          &ldquo;inativo&rdquo; porque ele exigiria um limite de dias que seria escolhido no escuro.
        </p>
      </div>
    </Card>
  );
}
