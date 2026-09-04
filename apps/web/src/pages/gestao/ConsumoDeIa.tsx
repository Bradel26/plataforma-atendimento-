import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input } from '../../components/ui';
import { StatTile } from '../../components/viz/StatTile';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../features/auth/AuthProvider';
import {
  LABEL_RECURSO_IA,
  UNIDADE_RECURSO_IA,
  type ConsumoDeIa,
} from '../../lib/types';

/**
 * Medidor de consumo de IA (item 6.8 do plano em ANALISE-CRM.md).
 *
 * O plano condiciona o item: "so faz sentido se a IA for ligada de verdade". O
 * medidor respeita isso na tela — enquanto nao houver **nenhum** registro de
 * consumo, ele diz que nada esta ligado em vez de mostrar "R$ 0,00", que
 * convidaria a acreditar que a IA roda e e de graca.
 *
 * Quem alimenta hoje e o motor de IA externo: cada resposta que o plugin posta e
 * um uso que a plataforma ve. O custo, quando vem, vem declarado por ele — a
 * plataforma nao sabe preco de token.
 */

/** Dinheiro com quatro casas, ou travessao. Nulo nunca vira "R$ 0,00". */
const custo = (v: number | null) =>
  v === null ? '\u2014' : `R$ ${v.toFixed(v < 1 ? 4 : 2).replace('.', ',')}`;

const TOM: Record<ConsumoDeIa['situacao'], 'neutro' | 'sucesso' | 'alerta' | 'marca'> = {
  SEM_TETO: 'neutro',
  SEM_CONSUMO: 'neutro',
  DENTRO: 'sucesso',
  PROJETA_ESTOURO: 'alerta',
  ESTOUROU: 'alerta',
};

const FRASE: Record<ConsumoDeIa['situacao'], string> = {
  SEM_TETO: 'Sem teto definido',
  SEM_CONSUMO: 'Nenhum uso neste mes',
  DENTRO: 'Dentro do teto',
  PROJETA_ESTOURO: 'O ritmo projeta estouro',
  ESTOUROU: 'Teto estourado',
};

export function ConsumoDeIaCard() {
  const [dados, setDados] = useState<ConsumoDeIa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [teto, setTeto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const { temPerfil } = useAuth();

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<ConsumoDeIa>('/ia/consumo');
      setDados(r);
      setTeto(r.teto === null ? '' : String(r.teto));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o consumo de IA');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvarTeto = async () => {
    setSalvando(true);
    setErro(null);
    try {
      // Campo vazio remove o teto. Zero nao entra: "nao pode gastar nada" nao e
      // o mesmo que "sem teto", e a API recusa.
      await api.put('/ia/teto', { teto: teto.trim() === '' ? null : Number(teto) });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar o teto');
    } finally {
      setSalvando(false);
    }
  };

  if (erro) return <Alerta>{erro}</Alerta>;
  if (!dados) {
    return (
      <Card titulo="Consumo de IA">
        <p className="text-sm text-slate-500">Carregando...</p>
      </Card>
    );
  }

  /*
   * O estado que o plano pediu que fosse honesto.
   *
   * Nenhum registro de consumo em nenhum mes significa que nenhum recurso de IA
   * esta ligado nesta instalacao. Mostrar zeros aqui seria afirmar que a IA
   * funciona e nao custa nada.
   */
  if (!dados.ligado) {
    return (
      <Card titulo="Consumo de IA" descricao="Medidor por ciclo, com projecao de fim de mes">
        <p className="text-sm text-slate-600">
          Nenhum recurso de IA esta ligado nesta instalacao — nao ha consumo para medir. O medidor passa a
          contar assim que o motor de IA responder a primeira conversa.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          O custo aparece quando o motor informa quanto gastou: a plataforma registra o uso, e o preco do
          token e do lado de quem processa.
        </p>
      </Card>
    );
  }

  return (
    <Card
      titulo="Consumo de IA"
      descricao={`${dados.usos} uso(s) no mes · dia ${dados.diasDecorridos} de ${dados.diasNoMes}`}
      acao={<Badge tom={TOM[dados.situacao]}>{FRASE[dados.situacao]}</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          rotulo="Gasto no ciclo"
          valor={custo(dados.custoTotal)}
          detalhe={
            dados.usosComCusto === dados.usos
              ? 'todos os usos com custo informado'
              : `${dados.usosComCusto} de ${dados.usos} usos com custo informado`
          }
        />
        <StatTile
          rotulo="Projecao do mes"
          valor={custo(dados.projecao)}
          detalhe={dados.projecao === null ? 'sem ritmo para projetar' : 'pelo ritmo ate hoje'}
        />
        <StatTile
          rotulo="Teto"
          valor={custo(dados.teto)}
          detalhe={dados.teto === null ? 'nenhum teto definido' : 'limite mensal'}
        />
        <StatTile
          rotulo="Da projecao no teto"
          valor={dados.fracaoDoTeto === null ? '\u2014' : `${Math.round(dados.fracaoDoTeto * 100)}%`}
          detalhe={dados.fracaoDoTeto === null ? 'precisa de teto e de consumo' : 'quanto a projecao ocupa'}
        />
      </div>

      {dados.porRecurso.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Consumo por recurso de IA no ciclo</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1.5 pr-3 font-medium">Recurso</th>
                <th className="py-1.5 pr-3 text-right font-medium">Usos</th>
                <th className="py-1.5 pr-3 text-right font-medium">Volume</th>
                <th className="py-1.5 text-right font-medium">Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dados.porRecurso.map((r) => (
                <tr key={r.recurso}>
                  <td className="py-2 pr-3 text-slate-800">{LABEL_RECURSO_IA[r.recurso]}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{r.usos}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">
                    {r.unidades} {UNIDADE_RECURSO_IA[r.recurso]}
                  </td>
                  <td className="py-2 text-right text-slate-600">{custo(r.custo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {temPerfil('ADMIN') && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_auto] sm:items-end">
          <Field label="Teto mensal (R$)" hint="Em branco = sem teto">
            <Input value={teto} onChange={(e) => setTeto(e.target.value)} />
          </Field>
          <div>
            <Button onClick={() => void salvarTeto()} disabled={salvando || teto === (dados.teto === null ? '' : String(dados.teto))}>
              {salvando ? 'Salvando...' : 'Salvar teto'}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Mes encerrado nao tem projecao: o gasto real e o resultado. Uso sem custo informado conta como uso e
        nao entra na soma &mdash; e por isso a coluna diz sobre quantos usos o custo fala.
      </p>
    </Card>
  );
}
