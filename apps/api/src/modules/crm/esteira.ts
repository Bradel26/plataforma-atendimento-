/**
 * Regras puras da Esteira de Credenciamento — separadas das consultas para
 * poderem ser testadas sem banco.
 *
 * Os estagios sao configuraveis por organizacao (`FunnelStage`), entao nada
 * aqui depende de id: o Dashboard e a Gestao precisam saber qual coluna e
 * "Pendencia" ou "Ativo", e a unica coisa estavel entre instalacoes e o NOME.
 * A comparacao ignora acento e caixa, porque o seed grava "Pendencia" e quem
 * configura pela tela escreve "Pendência".
 */

export type PapelDoEstagio = 'NOVO' | 'ANALISE' | 'PENDENCIA' | 'APROVACAO' | 'CREDENCIADO' | 'ATIVO' | 'OUTRO';

export const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function papelDoEstagio(nome: string): PapelDoEstagio {
  const n = normalizar(nome);
  if (n.startsWith('novo') || n.includes('cadastro')) return 'NOVO';
  if (n.includes('analise')) return 'ANALISE';
  if (n.includes('pendenc') || n.includes('document')) return 'PENDENCIA';
  if (n.includes('aprova')) return 'APROVACAO';
  if (n.includes('credenciad')) return 'CREDENCIADO';
  if (n.includes('ativo')) return 'ATIVO';
  return 'OUTRO';
}

/** Situacao do semaforo da Area da Gestao. */
export type Semaforo = 'NORMAL' | 'ATENCAO' | 'CRITICO';

/**
 * Normal ate 70% do limite, atencao ate o limite, critico acima dele.
 *
 * 70% e o "proximo do limite" do documento: com limite de 5 dias, o card fica
 * amarelo no 4o dia — ainda da tempo de agir antes de estourar.
 */
export function semaforo(dias: number, limiteDias: number): Semaforo {
  if (dias > limiteDias) return 'CRITICO';
  if (dias >= limiteDias * 0.7) return 'ATENCAO';
  return 'NORMAL';
}

export const DIA_MS = 86_400_000;

/** Dias inteiros desde a data, nunca negativo. */
export const diasDesde = (data: Date, agora = Date.now()) => Math.max(0, Math.floor((agora - data.getTime()) / DIA_MS));

export const media = (valores: number[]) =>
  valores.length === 0 ? null : valores.reduce((a, b) => a + b, 0) / valores.length;

/** UF valida: duas letras, maiusculas. Qualquer outra coisa vira nulo. */
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export const REGIAO_DA_UF: Record<string, string> = {
  AC: 'Norte', AM: 'Norte', AP: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste',
  PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
};
