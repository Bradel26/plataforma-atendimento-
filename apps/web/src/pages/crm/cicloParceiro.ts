/**
 * Ciclo de Vida do Parceiro (apos o credenciamento): tipos, rotulos e cores.
 *
 * E o ciclo da RELACAO com o parceiro — implantacao e acompanhamento —, nao da
 * producao dele. O CRM ainda nao tem venda por parceiro, entao "Ativo" aqui
 * quer dizer "credenciado, operacional e com relacionamento ativo".
 */

export type StatusCiclo =
  | 'NOVO_PARCEIRO'
  | 'EM_IMPLANTACAO'
  | 'ATIVO'
  | 'SEM_ACOMPANHAMENTO'
  | 'EM_RISCO'
  | 'INATIVO'
  | 'REATIVADO';

export const ORDEM_STATUS: StatusCiclo[] = [
  'NOVO_PARCEIRO',
  'EM_IMPLANTACAO',
  'ATIVO',
  'SEM_ACOMPANHAMENTO',
  'EM_RISCO',
  'INATIVO',
  'REATIVADO',
];

export const LABEL_STATUS_CICLO: Record<StatusCiclo, string> = {
  NOVO_PARCEIRO: 'Novo parceiro',
  EM_IMPLANTACAO: 'Em implantacao',
  ATIVO: 'Ativo',
  SEM_ACOMPANHAMENTO: 'Sem acompanhamento',
  EM_RISCO: 'Em risco',
  INATIVO: 'Inativo',
  REATIVADO: 'Reativado',
};

export const AJUDA_STATUS_CICLO: Record<StatusCiclo, string> = {
  NOVO_PARCEIRO: 'Acabou de concluir o credenciamento e ainda nao comecou a implantacao.',
  EM_IMPLANTACAO: 'Passando pelas etapas para comecar a operar: treinamento, acessos, materiais.',
  ATIVO: 'Implantacao concluida e relacionamento em dia. Nao significa que esteja vendendo.',
  SEM_ACOMPANHAMENTO: 'Mais de 30 dias sem nenhuma interacao registrada no CRM.',
  EM_RISCO: 'Ha indicio de perder o parceiro. Marcado pelo consultor, com motivo.',
  INATIVO: 'Deixou de operar ou nao pretende continuar. Marcado pelo consultor, com motivo.',
  REATIVADO: 'Estava em risco ou inativo e retomou o relacionamento. Fica 30 dias em observacao.',
};

/** Classes de cor de cada status (as de risco e reativado ficam em index.css, com tema escuro). */
export const COR_STATUS_CICLO: Record<StatusCiclo, string> = {
  NOVO_PARCEIRO: 'bg-blue-50 text-blue-700',
  EM_IMPLANTACAO: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-500/30',
  ATIVO: 'bg-emerald-50 text-emerald-700',
  SEM_ACOMPANHAMENTO: 'bg-amber-50 text-amber-700',
  EM_RISCO: 'selo-ciclo-risco',
  INATIVO: 'bg-red-50 text-red-700',
  REATIVADO: 'selo-ciclo-reativado',
};

export const MOTIVOS_EM_RISCO = [
  'Demonstrou desinteresse',
  'Nao responde aos contatos',
  'Informou dificuldade para operar',
  'Solicitou pausa',
  'Pendencia impede a continuidade',
  'Outro',
];

export const MOTIVOS_INATIVO = [
  'Solicitou encerramento',
  'Nao possui mais interesse',
  'Empresa fechou',
  'Mudanca de atividade',
  'Problemas operacionais',
  'Sem retorno apos diversas tentativas',
  'Outro',
];

type Ref = { id: string; nome: string };

export type ItemCiclo = {
  id: string;
  credenciamentoId: string;
  status: StatusCiclo;
  statusDesde: string;
  diasNoStatus: number;
  credenciadoEm: string;
  diasComoParceiro: number;
  ultimaInteracaoEm: string | null;
  diasSemInteracao: number;
  etapasConcluidas: string[];
  totalEtapas: number;
  implantacaoAtrasada: boolean;
  contato: Ref & { telefone: string | null; uf: string | null; cidade: string | null };
  funil: Ref;
  responsavel: Ref | null;
  situacaoExcecao: string | null;
};

export type ListaCiclos = {
  itens: ItemCiclo[];
  resumo: { total: number; porStatus: Record<StatusCiclo, number>; implantacaoAtrasada: number };
  atencao: ItemCiclo[];
};

export type CicloDetalhado = ItemCiclo & {
  etapas: Array<{ chave: string; rotulo: string; concluida: boolean; concluidaEm: string | null; concluidaPor: string | null }>;
  historico: Array<{
    id: string;
    deStatus: StatusCiclo | null;
    paraStatus: StatusCiclo;
    regra: string;
    motivo: string | null;
    observacao: string | null;
    usuario: Ref | null;
    criadoEm: string;
  }>;
};

export const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/** O que a linha de atencao diz sobre o parceiro. */
export function textoDeAtencao(i: ItemCiclo): string {
  switch (i.status) {
    case 'SEM_ACOMPANHAMENTO':
      return `Parceiro ha ${i.diasSemInteracao} dias sem acompanhamento`;
    case 'EM_RISCO':
      return `Em risco ha ${i.diasNoStatus} dias`;
    case 'INATIVO':
      return `Inativo ha ${i.diasNoStatus} dias`;
    case 'REATIVADO':
      return `Reativado ha ${i.diasNoStatus} dias`;
    case 'NOVO_PARCEIRO':
      return `Credenciado ha ${i.diasComoParceiro} dias e a implantacao nao comecou`;
    default:
      return '';
  }
}
