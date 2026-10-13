import { useCallback, useEffect, useState } from 'react';
import { Alerta, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { StatTile } from '../../components/viz/StatTile';
import { ApiError, api } from '../../lib/api';
import { type ResumoVendedor, type VendedorOpcao } from '../../lib/types';

const mesCorrente = () => new Date().toISOString().slice(0, 7);

/**
 * Painel individual do consultor: so numeros
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
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar consultores'));
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

  // Percentual da meta atingido; sem meta (ou meta zerada) nao ha base de calculo.
  if (vendedores === null) return <p className="text-sm text-slate-500">Carregando...</p>;

  if (vendedores.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum consultor visível"
        descricao="Não há integrantes ativos das equipes comercial ou suporte dentro do seu escopo."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card titulo="Painel do consultor" descricao="Atendimento comercial e suporte por pessoa, por mês">
        <div className="flex flex-wrap gap-3">
          <Field label="Consultor">
            <Select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="w-64">
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}{v.perfil ? ` · ${v.perfil === 'SUPORTE' ? 'Suporte' : 'Comercial'}` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mês">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="max-w-[180px]" />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      {resumo && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile rotulo="Clientes atendidos" valor={resumo.clientesAtendidos} />
            <StatTile rotulo="Conversas" valor={resumo.conversas.total} detalhe={`${resumo.conversas.abertas} aberta(s)`} />
            <StatTile rotulo="Jornadas abertas" valor={resumo.oportunidades.abertas} />
          </div>
        </>
      )}
    </div>
  );
}
