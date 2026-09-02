import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Card, EmptyState, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { TagEmUso } from './Etiquetas';

/**
 * Gestao de etiquetas: renomear, fundir e remover.
 *
 * Existe porque etiqueta escrita a mao suja com o uso — `revenda` e `revendas`
 * convivendo, a que alguem criou por engano, a que perdeu o sentido. Sem esta
 * tela, consertar exigiria abrir cada registro; com dez clientes da para fazer,
 * com mil nao.
 *
 * Fica no CRM, e nao em Configuracoes, porque e aqui que a pessoa esta quando
 * percebe a bagunca — ela viu duas grafias no filtro.
 */

/** Renomear para uma etiqueta que ja existe funde as duas. */
type Alvo = { tag: string; acao: 'renomear' | 'remover' };

export function EtiquetasTab() {
  const [tags, setTags] = useState<TagEmUso[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const { tags: lista } = await api.get<{ tags: TagEmUso[] }>('/tags?limite=200');
      setTags(lista);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as etiquetas');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const fechar = () => {
    setAlvo(null);
    setNovoNome('');
  };

  const renomear = async () => {
    if (!alvo) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.patch<{ de: string; para: string; contatos: number; contas: number; conversas: number }>(
        '/tags',
        { de: alvo.tag, para: novoNome },
      );
      // O aviso diz **quantos** registros mudaram, e nao "pronto": esta acao
      // alcanca registros que quem clicou nao esta vendo, e o numero e a unica
      // forma de perceber que ela pegou mais do que se esperava.
      setAviso(
        `"${r.de}" virou "${r.para}" em ${r.contatos} contato(s), ${r.contas} cliente(s) e ${r.conversas} conversa(s).`,
      );
      fechar();
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao renomear');
    } finally {
      setOcupado(false);
    }
  };

  const remover = async () => {
    if (!alvo) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.del<{ tag: string; contatos: number; contas: number; conversas: number }>(
        `/tags/${encodeURIComponent(alvo.tag)}`,
      );
      setAviso(
        `"${r.tag}" removida de ${r.contatos} contato(s), ${r.contas} cliente(s) e ${r.conversas} conversa(s).`,
      );
      fechar();
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao remover');
    } finally {
      setOcupado(false);
    }
  };

  const filtradas = busca.trim()
    ? tags.filter((t) => t.tag.includes(busca.trim().toLocaleLowerCase('pt-BR')))
    : tags;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card
        titulo="Etiquetas em uso"
        descricao={`${tags.length} etiqueta(s) · ${tags.reduce((s, t) => s + t.total, 0)} uso(s)`}
      >
        <Input
          placeholder="Filtrar etiquetas"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Filtrar etiquetas"
        />

        {erro && (
          <div className="mt-3">
            <Alerta>{erro}</Alerta>
          </div>
        )}
        {aviso && (
          <div className="mt-3 flex items-start gap-2">
            <div className="flex-1">
              <Alerta tipo="sucesso">{aviso}</Alerta>
            </div>
            <button
              type="button"
              onClick={() => setAviso(null)}
              aria-label="Fechar aviso"
              className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="mt-3 max-h-[65vh] overflow-y-auto">
          {filtradas.length === 0 ? (
            <EmptyState
              titulo="Nenhuma etiqueta"
              descricao={
                tags.length > 0
                  ? 'Nenhuma etiqueta com esse filtro.'
                  : 'Etiquete um contato, um cliente ou uma conversa e a etiqueta aparece aqui.'
              }
            />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Etiquetas em uso, com quantos registros cada uma tem</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                  <th scope="col" className="py-2">Etiqueta</th>
                  <th scope="col" className="py-2 text-right">Contatos</th>
                  <th scope="col" className="py-2 text-right">Clientes</th>
                  <th scope="col" className="py-2 text-right">Conversas</th>
                  <th scope="col" className="py-2 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtradas.map((t) => (
                  <tr key={t.tag}>
                    <td className="py-2 text-slate-800 dark:text-slate-200">{t.tag}</td>
                    {/* `tabular-nums`: numeros em coluna que nao se alinham
                        obrigam a ler linha por linha para comparar. */}
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {t.contatos}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {t.contas}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {t.conversas}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAlvo({ tag: t.tag, acao: 'renomear' });
                            setNovoNome(t.tag);
                          }}
                          // O nome da etiqueta entra no rotulo: com trinta
                          // linhas, trinta botoes "Renomear" nao dizem qual e
                          // qual para quem usa leitor de tela.
                          aria-label={`Renomear etiqueta ${t.tag}`}
                          className="text-xs text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                        >
                          Renomear
                        </button>
                        <button
                          type="button"
                          onClick={() => setAlvo({ tag: t.tag, acao: 'remover' })}
                          aria-label={`Remover etiqueta ${t.tag}`}
                          className="text-xs text-rose-600 underline-offset-2 hover:underline dark:text-rose-400"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="space-y-5">
        {alvo?.acao === 'renomear' && (
          <Card titulo={`Renomear "${alvo.tag}"`}>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void renomear();
              }}
            >
              <Input
                autoFocus
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                maxLength={30}
                aria-label="Nome novo"
              />
              {/*
                A fusao e o motivo principal desta tela, e por isso ela e
                anunciada antes de acontecer: digitar uma etiqueta que ja existe
                junta as duas, e alguem que esperava um erro perderia a
                distincao sem saber.
              */}
              {tags.some((t) => t.tag === novoNome.trim().toLocaleLowerCase('pt-BR')) &&
                novoNome.trim().toLocaleLowerCase('pt-BR') !== alvo.tag && (
                  <Alerta>
                    "{novoNome.trim().toLocaleLowerCase('pt-BR')}" ja existe — as duas serao
                    <strong> fundidas</strong> numa so.
                  </Alerta>
                )}
              <div className="flex gap-2">
                <Button type="submit" disabled={ocupado || novoNome.trim().length < 1}>
                  {ocupado ? 'Renomeando...' : 'Renomear'}
                </Button>
                <Button variante="neutro" onClick={fechar} type="button">
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {alvo?.acao === 'remover' && (
          <Card titulo={`Remover "${alvo.tag}"`}>
            {/* Remover nao tem desfazer, e alcanca registros fora da tela: por
                isso a confirmacao diz o tamanho do estrago antes, e nao depois. */}
            <p className="text-sm text-slate-600 dark:text-slate-400">
              A etiqueta sai de{' '}
              <strong>
                {tags.find((t) => t.tag === alvo.tag)?.contatos ?? 0} contato(s),{' '}
                {tags.find((t) => t.tag === alvo.tag)?.contas ?? 0} cliente(s) e{' '}
                {tags.find((t) => t.tag === alvo.tag)?.conversas ?? 0} conversa(s)
              </strong>
              . Nao ha como desfazer.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variante="perigo" onClick={() => void remover()} disabled={ocupado}>
                {ocupado ? 'Removendo...' : 'Remover mesmo assim'}
              </Button>
              <Button variante="neutro" onClick={fechar}>
                Cancelar
              </Button>
            </div>
          </Card>
        )}

        {!alvo && (
          <Card titulo="Como funciona">
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                Etiqueta e escrita a mao na ficha do contato ou do cliente — nao ha cadastro previo.
              </li>
              <li>
                Maiusculas, espaco sobrando e acento duplicado sao normalizados: <code>Revenda</code>{' '}
                e <code>revenda</code> sao a mesma etiqueta.
              </li>
              <li>
                <strong>Renomear para uma etiqueta que ja existe funde as duas.</strong> E assim que
                se conserta <code>revenda</code> e <code>revendas</code>.
              </li>
              <li>Renomear e remover valem para a organizacao inteira, inclusive registros que voce nao ve.</li>
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
