import { useEffect, useState } from 'react';
import { Alerta, Button, Card } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import type { Oportunidade } from '../../../lib/types';

export const perguntasPadrao = [
  ['goals', 'Objetivos', 'O que o cliente quer alcançar?'],
  ['plans', 'Planos', 'Como pretende chegar lá?'],
  ['challenges', 'Desafios', 'O que impede o avanço?'],
  ['timeline', 'Prazo', 'Quando precisa do resultado?'],
] as const;
type Respostas = NonNullable<Oportunidade['qualificacao']>;
const vazias: Respostas = { goals: '', plans: '', challenges: '', timeline: '' };

export function QualificacaoGPCT({ oportunidade, aoSalvar }: { oportunidade: Oportunidade; aoSalvar: () => void }) {
  const [respostas, setRespostas] = useState<Respostas>(oportunidade.qualificacao ?? vazias);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setRespostas(oportunidade.qualificacao ?? vazias), [oportunidade.qualificacao]);
  const preenchidas = perguntasPadrao.filter(([chave]) => respostas[chave].trim()).length;

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api.put(`/oportunidades/${oportunidade.id}/qualificacao`, respostas);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar a qualificação');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card titulo="Qualificação comercial" descricao={`GPCT · ${preenchidas} de 4 respostas preenchidas`}>
      {erro && <Alerta>{erro}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2">
        {perguntasPadrao.map(([chave, rotulo, ajuda]) => (
          <label key={chave} className="block text-sm font-medium text-slate-700">
            {rotulo}
            <span className="mt-0.5 block text-xs font-normal text-slate-500">{oportunidade.estagio.perguntasGpct?.[chave] || ajuda}</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={respostas[chave]}
              maxLength={2000}
              disabled={oportunidade.status !== 'ABERTA'}
              onChange={(e) => setRespostas((r) => ({ ...r, [chave]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {oportunidade.status === 'ABERTA' && (
        <div className="mt-4">
          <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar qualificação'}</Button>
        </div>
      )}
    </Card>
  );
}
