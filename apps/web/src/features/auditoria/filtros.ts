export type CampoFiltro =
  | 'agenteId' | 'filaId' | 'canalConfigId' | 'situacao' | 'origem' | 'contato' | 'telefone' | 'protocolo'
  | 'inicioDe' | 'inicioAte' | 'fimDe' | 'fimAte';
export type FiltroAplicado = { campo: CampoFiltro; valores: string[] };
export type OpcoesAuditoria = {
  usuarios: Array<{ id: string; nome: string }>;
  filas: Array<{ id: string; nome: string }>;
  linhas: Array<{ id: string; nome: string }>;
};

export const LABEL_CAMPO: Record<CampoFiltro, string> = {
  agenteId: 'Usuário', filaId: 'Equipe', canalConfigId: 'Canal', situacao: 'Status', origem: 'Origem',
  contato: 'Contato', telefone: 'Número de telefone', protocolo: 'Protocolo', inicioDe: 'Data início (de)',
  inicioAte: 'Data início (até)', fimDe: 'Data fim (de)', fimAte: 'Data fim (até)',
};
export const LABEL_SITUACAO: Record<string, string> = {
  AGUARDANDO_FILA: 'Aguardando na fila', EM_ATENDIMENTO: 'Em atendimento', FINALIZADA: 'Finalizada',
};
export const LABEL_ORIGEM: Record<string, string> = { ATIVO: 'Ativo', RECEPTIVO: 'Receptivo' };
export const CAMPO_DE_TEXTO: Record<CampoFiltro, 'texto' | 'data' | 'lista'> = {
  agenteId: 'lista', filaId: 'lista', canalConfigId: 'lista', situacao: 'lista', origem: 'lista',
  contato: 'texto', telefone: 'texto', protocolo: 'texto', inicioDe: 'data', inicioAte: 'data', fimDe: 'data', fimAte: 'data',
};

export function paraQuery(filtros: FiltroAplicado[], pagina: number): string {
  const params = new URLSearchParams({ pagina: String(pagina), tamanho: '10' });
  for (const filtro of filtros) for (const valor of filtro.valores) if (valor.trim()) params.append(filtro.campo, valor.trim());
  return params.toString();
}

export function rotuloDoChip(filtro: FiltroAplicado, opcoes: OpcoesAuditoria): string {
  const nome = (valor: string) => {
    if (filtro.campo === 'agenteId') return opcoes.usuarios.find((item) => item.id === valor)?.nome ?? valor;
    if (filtro.campo === 'filaId') return valor === 'SEM_EQUIPE' ? 'Sem equipe' : (opcoes.filas.find((item) => item.id === valor)?.nome ?? valor);
    if (filtro.campo === 'canalConfigId') return opcoes.linhas.find((item) => item.id === valor)?.nome ?? valor;
    if (filtro.campo === 'situacao') return LABEL_SITUACAO[valor] ?? valor;
    if (filtro.campo === 'origem') return LABEL_ORIGEM[valor] ?? valor;
    if (CAMPO_DE_TEXTO[filtro.campo] === 'data') return new Date(`${valor}T00:00:00`).toLocaleDateString('pt-BR');
    return valor;
  };
  return `${LABEL_CAMPO[filtro.campo]}: ${filtro.valores.map(nome).join(', ')}`;
}
