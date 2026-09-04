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

/** Uma cor de marca com opacidade decrescente pela escada. Nunca arco-iris. */
const OPACIDADE: Record<CicloDeVida, string> = {
  CLIENTE: 'opacity-100',
  EM_NEGOCIACAO: 'opacity-80',
  PERDIDO: 'opacity-40',
  QUALIFICADO: 'opacity-60',
  CONTATADO: 'opacity-50',
  LEAD: 'opacity-30',
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
          ele &mdash; uma conversa, uma negociacao, uma venda &mdash; e nao de um campo preenchido a
          mao.
        </p>
      </Card>
    );
  }

  const maior = Math.max(...funil.degraus.map((d) => d.total));

  return (
    <Card
      titulo="Ciclo de vida"
      descricao={`${funil.total} contato(s) na carteira · foto de hoje, nao conversao do periodo`}
    >
      <ul className="space-y-1.5">
        {funil.degraus.map((d) => {
          const ativo = ativos.includes(d.ciclo);
          const conteudo = (
            <>
              <span className="w-32 shrink-0 text-xs text-slate-600">{LABEL_CICLO_DE_VIDA[d.ciclo]}</span>
              <span className="h-3 min-w-1 grow-0 overflow-hidden rounded-sm bg-slate-100">
                <span
                  className={`block h-3 rounded-sm bg-[var(--brand-primary)] ${OPACIDADE[d.ciclo]}`}
                  // Largura relativa ao MAIOR degrau, e nao ao total: com uma base
                  // muito concentrada, todas as outras barras ficariam invisiveis.
                  style={{ width: `${maior === 0 ? 0 : Math.max(2, (d.total / maior) * 100)}%` }}
                />
              </span>
              {/* O numero ao lado da barra, sempre. Barra sozinha obriga a
                  estimar de olho, e a fracao vem depois porque ela e derivada. */}
              <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                {d.total}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tom="neutro">derivado</Badge>
        <p className="text-xs text-slate-500">
          Nenhum degrau e digitado: o ciclo sai do que a plataforma ja sabe. Nao existe degrau
          &ldquo;inativo&rdquo; porque ele exigiria um limite de dias que seria escolhido no escuro.
        </p>
      </div>
    </Card>
  );
}
