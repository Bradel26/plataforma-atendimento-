import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { EstruturaEsteira, EtapaEsteira, Operacao, TipoEtapa } from '../../lib/esteiraTypes';
import { ROTULO_OPERACAO } from '../esteira/cadastroEsteira';
import { parametroDaOperacao } from '../esteira/estadoEsteira';
import { corpoDaEtapa } from './esteirasConfig';

const OPERACOES: Operacao[] = ['TIM', 'STARLINK'];

const ROTULO_TIPO: Record<TipoEtapa, string> = { NORMAL: 'Etapa', DESVIO: 'Desvio', SAIDA: 'Saída' };

function LinhaEtapa({ operacao, etapa, aoSalvar }: { operacao: Operacao; etapa: EtapaEsteira; aoSalvar: () => void }) {
  const [nome, setNome] = useState(etapa.nome);
  const [dias, setDias] = useState(etapa.diasParado === null ? '' : String(etapa.diasParado));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const saida = etapa.tipo === 'SAIDA';
  const alterada = !('vazio' in corpoDaEtapa(etapa, { nome, dias }));

  const salvar = async () => {
    setErro(null);
    const r = corpoDaEtapa(etapa, { nome, dias });
    if ('erro' in r) return setErro(r.erro);
    if ('vazio' in r) return;
    setSalvando(true);
    try {
      await api.patch(`/esteiras/${parametroDaOperacao(operacao)}/etapas/${etapa.chave}`, r.corpo);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar a etapa');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <li className="py-3">
      <div className="grid items-center gap-3 sm:grid-cols-[88px_minmax(0,1fr)_170px_auto]">
        <Badge tom={saida ? 'alerta' : 'neutro'}>{ROTULO_TIPO[etapa.tipo]}</Badge>
        <Input aria-label={`Nome da etapa ${etapa.chave}`} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
        {saida ? (
          <span className="text-xs text-slate-500">Sem limite de dias</span>
        ) : (
          <Input
            aria-label={`Dias para considerar parado na etapa ${etapa.nome}`}
            type="number"
            min={1}
            max={365}
            placeholder={`Padrão (${etapa.diasParadoEfetivo ?? 7})`}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        )}
        <Button type="button" disabled={!alterada || salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </li>
  );
}

function CartaoOperacao({ operacao }: { operacao: Operacao }) {
  const [etapas, setEtapas] = useState<EtapaEsteira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const e = await api.get<EstruturaEsteira>(`/esteiras/${parametroDaOperacao(operacao)}/estrutura`);
      setEtapas([...e.etapas].sort((a, b) => a.ordem - b.ordem));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao carregar as etapas');
    }
  }, [operacao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <Card titulo={`Esteira ${ROTULO_OPERACAO[operacao]}`} descricao="A ordem e o tipo das etapas são fixos; só o nome e o prazo podem mudar.">
      {erro && <Alerta>{erro}</Alerta>}
      {!etapas && !erro && <p className="text-sm text-slate-500">Carregando...</p>}
      {etapas && (
        <ul className="divide-y divide-slate-100">
          {etapas.map((etapa) => (
            // A chave inclui nome e dias para o rascunho reiniciar com o valor salvo.
            <LinhaEtapa key={`${etapa.chave}:${etapa.nome}:${etapa.diasParado}`} operacao={operacao} etapa={etapa} aoSalvar={() => void carregar()} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Aba "Esteiras" (ADMIN): nome das etapas e "dias para considerar parado" de cada operação. */
export function EsteirasTab() {
  return (
    <div className="grid gap-5">
      <p className="text-sm text-slate-600">
        "Dias para considerar parado" é o prazo sem movimento a partir do qual um vínculo aparece como parado.
        Em branco, vale o padrão de 7 dias.
      </p>
      {OPERACOES.map((o) => <CartaoOperacao key={o} operacao={o} />)}
    </div>
  );
}
