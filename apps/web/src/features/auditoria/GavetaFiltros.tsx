import { useEffect, useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import { Gaveta } from '../../components/ui/Gaveta';
import { CAMPO_DE_TEXTO, LABEL_CAMPO, LABEL_ORIGEM, LABEL_SITUACAO, type CampoFiltro, type FiltroAplicado, type OpcoesAuditoria } from './filtros';

const CAMPOS = Object.keys(LABEL_CAMPO) as CampoFiltro[];
export function GavetaFiltros({ aberta, aoFechar, aplicados, opcoes, aoAplicar }: {
  aberta: boolean;
  aoFechar: () => void;
  aplicados: FiltroAplicado[];
  opcoes: OpcoesAuditoria | null;
  aoAplicar: (filtros: FiltroAplicado[]) => void;
}) {
  const [linhas, setLinhas] = useState<FiltroAplicado[]>([]);
  useEffect(() => { if (aberta) setLinhas(aplicados.length ? aplicados : [{ campo: 'agenteId', valores: [] }]); }, [aberta, aplicados]);
  const opcoesDo = (campo: CampoFiltro) => {
    if (!opcoes) return [];
    if (campo === 'agenteId') return opcoes.usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }));
    if (campo === 'filaId') return [{ valor: 'SEM_EQUIPE', rotulo: 'Sem equipe' }, ...opcoes.filas.map((f) => ({ valor: f.id, rotulo: f.nome }))];
    if (campo === 'canalConfigId') return opcoes.linhas.map((l) => ({ valor: l.id, rotulo: l.nome }));
    if (campo === 'situacao') return Object.entries(LABEL_SITUACAO).map(([valor, rotulo]) => ({ valor, rotulo }));
    if (campo === 'origem') return Object.entries(LABEL_ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo }));
    return [];
  };
  const mudar = (i: number, filtro: FiltroAplicado) => setLinhas((atuais) => atuais.map((item, j) => j === i ? filtro : item));

  return <Gaveta aberta={aberta} titulo="Filtrar" aoFechar={aoFechar} rodape={<>
    <Button variante="neutro" onClick={aoFechar}>Cancelar</Button>
    <Button onClick={() => { aoAplicar(linhas.filter((linha) => linha.valores.some((valor) => valor.trim()))); aoFechar(); }}>Aplicar filtro</Button>
  </>}>
    <div className="space-y-4">
      {linhas.map((linha, i) => {
        const tipo = CAMPO_DE_TEXTO[linha.campo];
        return <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Select aria-label="Filtro" value={linha.campo} onChange={(e) => mudar(i, { campo: e.target.value as CampoFiltro, valores: [] })}>
              {CAMPOS.map((campo) => <option key={campo} value={campo}>{LABEL_CAMPO[campo]}</option>)}
            </Select>
            <button type="button" aria-label="Remover filtro" onClick={() => setLinhas((atuais) => atuais.filter((_, j) => j !== i))} className="px-2 text-red-500">🗑</button>
          </div>
          {tipo === 'lista' && <Select multiple aria-label="Selecionar opções" value={linha.valores} onChange={(e) => mudar(i, { ...linha, valores: [...e.target.selectedOptions].map((o) => o.value) })} className="h-28">
            {opcoesDo(linha.campo).map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}
          </Select>}
          {tipo === 'texto' && <Input value={linha.valores[0] ?? ''} onChange={(e) => mudar(i, { ...linha, valores: [e.target.value] })} />}
          {tipo === 'data' && <Input type="date" value={linha.valores[0] ?? ''} onChange={(e) => mudar(i, { ...linha, valores: [e.target.value] })} />}
        </div>;
      })}
      <Button tamanho="sm" onClick={() => setLinhas((atuais) => [...atuais, { campo: 'situacao', valores: [] }])}>+ Adicionar filtro</Button>
    </div>
  </Gaveta>;
}
