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
  EM_IMPLANTACAO: 'Em implantação',
  ATIVO: 'Ativo',
  SEM_ACOMPANHAMENTO: 'Sem acompanhamento',
  EM_RISCO: 'Em risco',
  INATIVO: 'Inativo',
  REATIVADO: 'Reativado',
};

export const AJUDA_STATUS_CICLO: Record<StatusCiclo, string> = {
  NOVO_PARCEIRO: 'Acabou de concluir o credenciamento e ainda não começou a implantação.',
  EM_IMPLANTACAO: 'Passando pelas etapas para começar a operar: treinamento, acessos, materiais.',
  ATIVO: 'Implantação concluída e relacionamento em dia. Não significa que esteja vendendo.',
  SEM_ACOMPANHAMENTO: 'Mais de 30 dias sem nenhuma interação registrada no CRM.',
  EM_RISCO: 'Há indício de perder o parceiro. Marcado pelo consultor, com motivo.',
  INATIVO: 'Deixou de operar ou não pretende continuar. Marcado pelo consultor, com motivo.',
  REATIVADO: 'Estava em risco ou inativo e retomou o relacionamento. Fica 30 dias em observação.',
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
  'Não responde aos contatos',
  'Informou dificuldade para operar',
  'Solicitou pausa',
  'Pendência impede a continuidade',
  'Outro',
];

export const MOTIVOS_INATIVO = [
  'Solicitou encerramento',
  'Não possui mais interesse',
  'Empresa fechou',
  'Mudanca de atividade',
  'Problemas operacionais',
  'Sem retorno após diversas tentativas',
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
      return `Parceiro há ${i.diasSemInteracao} dias sem acompanhamento`;
    case 'EM_RISCO':
      return `Em risco há ${i.diasNoStatus} dias`;
    case 'INATIVO':
      return `Inativo há ${i.diasNoStatus} dias`;
    case 'REATIVADO':
      return `Reativado há ${i.diasNoStatus} dias`;
    case 'NOVO_PARCEIRO':
      return `Credenciado há ${i.diasComoParceiro} dias e a implantação não começou`;
    default:
      return '';
  }
}
