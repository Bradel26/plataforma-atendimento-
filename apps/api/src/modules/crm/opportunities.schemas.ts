import { z } from 'zod';
import { MOTIVOS_PERDA } from './leads.schemas';

const itemSchema = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().int().min(1).default(1),
  /** Omitido: usa o preco do catalogo informado, ou o do primeiro catalogo ativo. */
  precoUnitario: z.number().nonnegative().optional(),
  /**
   * Acrescimo e desconto em VALOR absoluto, nao percentual (ver decisao 57).
   *
   * A regra "desconto nao passa do bruto" NAO cabe aqui: o bruto depende de
   * `precoUnitario`, que pode vir omitido para o servico resolver no catalogo.
   * Validar no schema recusaria desconto legitimo em item sem preco explicito, e
   * aceitaria desconto absurdo quando o preco vem do catalogo. Fica no servico,
   * depois de resolver o preco.
   */
  acrescimo: z.number().nonnegative().max(99_999_999).default(0),
  desconto: z.number().nonnegative().max(99_999_999).default(0),
  recorrencia: z.enum(['UNICO', 'MENSAL']).default('UNICO'),
  /** Nulo explicito apaga o custo; omitido mantem. Zero e um custo de verdade. */
  custoUnitario: z.number().nonnegative().nullable().optional(),
});

/**
 * Horizonte da parte mensal, em meses.
 *
 * Teto de 120 (dez anos) por ser um numero que ninguem digita por acidente e que
 * ainda cabe em contrato longo. Zero e valido: significa "considere so a parte
 * unica", que e o que se quer ao orcar equipamento com manutencao opcional.
 */
const mesesRecorrenciaSchema = z.number().int().min(0).max(120);

/** Item 6.4: `{chave: valor}`, validado em runtime contra as definicoes ativas. */
const camposCustomizados = z.record(z.string(), z.unknown()).optional();

export const criarOportunidadeSchema = z.object({
  titulo: z.string().trim().min(2).max(160),
  contaId: z.string().uuid('Informe uma conta valida'),
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
  valor: z.number().nonnegative().optional(),
  responsavelId: z.string().uuid().nullable().optional(),
  previsaoFechamento: z.coerce.date().nullable().optional(),
  catalogoId: z.string().uuid().optional(),
  itens: z.array(itemSchema).max(50).optional(),
  mesesRecorrencia: mesesRecorrenciaSchema.optional(),
  camposCustomizados,
});

/**
 * Canais de origem, no MESMO vocabulario de lead e contato.
 *
 * Repetido aqui como lista para o zod, mas os valores sao os do enum `Channel`
 * do banco: "de onde veio" e a mesma pergunta nos tres, e dois vocabularios
 * fariam o relatorio por origem precisar de traducao no meio.
 */
const CANAIS_ORIGEM = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ'] as const;

export const atualizarOportunidadeSchema = z
  .object({
    titulo: z.string().trim().min(2).max(160).optional(),
    estagioId: z.string().uuid().optional(),
    valor: z.number().nonnegative().optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    previsaoFechamento: z.coerce.date().nullable().optional(),
    mesesRecorrencia: mesesRecorrenciaSchema.optional(),
    /*
     * Condicoes da proposta (item 2.2). Vazio vira nulo no servico: string vazia
     * gravada imprimiria um rotulo "Condicao de pagamento" seguido de nada, o
     * que num documento que vai ao cliente parece campo que ficou faltando.
     */
    condicaoPagamento: z.string().trim().max(200).nullable().optional(),
    prazoEntrega: z.string().trim().max(120).nullable().optional(),
    /*
     * Temperatura e origem no cartao (item esquecido do plano).
     *
     * Nulo em ambos e um valor que se pode ESCREVER, e nao so um estado inicial:
     * quem marcou "quente" por engano precisa poder desmarcar, e nao existe
     * degrau que signifique "retiro minha leitura".
     */
    temperatura: z.enum(['FRIA', 'MORNA', 'QUENTE']).nullable().optional(),
    canalOrigem: z.enum(CANAIS_ORIGEM).nullable().optional(),
    camposCustomizados,
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

export const fecharOportunidadeSchema = z
  .object({
    status: z.enum(['GANHA', 'PERDIDA']),
    motivoPerda: z.enum(MOTIVOS_PERDA).optional(),
  })
  .refine((d) => d.status !== 'PERDIDA' || Boolean(d.motivoPerda), {
    message: 'Informe o motivo da perda',
    path: ['motivoPerda'],
  });

export const listarOportunidadesSchema = z.object({
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional(),
  status: z.enum(['ABERTA', 'GANHA', 'PERDIDA']).optional(),
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export const itensSchema = z.object({
  catalogoId: z.string().uuid().optional(),
  itens: z.array(itemSchema).min(1).max(50),
  mesesRecorrencia: mesesRecorrenciaSchema.optional(),
});

export const criarFunilSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  estagios: z
    .array(
      z.object({
        nome: z.string().trim().min(2).max(60),
        probabilidade: z.number().int().min(0).max(100).default(0),
      }),
    )
    .min(2, 'Um funil precisa de ao menos 2 estagios')
    .max(12),
});

export type CriarOportunidadeInput = z.infer<typeof criarOportunidadeSchema>;
export type AtualizarOportunidadeInput = z.infer<typeof atualizarOportunidadeSchema>;
export type FecharOportunidadeInput = z.infer<typeof fecharOportunidadeSchema>;
export type ListarOportunidadesQuery = z.infer<typeof listarOportunidadesSchema>;
export type ItensInput = z.infer<typeof itensSchema>;

/**
 * Exigencia da etapa (item 3.1). Nulo ou vazio desliga.
 *
 * O campo e o **titulo** da tarefa, nao um booleano: um sim/nao diria ao vendedor
 * que falta algo sem dizer o que.
 */
export const tarefaDaEtapaSchema = z.object({
  tarefaObrigatoria: z.string().trim().max(120).nullable(),
});

export type TarefaDaEtapaInput = z.infer<typeof tarefaDaEtapaSchema>;
