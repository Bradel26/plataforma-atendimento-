import type { Role } from '@prisma/client';

/**
 * Quem conta como "pessoa na operacao" no Dashboard e no Monitoramento.
 *
 * Uma unica lista para as duas telas: antes o Monitoramento excluia ADMIN e
 * GESTOR e o Dashboard contava todo usuario ativo, entao "disponiveis" e
 * "online" nunca batiam. ADMIN entra porque atende pela propria linha; GESTOR
 * fica de fora por so acompanhar (nao recebe conversa nem carteira de atendimento).
 */
export const PERFIS_NA_OPERACAO: Role[] = ['ADMIN', 'SUPERVISOR', 'COMERCIAL', 'SUPORTE'];

/** "Online" = qualquer status diferente de OFFLINE (disponivel, em atendimento, pausa). */
export const estaOnline = (status: string) => status !== 'OFFLINE';
