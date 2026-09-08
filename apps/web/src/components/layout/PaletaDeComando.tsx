import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../features/auth/AuthProvider';
import { ROTULO_TIPO, montarPaleta, moverSelecao, type ItemDaPaleta } from './paleta';

/**
 * Paleta de comando com `Ctrl+K` (item 6.2 do plano em ANALISE-CRM.md) — o
 * "Explorar" do Néctar.
 *
 * Duas coisas na mesma caixa: ir para uma tela e achar um registro. Separadas em
 * dois atalhos, ninguém decoraria os dois; e a pergunta de quem aperta `Ctrl+K`
 * é a mesma nos dois casos — "me leva até isso".
 *
 * A decisão de escopo mora na API: cada domínio filtra pela própria política de
 * visibilidade. Aqui não há filtro nenhum, de propósito — filtrar no navegador
 * seria esconder na tela o que já veio pela rede.
 */

type Resultado = {
  tipo: 'CONTATO' | 'CONTA' | 'OPORTUNIDADE' | 'PROTOCOLO';
  id: string;
  titulo: string;
  detalhe: string | null;
  rota: string;
};

export function PaletaDeComando() {
  const [aberta, setAberta] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [selecionado, setSelecionado] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const itens: ItemDaPaleta[] = usuario ? montarPaleta(usuario.perfil, termo, resultados) : [];

  const fechar = useCallback(() => {
    setAberta(false);
    setTermo('');
    setResultados([]);
    setSelecionado(0);
  }, []);

  /* Atalho global. `Ctrl+K` e `Cmd+K` — a mesma tecla nos dois sistemas. */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // `preventDefault` porque `Ctrl+K` é a busca de link em alguns
        // navegadores: sem isso, os dois acontecem.
        e.preventDefault();
        setAberta((a) => !a);
      }
      if (e.key === 'Escape') setAberta(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  useEffect(() => {
    if (aberta) campo.current?.focus();
  }, [aberta]);

  /*
   * A busca é adiada em 200ms.
   *
   * Sem isso, "acougue" dispara sete consultas a quatro tabelas cada, e a
   * resposta da quarta letra pode chegar depois da sétima — a lista mostraria o
   * resultado de um termo que a pessoa já apagou.
   */
  useEffect(() => {
    if (!aberta) return;
    const q = termo.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }

    let valido = true;
    setBuscando(true);
    const t = setTimeout(() => {
      void api
        .get<{ resultados: Resultado[] }>(`/busca?q=${encodeURIComponent(q)}`)
        .then((r) => {
          // `valido` descarta a resposta de um termo antigo: sem essa guarda, a
          // consulta mais lenta sobrescreve a mais recente.
          if (valido) setResultados(r.resultados);
        })
        .catch(() => {
          if (valido) setResultados([]);
        })
        .finally(() => {
          if (valido) setBuscando(false);
        });
    }, 200);

    return () => {
      valido = false;
      clearTimeout(t);
    };
  }, [aberta, termo]);

  // A seleção volta ao topo quando a lista muda: manter o índice faria a seta
  // apontar para um item que saiu do lugar.
  useEffect(() => setSelecionado(0), [termo, resultados.length]);

  if (!aberta || !usuario) return null;

  const escolher = (item: ItemDaPaleta) => {
    navigate(item.rota);
    fechar();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comando"
      // `bg-black/30`, nao `bg-slate-900/30` — a escala slate inverte no tema
      // escuro; `black` fica de fora do remapeamento de proposito.
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-24"
      onClick={fechar}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={campo}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelecionado((i) => moverSelecao(i, itens.length, 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelecionado((i) => moverSelecao(i, itens.length, -1));
            }
            if (e.key === 'Enter' && itens[selecionado]) escolher(itens[selecionado]);
          }}
          placeholder="Buscar contato, cliente, oportunidade, protocolo — ou ir para uma tela"
          aria-label="Buscar ou ir para"
          className="anel-de-foco w-full border-b border-slate-200 px-4 py-3 text-sm placeholder:text-slate-400"
        />

        {/*
          O aviso das duas letras e independente da lista estar vazia.
          
          A primeira versao o mostrava so quando nao havia item nenhum — e com uma
          letra digitada os comandos de navegacao ja casam ("a" acha Atendimento),
          entao a lista nao estava vazia e o aviso nunca aparecia. Quem digitou uma
          letra veria telas e concluiria que a busca de registro nao funciona.
        */}
        {termo.trim().length === 1 && (
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            Digite ao menos duas letras para buscar registros.
          </p>
        )}

        <ul className="max-h-80 overflow-y-auto py-1">
          {itens.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">
              {/* "Nada encontrado" durante a busca faria a pessoa desistir antes
                  de a resposta chegar. */}
              {buscando
                ? 'Buscando...'
                : termo.trim().length < 2
                  ? 'Digite ao menos duas letras para buscar registros.'
                  : `Nada encontrado para "${termo.trim()}".`}
            </li>
          )}

          {itens.map((item, i) => (
            <li key={`${item.tipo}-${item.rota}`}>
              <button
                type="button"
                onClick={() => escolher(item)}
                onMouseEnter={() => setSelecionado(i)}
                aria-current={i === selecionado ? 'true' : undefined}
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-sm ${
                  i === selecionado ? 'bg-slate-100' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-slate-800">{item.label}</span>
                  {'detalhe' in item && item.detalhe && (
                    <span className="block truncate text-xs text-slate-500">{item.detalhe}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{ROTULO_TIPO[item.tipo]}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          Setas para navegar · Enter para abrir · Esc para fechar
        </p>
      </div>
    </div>
  );
}
