import { useEffect, useState } from 'react';
import { Alerta, Button, Card } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';

type Analise = {
  id: string;
  motor: string;
  versao: string;
  criadoEm: string;
  resultado: {
    situacao: string;
    fatos: string[];
    entravesProvaveis: string[];
    perguntas: string[];
    proximosPassos: string[];
  };
};

export function AnaliseDaOportunidade({ oportunidadeId, aoCriarTarefa }: { oportunidadeId: string; aoCriarTarefa: () => void }) {
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [criandoTarefa, setCriandoTarefa] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    void api.get<{ analise: Analise | null }>(`/oportunidades/${oportunidadeId}/analise-ia`)
      .then((r) => setAnalise(r.analise))
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a análise'));
  }, [oportunidadeId]);

  const gerar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.post<{ analise: Analise }>(`/oportunidades/${oportunidadeId}/analise-ia`, {});
      setAnalise(r.analise);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao analisar a oportunidade');
    } finally {
      setOcupado(false);
    }
  };

  const criarTarefa = async (texto: string, indice: number) => {
    setCriandoTarefa(indice);
    setErro(null);
    try {
      await api.post('/atividades', { tipo: 'TAREFA', titulo: texto.slice(0, 160), oportunidadeId });
      aoCriarTarefa();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao criar a tarefa');
    } finally {
      setCriandoTarefa(null);
    }
  };

  return (
    <Card titulo="Análise da oportunidade" descricao="Leitura assistida para revisão do gestor">
      {erro && <Alerta>{erro}</Alerta>}
      <Button variante="neutro" onClick={() => void gerar()} disabled={ocupado}>
        {ocupado ? 'Analisando...' : 'Analisar oportunidade'}
      </Button>
      {analise && (
        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <p>{analise.resultado.situacao}</p>
          {([
            ['Fatos observados', analise.resultado.fatos],
            ['Entraves prováveis', analise.resultado.entravesProvaveis],
            ['Perguntas em aberto', analise.resultado.perguntas],
            ['Próximos passos sugeridos', analise.resultado.proximosPassos],
          ] as const).map(([titulo, itens]) => itens.length > 0 && (
            <div key={titulo}>
              <h4 className="font-semibold text-slate-800">{titulo}</h4>
              <ul className="ml-5 list-disc space-y-1">{itens.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          ))}
          {analise.resultado.proximosPassos.length > 0 && (
            <div className="space-y-2">
              {analise.resultado.proximosPassos.map((passo, i) => (
                <Button key={i} variante="neutro" disabled={criandoTarefa === i} onClick={() => void criarTarefa(passo, i)}>
                  {criandoTarefa === i ? 'Criando...' : `Criar tarefa: ${passo.slice(0, 60)}`}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            {analise.motor} · versão {analise.versao} · {new Date(analise.criadoEm).toLocaleString('pt-BR')}. Confirme os fatos antes de agir.
          </p>
        </div>
      )}
    </Card>
  );
}
