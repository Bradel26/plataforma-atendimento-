import { useEffect, useState } from 'react';
import { Alerta, Button, Field, Input, Select } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { moeda, type Oportunidade, type Produto, type Recorrencia } from '../../../lib/types';

/**
 * Editor de itens da proposta — item 2.1 do plano em ANALISE-CRM.md.
 *
 * Antes disto o navegador **nao editava item nenhum**: a tabela era so leitura e
 * os itens só entravam pela API. Um desconto que ninguem consegue digitar nao e
 * um recurso, e por isso o editor faz parte do 2.1 e nao de um item futuro.
 *
 * A rota e um PUT que **substitui a lista inteira**, e o editor reflete isso: ele
 * carrega o estado atual, deixa mexer e envia tudo de uma vez. Salvar parcial —
 * uma linha por requisicao — abriria a janela em que a proposta esta metade nova
 * e metade velha, e e nessa janela que alguem imprime.
 */

type Linha = {
  /** Identidade local da linha. O id do banco morre a cada PUT. */
  chave: string;
  produtoId: string;
  quantidade: string;
  precoUnitario: string;
  acrescimo: string;
  desconto: string;
  recorrencia: Recorrencia;
  custoUnitario: string;
};

const vazia = (): Linha => ({
  chave: crypto.randomUUID(),
  produtoId: '',
  quantidade: '1',
  precoUnitario: '',
  acrescimo: '0',
  desconto: '0',
  recorrencia: 'UNICO',
  custoUnitario: '',
});

const daOportunidade = (o: Oportunidade): Linha[] =>
  o.itens.map((i) => ({
    chave: i.id,
    produtoId: i.produto.id,
    quantidade: String(i.quantidade),
    precoUnitario: String(i.precoUnitario),
    acrescimo: String(i.acrescimo),
    desconto: String(i.desconto),
    recorrencia: i.recorrencia,
    custoUnitario: i.custoUnitario === null ? '' : String(i.custoUnitario),
  }));

/** Campo em branco vira 0; campo com texto invalido tambem, e o servidor recusa. */
const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Previa do liquido da linha, calculada no navegador.
 *
 * Duplica a aritmetica do servidor de proposito: sem previa, quem digita um
 * desconto so descobre o efeito depois de salvar. A fonte da verdade continua
 * sendo o servidor — o valor exibido depois de salvar vem dele, e se os dois
 * discordarem o que aparece na tela e o do servidor.
 */
const liquidoDaLinha = (l: Linha) => num(l.quantidade) * num(l.precoUnitario) + num(l.acrescimo) - num(l.desconto);

export function EditorDeItens({
  oportunidade,
  aoSalvar,
  aoCancelar,
}: {
  oportunidade: Oportunidade;
  aoSalvar: () => void;
  aoCancelar: () => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const atuais = daOportunidade(oportunidade);
    return atuais.length > 0 ? atuais : [vazia()];
  });
  const [meses, setMeses] = useState(String(oportunidade.mesesRecorrencia ?? 12));
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void api
      .get<{ produtos: Produto[] }>('/produtos?limite=200')
      .then((p) => setProdutos(p.produtos))
      .catch(() => setErro('Falha ao carregar os produtos'));
  }, []);

  const mexer = (chave: string, campo: keyof Linha, valor: string) =>
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const itens = linhas
        // Linha sem produto e linha que o operador comecou e nao terminou:
        // descartar em silencio e melhor que 400 dizendo "produtoId invalido".
        .filter((l) => l.produtoId)
        .map((l) => ({
          produtoId: l.produtoId,
          quantidade: Math.max(1, Math.trunc(num(l.quantidade))),
          precoUnitario: num(l.precoUnitario),
          acrescimo: num(l.acrescimo),
          desconto: num(l.desconto),
          recorrencia: l.recorrencia,
          // String vazia manda `null`, e nao 0: custo em branco significa "nao
          // informado", e zero afirmaria que o produto nao custa nada — a tela
          // passaria a mostrar 100% de margem.
          custoUnitario: l.custoUnitario.trim() === '' ? null : num(l.custoUnitario),
        }));

      if (itens.length === 0) {
        setErro('Informe ao menos um item, ou cancele para manter a proposta como esta.');
        setSalvando(false);
        return;
      }

      await api.put(`/oportunidades/${oportunidade.id}/itens`, {
        itens,
        mesesRecorrencia: Math.max(0, Math.trunc(num(meses))),
      });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar os itens');
    } finally {
      setSalvando(false);
    }
  };

  const unico = linhas.filter((l) => l.recorrencia === 'UNICO').reduce((a, l) => a + liquidoDaLinha(l), 0);
  const mensal = linhas.filter((l) => l.recorrencia === 'MENSAL').reduce((a, l) => a + liquidoDaLinha(l), 0);
  const negativas = linhas.filter((l) => l.produtoId && liquidoDaLinha(l) < 0);

  return (
    <div className="space-y-3">
      {erro && <Alerta>{erro}</Alerta>}

      {negativas.length > 0 && (
        <Alerta>
          {negativas.length === 1
            ? 'Uma linha ficou com total negativo: o desconto passou do valor dela.'
            : `${negativas.length} linhas ficaram com total negativo: o desconto passou do valor delas.`}
        </Alerta>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <caption className="sr-only">Itens da proposta, editaveis</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="pb-2 pr-2">Produto</th>
              <th scope="col" className="pb-2 pr-2 text-right">Qtd.</th>
              <th scope="col" className="pb-2 pr-2 text-right">Preco</th>
              <th scope="col" className="pb-2 pr-2 text-right">Acresc.</th>
              <th scope="col" className="pb-2 pr-2 text-right">Desc.</th>
              <th scope="col" className="pb-2 pr-2">Cobranca</th>
              <th scope="col" className="pb-2 pr-2 text-right">Custo un.</th>
              <th scope="col" className="pb-2 pr-2 text-right">Total</th>
              <th scope="col" className="pb-2"><span className="sr-only">Remover</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const liquido = liquidoDaLinha(l);
              return (
                <tr key={l.chave} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-2">
                    <Select
                      aria-label="Produto"
                      value={l.produtoId}
                      onChange={(e) => {
                        const id = e.target.value;
                        mexer(l.chave, 'produtoId', id);
                      }}
                    >
                      <option value="">Selecione</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      aria-label="Quantidade"
                      className="w-16 text-right"
                      value={l.quantidade}
                      onChange={(e) => mexer(l.chave, 'quantidade', e.target.value)}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      aria-label="Preco unitario"
                      className="w-24 text-right"
                      placeholder="catalogo"
                      value={l.precoUnitario}
                      onChange={(e) => mexer(l.chave, 'precoUnitario', e.target.value)}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      aria-label="Acrescimo"
                      className="w-20 text-right"
                      value={l.acrescimo}
                      onChange={(e) => mexer(l.chave, 'acrescimo', e.target.value)}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      aria-label="Desconto"
                      className="w-20 text-right"
                      value={l.desconto}
                      onChange={(e) => mexer(l.chave, 'desconto', e.target.value)}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select
                      aria-label="Cobranca"
                      value={l.recorrencia}
                      onChange={(e) => mexer(l.chave, 'recorrencia', e.target.value)}
                    >
                      <option value="UNICO">Uma vez</option>
                      <option value="MENSAL">Por mes</option>
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      aria-label="Custo unitario"
                      className="w-24 text-right"
                      placeholder="—"
                      value={l.custoUnitario}
                      onChange={(e) => mexer(l.chave, 'custoUnitario', e.target.value)}
                    />
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right font-medium tabular-nums ${
                      liquido < 0 ? 'text-red-600' : 'text-slate-800'
                    }`}
                  >
                    {moeda(liquido)}
                    {l.recorrencia === 'MENSAL' && <span className="block text-xs font-normal text-slate-500">/mes</span>}
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Field
          label="Meses de recorrencia"
          hint="Por quantos meses a parte mensal entra no valor total"
        >
          <Input
            className="w-24"
            value={meses}
            onChange={(e) => setMeses(e.target.value)}
          />
        </Field>
        {/* `role="status"` porque o numero muda enquanto se digita: leitor de tela
            anuncia o total novo sem roubar o foco do campo. De quebra, da nome
            proprio ao resumo — sem isso, "Uma vez" tambem e o rotulo de uma
            opcao do seletor de cobranca, e localizar o resumo por texto casava
            com os dois. */}
        <div
          role="status"
          aria-label="Total da proposta"
          className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
        >
          {/* Os dois valores separados, e o total explicando a conta. Um campo
              unico com "R$ 1.500" para 1.000 uma vez + 500/mes seria o numero de
              nada. */}
          <p className="text-slate-600">
            Uma vez <strong className="font-semibold tabular-nums text-slate-800">{moeda(unico)}</strong>
            {mensal !== 0 && (
              <>
                {' '}· por mes <strong className="font-semibold tabular-nums text-slate-800">{moeda(mensal)}</strong>
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Valor total: {moeda(unico + mensal * Math.max(0, Math.trunc(num(meses))))}
            {mensal !== 0 && ` (uma vez + ${Math.max(0, Math.trunc(num(meses)))} meses)`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar proposta'}
        </Button>
        <Button variante="neutro" onClick={() => setLinhas((atual) => [...atual, vazia()])} disabled={salvando}>
          Adicionar item
        </Button>
        <Button variante="neutro" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
