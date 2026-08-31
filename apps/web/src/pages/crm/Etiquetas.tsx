import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';

/**
 * Etiquetas: as duas formas de aparecer, num arquivo so.
 *
 * `Etiquetas` mostra (ficha, cartao da lista). `EditorEtiquetas` acrescenta e
 * remove. `FiltroEtiquetas` liga e desliga etiqueta como filtro da listagem.
 *
 * As tres compartilham a mesma aparencia de propositio: se a etiqueta do filtro
 * parecesse diferente da etiqueta da ficha, ninguem entenderia que sao a mesma
 * coisa — e a etiqueta so serve se quem le a associa de imediato.
 */

export type TagEmUso = { tag: string; contatos: number; contas: number; total: number };

const CHIP =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors';

/** Etiquetas em modo leitura. */
export function Etiquetas({ tags, vazio }: { tags: readonly string[]; vazio?: string }) {
  if (tags.length === 0) {
    return vazio ? <p className="text-xs text-slate-400 dark:text-slate-500">{vazio}</p> : null;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag}
          className={`${CHIP} border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300`}
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

type EditorProps = {
  tags: readonly string[];
  /** Grava a lista inteira; quem chama decide a rota (contato ou conta). */
  aoSalvar: (tags: string[]) => Promise<void>;
};

/**
 * Acrescentar e remover etiqueta.
 *
 * Salva a **lista inteira** a cada mudanca, e nao um "adicionar tag". E o que a
 * API expoe (PATCH com `tags`), e evita o estado intermediario em que a tela
 * mostra uma etiqueta que o servidor ainda nao tem.
 */
export function EditorEtiquetas({ tags, aoSalvar }: EditorProps) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<TagEmUso[]>([]);
  const campo = useRef<HTMLInputElement>(null);

  // Sugestao vem do catalogo, que ja respeita o escopo de visibilidade: quem
  // digita so recebe etiquetas de registros que ele mesmo poderia abrir.
  useEffect(() => {
    const termo = texto.trim();
    if (!termo) {
      setSugestoes([]);
      return;
    }
    const t = setTimeout(() => {
      void api
        .get<{ tags: TagEmUso[] }>(`/tags?busca=${encodeURIComponent(termo)}&limite=6`)
        .then(({ tags: lista }) => setSugestoes(lista.filter((s) => !tags.includes(s.tag))))
        .catch(() => setSugestoes([]));
    }, 200);
    return () => clearTimeout(t);
  }, [texto, tags]);

  const gravar = async (proximas: string[]) => {
    setErro(null);
    setSalvando(true);
    try {
      await aoSalvar(proximas);
      setTexto('');
      setSugestoes([]);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar as etiquetas');
    } finally {
      setSalvando(false);
    }
  };

  const acrescentar = (bruta: string) => {
    // A normalizacao de verdade e no servidor; aqui e so para nao mandar
    // duplicata obvia nem lista com espaco. Repetir a regra inteira no front
    // criaria duas versoes dela para divergirem depois.
    const tag = bruta.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    if (!tag || tags.includes(tag)) {
      setTexto('');
      return;
    }
    void gravar([...tags, tag]);
  };

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li
            key={tag}
            className={`${CHIP} border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300`}
          >
            {/* O rotulo num `span` proprio: no `li` ele dividiria o no de texto
                com o `x` do botao, e "a etiqueta tal existe na tela" deixaria de
                ser uma pergunta respondivel — por um teste ou por um leitor de
                tela. */}
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => void gravar(tags.filter((t) => t !== tag))}
              disabled={salvando}
              // O nome no `aria-label` inclui a etiqueta: com dez chips, dez
              // botoes "Remover" nao dizem a um leitor de tela qual e qual.
              aria-label={`Remover etiqueta ${tag}`}
              className="rounded-full px-0.5 text-slate-400 hover:text-rose-600 disabled:opacity-40 dark:hover:text-rose-400"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="relative">
        <input
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // A ficha inteira vive dentro de formularios; sem isto o Enter
              // aqui submeteria outro formulario e recarregaria a tela.
              e.preventDefault();
              acrescentar(texto);
            }
            if (e.key === 'Escape') setTexto('');
          }}
          disabled={salvando}
          maxLength={30}
          placeholder="Nova etiqueta e Enter"
          aria-label="Nova etiqueta"
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />

        {sugestoes.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {sugestoes.map((s) => (
              <li key={s.tag}>
                <button
                  type="button"
                  onClick={() => acrescentar(s.tag)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span>{s.tag}</span>
                  <span className="tabular-nums text-slate-400">{s.total}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erro && <p className="text-xs text-rose-600 dark:text-rose-400">{erro}</p>}
    </div>
  );
}

type FiltroProps = {
  /** Etiquetas ativas no filtro. */
  ativas: readonly string[];
  aoAlternar: (tag: string) => void;
  /** Onde contar: a aba de contatos nao mostra etiqueta que so existe em cliente. */
  campo: 'contatos' | 'contas';
  /**
   * Contador que muda quando alguem etiqueta um registro na ficha.
   *
   * Sem ele o catalogo so era buscado na montagem e ao mudar o filtro, entao a
   * etiqueta recem-criada nao aparecia aqui — o teste de navegador achou isso, e
   * o comentario que estava neste arquivo afirmava o contrario.
   */
  versao?: number;
};

/**
 * Filtro por etiqueta: as mais usadas, clicaveis.
 *
 * Nao e um campo de texto. A pessoa que filtra por etiqueta quase nunca sabe a
 * grafia exata — ela reconhece a etiqueta quando ve. Um `input` aqui devolveria
 * lista vazia por causa de um plural.
 */
/** Quantas etiquetas aparecem antes de "ver todas". */
const VISIVEIS = 12;

export function FiltroEtiquetas({ ativas, aoAlternar, campo, versao = 0 }: FiltroProps) {
  const [tags, setTags] = useState<TagEmUso[]>([]);
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    void api
      .get<{ tags: TagEmUso[] }>('/tags?limite=200')
      .then(({ tags: lista }) => setTags(lista.filter((t) => t[campo] > 0)))
      .catch(() => setTags([]));
  }, [campo, ativas, versao]);

  /*
   * Etiqueta ativa continua visivel mesmo se sair do topo da lista: desligar um
   * filtro tem de ser possivel sem procurar.
   *
   * O corte em `VISIVEIS` existe porque uma carteira etiquetada de verdade passa
   * de cem etiquetas, e cem chips nao sao um filtro — sao uma parede. Mas o
   * corte precisa de saida: sem o "ver todas", tudo o que nao esta no topo fica
   * inalcancavel para sempre, e etiqueta que nao da para filtrar nao serve.
   */
  const mostradas = todas ? tags : tags.slice(0, VISIVEIS);
  const visiveis = [...new Set([...ativas, ...mostradas.map((t) => t.tag)])];
  const escondidas = tags.length - mostradas.length;
  if (visiveis.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visiveis.map((tag) => {
        const ligada = ativas.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => aoAlternar(tag)}
            aria-pressed={ligada}
            className={`${CHIP} ${
              ligada
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {tag}
          </button>
        );
      })}
      {escondidas > 0 && (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="px-1 text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
        >
          +{escondidas} etiquetas
        </button>
      )}
      {todas && tags.length > VISIVEIS && (
        <button
          type="button"
          onClick={() => setTodas(false)}
          className="px-1 text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
        >
          ver menos
        </button>
      )}
      {ativas.length > 0 && (
        <button
          type="button"
          onClick={() => ativas.forEach(aoAlternar)}
          className="px-1 text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
        >
          limpar
        </button>
      )}
    </div>
  );
}
