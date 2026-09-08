import { useEffect, useState } from 'react';
import { Alerta, Button, Field, Input } from '../../components/ui';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ApiError, api } from '../../lib/api';
import { PALETA_VISAO, type EntidadeVisao, type VisaoSalva } from '../../lib/types';

/**
 * Visoes salvas (item 6.1): um filtro nomeado, com cor, para reabrir depois.
 *
 * Guarda o MESMO filtro que a tela ja tem — nao inventa um segundo vocabulario.
 * `filtroAtual` e `aoAplicar` sao genericos de proposito: o componente nao
 * conhece a forma do filtro de cada tela, so guarda e devolve o que recebeu.
 */

type Props<F extends Record<string, unknown>> = {
  entidade: EntidadeVisao;
  /** O filtro que a tela tem montado agora — o que "Salvar visao atual" grava. */
  filtroAtual: F;
  /** Ha algo preenchido em `filtroAtual`? Sem isso, "salvar" salvaria um filtro vazio sem avisar. */
  filtroVazio: boolean;
  aoAplicar: (filtro: F) => void;
};

export function VisoesSalvas<F extends Record<string, unknown>>({
  entidade,
  filtroAtual,
  filtroVazio,
  aoAplicar,
}: Props<F>) {
  const confirmar = useConfirm();
  const [visoes, setVisoes] = useState<VisaoSalva<F>[]>([]);
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState<string>(PALETA_VISAO[0]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () =>
    api
      .get<{ visoes: VisaoSalva<F>[] }>(`/visoes-salvas?entidade=${entidade}`)
      .then((r) => setVisoes(r.visoes))
      .catch(() => undefined);

  useEffect(() => {
    void carregar();
    // Ao trocar de entidade (nao deveria acontecer no mesmo componente montado,
    // mas por seguranca) ou montar, some a visao ativa: ela pertence a lista
    // anterior.
    setAtivaId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidade]);

  const aplicar = (visao: VisaoSalva<F> | null) => {
    setAtivaId(visao?.id ?? null);
    aoAplicar(visao ? visao.filtro : ({} as F));
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const { visao } = await api.post<{ visao: VisaoSalva<F> }>('/visoes-salvas', {
        entidade,
        nome,
        cor,
        filtro: filtroAtual,
      });
      setNome('');
      await carregar();
      setAtivaId(visao.id);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar a visao');
    } finally {
      setSalvando(false);
    }
  };

  const remover = (visao: VisaoSalva<F>) => {
    confirmar({
      titulo: `Remover a visao "${visao.nome}"?`,
      variante: 'perigo',
      rotuloConfirmar: 'Remover',
      aoConfirmar: async () => {
        setErro(null);
        try {
          await api.del(`/visoes-salvas/${visao.id}`);
          if (ativaId === visao.id) aplicar(null);
          await carregar();
        } catch (e) {
          setErro(e instanceof ApiError ? e.message : 'Falha ao remover a visao');
        }
      },
    });
  };

  return (
    <div className="space-y-2">
      {visoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => aplicar(null)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              ativaId === null ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            Todas
          </button>
          {visoes.map((v) => (
            <span key={v.id} className="group inline-flex items-center">
              <button
                type="button"
                onClick={() => aplicar(v)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  ativaId === v.id ? 'border-transparent text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                style={ativaId === v.id ? { backgroundColor: v.cor } : { borderLeftColor: v.cor, borderLeftWidth: 3 }}
              >
                {v.nome}
              </button>
              <button
                type="button"
                aria-label={`Remover visao ${v.nome}`}
                onClick={() => void remover(v)}
                className="ml-0.5 hidden text-xs text-slate-400 hover:text-red-600 group-hover:inline"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {erro && <Alerta>{erro}</Alerta>}

      {filtroVazio ? (
        <p className="text-xs text-slate-500">Preencha algum filtro para poder salva-lo como visao.</p>
      ) : (
        <form onSubmit={salvar} className="flex flex-wrap items-end gap-2">
          <Field label="Salvar filtro atual como">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da visao"
              maxLength={60}
              required
              className="w-48"
            />
          </Field>
          <div className="flex gap-1 pb-2">
            {PALETA_VISAO.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={cor === c}
                onClick={() => setCor(c)}
                className={`h-6 w-6 rounded-full border-2 ${cor === c ? 'border-slate-700' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button type="submit" variante="neutro" disabled={salvando || nome.trim().length < 2}>
            {salvando ? 'Salvando...' : 'Salvar visao'}
          </Button>
        </form>
      )}
    </div>
  );
}
