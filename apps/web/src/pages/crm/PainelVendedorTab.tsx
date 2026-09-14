import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { StatTile } from '../../components/viz/StatTile';
import { duracao } from '../../lib/viz';
import { ApiError, api } from '../../lib/api';
import { moeda, type ResumoVendedor, type VendedorOpcao } from '../../lib/types';

const mesCorrente = () => new Date().toISOString().slice(0, 7);

/**
 * Painel individual do vendedor (item §16 do modelo de CRM auditado): so numeros
 * agregados nesta v1, sem drill-down — quem quiser a lista, abre Conversas ou
 * Oportunidades e filtra por essa pessoa, que ja existem para isso.
 */
export function PainelVendedorTab() {
  const [vendedores, setVendedores] = useState<VendedorOpcao[] | null>(null);
  const [vendedorId, setVendedorId] = useState('');
  const [mes, setMes] = useState(mesCorrente());
  const [resumo, setResumo] = useState<ResumoVendedor | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ vendedores: VendedorOpcao[] }>('/vendedores')
      .then(({ vendedores: lista }) => {
        setVendedores(lista);
        // Sem selecao explicita, comeca no primeiro — quem so ve a si mesmo (a lista
        // tem um item so) ja abre direto no proprio resumo, sem precisar escolher.
        const primeiro = lista[0];
        if (primeiro) setVendedorId((atual) => atual || primeiro.id);
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar vendedores'));
  }, []);

  const carregarResumo = useCallback(async () => {
    // Campo "month" pode ser limpo pelo usuario; mandar `?mes=` vazio so faria o
    // regex do backend recusar e aparecer erro cru na tela. Sem mes, deixa o
    // backend usar o proprio padrao (mes corrente).
    if (!vendedorId || !mes) return;
    try {
      setResumo(await api.get<ResumoVendedor>(`/vendedores/${vendedorId}/resumo?mes=${mes}`));
      setErro(null);
    } catch (e) {
      // Nao deixa o resumo do vendedor/mes anterior na tela sob um erro novo —
      // pareceria que os numeros antigos ainda valem.
      setResumo(null);
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o resumo');
    }
  }, [vendedorId, mes]);

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  if (vendedores === null) return <p className="text-sm text-slate-500">Carregando...</p>;

  if (vendedores.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum vendedor visivel"
        descricao="Nao ha, dentro do que voce pode ver, nenhum vendedor cadastrado."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card titulo="Painel do vendedor" descricao="Indicadores combinados de um vendedor, por mes">
        <div className="flex flex-wrap gap-3">
          <Field label="Vendedor">
            <Select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="w-64">
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mes">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="max-w-[180px]" />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      {resumo && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile rotulo="Clientes atendidos" valor={resumo.clientesAtendidos} />
            <StatTile rotulo="Conversas" valor={resumo.conversas.total} detalhe={`${resumo.conversas.abertas} aberta(s)`} />
            <StatTile rotulo="TME" valor={duracao(resumo.tempos.tmeSegundos)} detalhe="tempo medio de espera" />
            <StatTile rotulo="TMA" valor={duracao(resumo.tempos.tmaSegundos)} detalhe="tempo medio de atendimento" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile rotulo="Oportunidades abertas" valor={resumo.oportunidades.abertas} />
            <StatTile rotulo="Propostas" valor={resumo.propostas} detalhe="geradas no periodo" />
            <StatTile rotulo="Vendas" valor={resumo.vendas.quantidade} detalhe={moeda(resumo.vendas.valor)} />
            <StatTile
              rotulo="Conversao"
              valor={resumo.conversao === null ? '—' : `${Math.round(resumo.conversao * 100)}%`}
              detalhe="ganhas sobre fechadas"
            />
          </div>

          <Card
            titulo="Meta do mes"
            descricao={resumo.meta.definida ? undefined : 'Ninguem definiu uma meta para esta pessoa neste mes'}
          >
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Meta</dt>
                <dd className="text-slate-800">{moeda(resumo.meta.valor)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Realizado</dt>
                <dd className="text-slate-800">{moeda(resumo.vendas.valor)}</dd>
              </div>
            </dl>
          </Card>

          <Card titulo="WhatsApp" descricao="Numeros cadastrados como linha pessoal desta pessoa">
            {resumo.whatsapp.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum numero pessoal cadastrado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {resumo.whatsapp.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">{c.nome ?? 'Sem rotulo'}</span>
                    <span className="flex items-center gap-2">
                      {c.modo && <span className="text-xs text-slate-500">{c.modo === 'OFICIAL' ? 'Oficial' : 'Nao oficial'}</span>}
                      <Badge tom={c.ativo ? 'sucesso' : 'neutro'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
