import { useEffect, useMemo, useState } from 'react';
import { Alerta, Button, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import type { AgenteMonitorado } from '../../lib/types';

type Parceiro = { id: string; parceiro: string; operacao: { nome: string }; etapa: string; responsavel: { id: string } | null };

type Resultado = {
  previa: boolean;
  responsavel: { id: string; nome: string };
  totalPedidos: number;
  atribuidos: number;
  jaTinhamResponsavel: number;
  naoEncontrados: number;
};

const LIMITE = 200;

/**
 * Atribuicao de carteira em lote para parceiros sem responsavel.
 *
 * Fluxo com revisao humana: escolher parceiros e responsavel, PRE-VISUALIZAR (nada
 * e gravado) e so entao CONFIRMAR. Mexe so na carteira interna: nenhuma mensagem
 * e enviada ao parceiro.
 */
export function AtribuirEmLote({ itens, aoConcluir }: { itens: Parceiro[]; aoConcluir: () => void }) {
  const mostrarToast = useToast();
  const semDono = useMemo(() => itens.filter((i) => i.responsavel === null), [itens]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [consultores, setConsultores] = useState<Array<{ id: string; nome: string }>>([]);
  const [responsavelId, setResponsavelId] = useState('');
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ agentes: AgenteMonitorado[] }>('/metricas/agentes')
      .then((r) => setConsultores(r.agentes.map((a) => ({ id: a.id, nome: a.nome }))))
      .catch(() => setErro('Não foi possível carregar a lista de responsáveis.'));
  }, []);

  // A selecao so vale para quem ainda esta na lista (depois de confirmar, a lista recarrega).
  useEffect(() => {
    setSelecionados((atual) => new Set([...atual].filter((id) => semDono.some((i) => i.id === id))));
    setPrevia(null);
  }, [semDono]);

  if (semDono.length === 0) return null;

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
      const r = await api.post<Resultado>('/credenciamentos/atribuicao-em-lote', {
        ids: [...selecionados],
        responsavelId,
        previa: soPrevia,
      });
      if (soPrevia) {
        setPrevia(r);
      } else {
        mostrarToast('sucesso', `${r.atribuidos} parceiro(s) atribuído(s) a ${r.responsavel.nome}. Nenhuma mensagem foi enviada.`);
        setSelecionados(new Set());
        setPrevia(null);
        aoConcluir();
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao atribuir');
    } finally {
      setOcupado(false);
    }
  };

  const pronto = selecionados.size > 0 && responsavelId !== '';

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">Atribuir carteira ({semDono.length} sem responsável)</p>
      <p className="mb-2 text-xs text-slate-500">
        Só define quem cuida do parceiro. Nenhuma mensagem é enviada: o contato continua sendo feito por uma pessoa.
      </p>
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <Button variante="neutro" tamanho="sm" onClick={() => { setPrevia(null); setSelecionados(new Set(semDono.slice(0, LIMITE).map((i) => i.id))); }}>
          Selecionar {Math.min(semDono.length, LIMITE)} primeiros
        </Button>
        <Button variante="neutro" tamanho="sm" onClick={() => { setPrevia(null); setSelecionados(new Set()); }} disabled={selecionados.size === 0}>
          Limpar
        </Button>
        <span className="self-center text-slate-500">{selecionados.size} selecionado(s) (máx. {LIMITE})</span>
      </div>
      <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 bg-white">
        {semDono.slice(0, 300).map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} />
              <span className="truncate">{p.parceiro}</span>
              <span className="ml-auto shrink-0 text-slate-500">{p.operacao.nome} · {p.etapa}</span>
            </label>
          </li>
        ))}
      </ul>
      {semDono.length > 300 && <p className="mt-1 text-xs text-slate-500">Mostrando 300 de {semDono.length}. Atribua este lote e a lista recarrega.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={responsavelId} onChange={(e) => { setResponsavelId(e.target.value); setPrevia(null); }} aria-label="Responsável">
          <option value="">Escolha o responsável</option>
          {consultores.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Select>
        <Button variante="neutro" onClick={() => void chamar(true)} disabled={!pronto || ocupado}>
          {ocupado && !previa ? 'Calculando...' : 'Pré-visualizar'}
        </Button>
      </div>
      {previa && (
        <div className="mt-2 space-y-2" role="status">
          <Alerta tipo="aviso">
            Vai atribuir <strong>{previa.atribuidos}</strong> parceiro(s) a <strong>{previa.responsavel.nome}</strong>.
            {previa.jaTinhamResponsavel > 0 && ` ${previa.jaTinhamResponsavel} já têm responsável e serão mantidos.`}
            {previa.naoEncontrados > 0 && ` ${previa.naoEncontrados} não foram encontrados.`} Nada foi gravado ainda.
          </Alerta>
          <Button onClick={() => void chamar(false)} disabled={ocupado || previa.atribuidos === 0}>
            {ocupado ? 'Atribuindo...' : `Confirmar atribuição de ${previa.atribuidos}`}
          </Button>
        </div>
      )}
      {erro && <div className="mt-2"><Alerta>{erro}</Alerta></div>}
    </div>
  );
}
