import { useEffect, useState } from 'react';
import { Alerta, Button } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';

type Parceiro = { id: string; parceiro: string; operacao: { nome: string }; responsavel: { id: string; nome: string } | null };

type Resultado = {
  previa: boolean;
  prazoDias: number;
  criadas: number;
  semResponsavel: number;
  jaTemTarefa: number;
  naoEncontrados: number;
};

const LIMITE = 200;

/**
 * Tarefas de retomada em lote para parceiros sem interacao.
 *
 * Cria so TAREFAS na agenda do responsavel de cada parceiro, depois de uma
 * pre-visualizacao. Nenhuma mensagem e enviada: quem retoma o contato e uma pessoa.
 */
export function RetomadaEmLote({ itens, aoConcluir }: { itens: Parceiro[]; aoConcluir: () => void }) {
  const mostrarToast = useToast();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setSelecionados((atual) => new Set([...atual].filter((id) => itens.some((i) => i.id === id))));
    setPrevia(null);
  }, [itens]);

  if (itens.length === 0) return null;

  const alternar = (id: string) => {
    setPrevia(null);
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else if (novo.size < LIMITE) novo.add(id);
      return novo;
    });
  };

  const chamar = async (soPrevia: boolean) => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.post<Resultado>('/credenciamentos/tarefas-de-retomada-em-lote', {
        ids: [...selecionados],
        prazoDias: 3,
        previa: soPrevia,
      });
      if (soPrevia) {
        setPrevia(r);
      } else {
        mostrarToast('sucesso', `${r.criadas} tarefa(s) criada(s) na agenda dos responsáveis. Nenhuma mensagem foi enviada.`);
        setSelecionados(new Set());
        setPrevia(null);
        aoConcluir();
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao criar as tarefas');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">Criar tarefas de retomada ({itens.length} parceiro(s))</p>
      <p className="mb-2 text-xs text-slate-500">
        Cria uma tarefa na agenda do responsável (prazo de 3 dias). Nenhuma mensagem é enviada: o contato é feito por uma pessoa.
        Parceiros sem responsável ficam de fora; atribua antes.
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Button variante="neutro" tamanho="sm" onClick={() => { setPrevia(null); setSelecionados(new Set(itens.slice(0, LIMITE).map((i) => i.id))); }}>
          Selecionar {Math.min(itens.length, LIMITE)} primeiros
        </Button>
        <Button variante="neutro" tamanho="sm" onClick={() => { setPrevia(null); setSelecionados(new Set()); }} disabled={selecionados.size === 0}>
          Limpar
        </Button>
        <span className="text-slate-500">{selecionados.size} selecionado(s) (máx. {LIMITE})</span>
      </div>
      <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 bg-white">
        {itens.slice(0, 300).map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} />
              <span className="truncate">{p.parceiro}</span>
              <span className="ml-auto shrink-0 text-slate-500">{p.operacao.nome} · {p.responsavel?.nome ?? 'sem responsável'}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <Button variante="neutro" onClick={() => void chamar(true)} disabled={selecionados.size === 0 || ocupado}>
          {ocupado && !previa ? 'Calculando...' : 'Pré-visualizar'}
        </Button>
      </div>
      {previa && (
        <div className="mt-2 space-y-2" role="status">
          <Alerta tipo="aviso">
            Vai criar <strong>{previa.criadas}</strong> tarefa(s).
            {previa.semResponsavel > 0 && ` ${previa.semResponsavel} sem responsável (ficam de fora).`}
            {previa.jaTemTarefa > 0 && ` ${previa.jaTemTarefa} já têm tarefa de retomada aberta.`}
            {previa.naoEncontrados > 0 && ` ${previa.naoEncontrados} não foram encontrados.`} Nada foi gravado ainda.
          </Alerta>
          <Button onClick={() => void chamar(false)} disabled={ocupado || previa.criadas === 0}>
            {ocupado ? 'Criando...' : `Confirmar criação de ${previa.criadas} tarefa(s)`}
          </Button>
        </div>
      )}
      {erro && <div className="mt-2"><Alerta>{erro}</Alerta></div>}
    </div>
  );
}
