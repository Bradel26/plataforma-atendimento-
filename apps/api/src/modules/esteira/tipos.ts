/**
 * Tipos compartilhados pelas regras das esteiras (TIM e Starlink) — puros, sem banco.
 */
import type { Role, TipoHistoricoEsteira } from '@prisma/client';

/** Resultado da avaliação de um movimento de etapa. */
export type Avaliacao =
  | { resultado: 'LIVRE'; tipo: TipoHistoricoEsteira; exigeMotivo?: boolean }
  | { resultado: 'JUSTIFICATIVA'; tipo: 'CORRECAO' | 'REATIVACAO' } // qualquer EDICAO, com justificativa
  | { resultado: 'EXCECAO'; pendencias: string[] } // só quem pode forçar, com justificativa
  | { resultado: 'PROIBIDO'; motivo: string };

export type ContextoRegra = { perfil: Role; agora: Date };
