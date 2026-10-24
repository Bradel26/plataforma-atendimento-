/**
 * Filtros das consultas da esteira (Kanban, Lista) — puro, sem banco (spec 6).
 *
 * `whereDosFiltros` monta só a parte dos filtros: a operação e os não
 * arquivados entram sempre; a carteira (`politicaCredenciamentos`) e as
 * operações permitidas são assíncronas e o serviço compõe com AND.
 */
import { Channel, DepTim, OrigemTim, TipoCaptacao, VivensisStatus, type Operacao, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { ETAPAS, type ChaveEtapa } from './catalogo';
import { SITUACAO_DA_SAIDA, type Situacao } from './movimento';

export type FiltrosEsteira = {
  busca?: string;
  responsavelIds?: string[];
  ufs?: string[];
  cidades?: string[];
  etapas?: ChaveEtapa[];
  situacoes?: Situacao[];
  periodoCampo?: 'criadoEm' | 'estagioDesde';
  desde?: Date;
  /** Fim do período: inclusivo, ou exclusivo com `ateExclusivo` (data sem hora → início do dia seguinte). */
  ate?: Date;
  ateExclusivo?: boolean;
  paradoHaMaisDe?: number;
  origem?: string[];
  tim?: { dep?: DepTim[]; trafegoPago?: boolean; vendaLiberada?: boolean };
  starlink?: { tipoCaptacao?: TipoCaptacao[]; vivensis?: VivensisStatus[]; vsm?: 'SIM' | 'NAO' | 'VAZIO' };
};

type Where = Prisma.CredenciamentoWhereInput;

const DIA_MS = 86_400_000;
/** Busca por documento/telefone só a partir de 3 dígitos (menos que isso casa quase tudo). */
const MIN_DIGITOS_BUSCA = 3;
/** Condição que não casa nada (lista vazia num filtro informado). */
const NADA: Where = { id: { in: [] } };

const insensitive = (valor: string) => ({ contains: valor, mode: 'insensitive' as const });

/** Nome do contato/conta e cidade; com ≥ 3 dígitos, também CNPJ, CPF e telefone normalizado. */
function condicaoDeBusca(busca: string): Where {
  const digitos = busca.replace(/\D/g, '');
  return {
    OR: [
      { contato: { nome: insensitive(busca) } },
      { conta: { is: { nome: insensitive(busca) } } },
      { contato: { cidade: insensitive(busca) } },
      { conta: { is: { cidade: insensitive(busca) } } },
      ...(digitos.length >= MIN_DIGITOS_BUSCA
        ? [
            { conta: { is: { cnpj: { contains: digitos } } } },
            { contato: { cpf: { contains: digitos } } },
            { contato: { telefoneNormalizado: { contains: digitos } } },
          ]
        : []),
    ],
  };
}

/** UF/cidade do parceiro: a do contato, senão a da conta (como no card). */
const doContatoSenaoConta = (campo: 'uf' | 'cidade', filtro: Prisma.StringNullableFilter): Where => ({
  OR: [{ contato: { [campo]: filtro } }, { contato: { [campo]: null }, conta: { is: { [campo]: filtro } } }],
});

const ouNada = (condicoes: Where[]): Where => (condicoes.length ? { OR: condicoes } : NADA);

const chavesDaOperacao = (operacao: Operacao) => new Set<string>(ETAPAS[operacao].map((e) => e.chave));

/** Saídas conhecidas da operação e a situação de cada uma. */
const saidasDaOperacao = (operacao: Operacao) =>
  ETAPAS[operacao].filter((e) => SITUACAO_DA_SAIDA[e.chave]).map((e) => ({ chave: e.chave, situacao: SITUACAO_DA_SAIDA[e.chave]! }));

/** Situação vem da etapa (spec 4.4): saída pela chave; em andamento é tudo que não é saída conhecida. */
function condicaoDeSituacao(operacao: Operacao, situacoes: Situacao[]): Where {
  const saidas = saidasDaOperacao(operacao);
  const condicoes: Where[] = [];
  if (situacoes.includes('EM_ANDAMENTO')) {
    condicoes.push({ NOT: { estagio: { tipoEtapa: 'SAIDA', chave: { in: saidas.map((s) => s.chave) } } } });
  }
  const chaves = saidas.filter((s) => situacoes.includes(s.situacao)).map((s) => s.chave);
  if (chaves.length) condicoes.push({ estagio: { tipoEtapa: 'SAIDA', chave: { in: chaves } } });
  return ouNada(condicoes);
}

const ORIGENS_TIM = new Set<string>(Object.values(OrigemTim));
const CANAIS = new Set<string>(Object.values(Channel));

/**
 * Origem: na TIM, a do vínculo (`MANUAL`/`PLANILHA`) ou o canal de origem do
 * contato; na Starlink, só o canal (a captação tem filtro próprio).
 */
function condicaoDeOrigem(operacao: Operacao, origem: string[]): Where {
  const daTim = operacao === 'TIM' ? (origem.filter((o) => ORIGENS_TIM.has(o)) as OrigemTim[]) : [];
  const canais = origem.filter((o) => CANAIS.has(o)) as Channel[];
  return ouNada([
    ...(daTim.length ? [{ tim: { is: { origem: { in: daTim } } } }] : []),
    ...(canais.length ? [{ contato: { canalOrigem: { in: canais } } }] : []),
  ]);
}

/** As três condições de `prontoTim`. */
const PRONTO_TIM = { sistemaTimVendas: true, compraChip: 'CONCLUIDO', treinamento: 'CONCLUIDO' } as const;

function condicoesTim(f: NonNullable<FiltrosEsteira['tim']>): Where[] {
  const c: Where[] = [];
  if (f.dep?.length) c.push({ tim: { is: { dep: { in: f.dep } } } });
  if (f.trafegoPago === true) c.push({ tim: { is: { flagTrafegoPago: true } } });
  // Sem a linha 1:1 (registro antigo) vale o padrão: sem tráfego pago.
  if (f.trafegoPago === false) c.push({ NOT: { tim: { is: { flagTrafegoPago: true } } } });
  if (f.vendaLiberada === true) c.push({ tim: { is: PRONTO_TIM } });
  if (f.vendaLiberada === false) c.push({ NOT: { tim: { is: PRONTO_TIM } } });
  return c;
}

function condicoesStarlink(f: NonNullable<FiltrosEsteira['starlink']>): Where[] {
  const c: Where[] = [];
  if (f.tipoCaptacao?.length) c.push({ starlink: { is: { tipoCaptacao: { in: f.tipoCaptacao } } } });
  if (f.vivensis?.length) c.push({ starlink: { is: { vivensisStatus: { in: f.vivensis } } } });
  if (f.vsm === 'SIM') c.push({ starlink: { is: { vsm: true } } });
  if (f.vsm === 'NAO') c.push({ starlink: { is: { vsm: false } } });
  // Não respondido é nulo (ou sem a linha 1:1), nunca NÃO.
  if (f.vsm === 'VAZIO') c.push({ OR: [{ starlink: { is: { vsm: null } } }, { starlink: { is: null } }] });
  return c;
}

export function whereDosFiltros(operacao: Operacao, f: FiltrosEsteira, agora: Date): Where {
  const c: Where[] = [];
  const busca = f.busca?.trim();
  if (busca) c.push(condicaoDeBusca(busca));
  if (f.responsavelIds?.length) c.push({ responsavelId: { in: f.responsavelIds } });
  if (f.ufs?.length) c.push(doContatoSenaoConta('uf', { in: f.ufs }));
  if (f.cidades?.length) {
    c.push({ OR: f.cidades.flatMap((cidade) => doContatoSenaoConta('cidade', { equals: cidade, mode: 'insensitive' }).OR as Where[]) });
  }
  if (f.etapas?.length) {
    // Chave de outra operação não casa nada (nunca vaza para a outra esteira).
    const validas = chavesDaOperacao(operacao);
    c.push({ estagio: { chave: { in: f.etapas.filter((e) => validas.has(e)) } } });
  }
  if (f.situacoes?.length) c.push(condicaoDeSituacao(operacao, f.situacoes));
  if (f.desde || f.ate) {
    const fim = f.ate ? (f.ateExclusivo ? { lt: f.ate } : { lte: f.ate }) : {};
    c.push({ [f.periodoCampo ?? 'criadoEm']: { ...(f.desde ? { gte: f.desde } : {}), ...fim } });
  }
  if (f.paradoHaMaisDe != null) {
    // Saída nunca está "parada" (mesma regra do selo do card).
    c.push({
      estagioDesde: { lt: new Date(agora.getTime() - f.paradoHaMaisDe * DIA_MS) },
      estagio: { tipoEtapa: { not: 'SAIDA' } },
    });
  }
  if (f.origem?.length) c.push(condicaoDeOrigem(operacao, f.origem));
  if (operacao === 'TIM' && f.tim) c.push(...condicoesTim(f.tim));
  if (operacao === 'STARLINK' && f.starlink) c.push(...condicoesStarlink(f.starlink));
  return { operacao, arquivadoEm: null, ...(c.length ? { AND: c } : {}) };
}

// ---------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------

const CHAVES = [...ETAPAS.TIM, ...ETAPAS.STARLINK].map((e) => e.chave) as [ChaveEtapa, ...ChaveEtapa[]];
const SITUACOES = ['EM_ANDAMENTO', 'DESISTENTE', 'DESCREDENCIADO', 'NURTURE', 'DESCARTADO'] as const satisfies readonly Situacao[];

/** Datas sem hora são dias de Brasília (sem horário de verão desde 2019: fuso fixo). */
const FUSO = '-03:00';
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00${FUSO}`);

/** Data da query: só data → início do dia em Brasília; com hora → o instante informado. */
const dataDaQuery = z.preprocess(
  (v) => (typeof v === 'string' && SO_DATA.test(v.trim()) ? inicioDoDia(v.trim()) : v),
  z.coerce.date().optional(),
);

/** Lista na query: CSV (`?ufs=GO,TO`) ou parâmetro repetido; itens vazios somem. */
const lista = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    const itens = (Array.isArray(v) ? v : [v])
      .flatMap((x) => String(x ?? '').split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    return itens.length ? itens : undefined;
  }, z.array(item).max(200).optional());

const booleano = z.preprocess(
  (v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v),
  z.boolean().optional(),
);

const filtrosSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  responsavelIds: lista(z.string().uuid()),
  ufs: lista(
    z
      .string()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'UF inválida'),
  ),
  cidades: lista(z.string().max(120)),
  etapas: lista(z.enum(CHAVES)),
  situacoes: lista(z.enum(SITUACOES)),
  periodoCampo: z.enum(['criadoEm', 'estagioDesde']).optional(),
  desde: dataDaQuery,
  ate: dataDaQuery,
  paradoHaMaisDe: z.coerce.number().int().min(0).max(3650).optional(),
  origem: lista(z.string().max(40)),
  // TIM
  dep: lista(z.nativeEnum(DepTim)),
  trafegoPago: booleano,
  vendaLiberada: booleano,
  // Starlink
  tipoCaptacao: lista(z.nativeEnum(TipoCaptacao)),
  vivensis: lista(z.nativeEnum(VivensisStatus)),
  vsm: z.enum(['SIM', 'NAO', 'VAZIO']).optional(),
});

/** Só as chaves definidas (objeto sem `undefined`, para comparar e serializar limpo). */
const definidos = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/**
 * Filtros a partir da query string (lança `ZodError` → 400). Parâmetros vazios
 * são ignorados; os de paginação/ordenação passam ao largo. Os específicos de
 * operação vêm achatados (`dep`, `vsm`…) e saem agrupados em `tim`/`starlink`.
 */
export function parseFiltros(query: Record<string, unknown>): FiltrosEsteira {
  const preenchidos = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null));
  const { dep, trafegoPago, vendaLiberada, tipoCaptacao, vivensis, vsm, busca, ate, ...comuns } = filtrosSchema.parse(preenchidos);
  // `ate` só com data inclui o dia inteiro: vai até o início do dia seguinte, exclusivo.
  const ateSoData = typeof preenchidos.ate === 'string' && SO_DATA.test(preenchidos.ate.trim());
  const tim = definidos({ dep, trafegoPago, vendaLiberada });
  const starlink = definidos({ tipoCaptacao, vivensis, vsm });
  return definidos({
    ...comuns,
    busca: busca || undefined,
    ...(ate ? (ateSoData ? { ate: new Date(ate.getTime() + DIA_MS), ateExclusivo: true } : { ate }) : {}),
    ...(Object.keys(tim).length ? { tim } : {}),
    ...(Object.keys(starlink).length ? { starlink } : {}),
  });
}

// ---------------------------------------------------------------------------
// Opções dos filtros (para a estrutura da esteira)
// ---------------------------------------------------------------------------

type Opcao = { valor: string; rotulo: string };
export type FiltroEspecifico = { chave: string; rotulo: string; tipo: 'enum' | 'booleano'; multiplo: boolean; opcoes?: Opcao[] };

export const FILTROS_ESPECIFICOS: Record<Operacao, FiltroEspecifico[]> = {
  TIM: [
    {
      chave: 'dep',
      rotulo: 'DEP',
      tipo: 'enum',
      multiplo: true,
      opcoes: [
        { valor: 'TIM', rotulo: 'TIM' },
        { valor: 'PARCEIRO', rotulo: 'Parceiro' },
        { valor: 'BRADEL', rotulo: 'Bradel' },
      ],
    },
    { chave: 'trafegoPago', rotulo: 'Tráfego pago', tipo: 'booleano', multiplo: false },
    { chave: 'vendaLiberada', rotulo: 'Venda liberada', tipo: 'booleano', multiplo: false },
  ],
  STARLINK: [
    {
      chave: 'tipoCaptacao',
      rotulo: 'Captação',
      tipo: 'enum',
      multiplo: true,
      opcoes: [
        { valor: 'LEAD_INBOUND', rotulo: 'Lead inbound' },
        { valor: 'PROSPECCAO_ATIVA', rotulo: 'Prospecção ativa' },
      ],
    },
    {
      chave: 'vivensis',
      rotulo: 'Vivensis',
      tipo: 'enum',
      multiplo: true,
      opcoes: [
        { valor: 'PENDENTE', rotulo: 'Pendente' },
        { valor: 'APROVADO', rotulo: 'Aprovado' },
        { valor: 'REPROVADO', rotulo: 'Reprovado' },
      ],
    },
    {
      chave: 'vsm',
      rotulo: 'VSM',
      tipo: 'enum',
      multiplo: false,
      opcoes: [
        { valor: 'SIM', rotulo: 'Sim' },
        { valor: 'NAO', rotulo: 'Não' },
        { valor: 'VAZIO', rotulo: 'Não respondido' },
      ],
    },
  ],
};

const CANAIS_ROTULO: Record<Channel, string> = {
  WEBCHAT: 'Webchat',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  EMAIL: 'E-mail',
  VOZ: 'Voz',
  PROSPECCAO_ATIVA: 'Prospecção ativa',
  INDICACAO: 'Indicação',
};
const canais = Object.entries(CANAIS_ROTULO).map(([valor, rotulo]) => ({ valor, rotulo }));

/** Valores aceitos no filtro `origem` de cada operação. */
export const ORIGENS: Record<Operacao, Opcao[]> = {
  TIM: [{ valor: 'MANUAL', rotulo: 'Cadastro manual' }, { valor: 'PLANILHA', rotulo: 'Planilha' }, ...canais],
  STARLINK: canais,
};

// ---------------------------------------------------------------------------
// Cursor do Kanban
// ---------------------------------------------------------------------------

/** Posição na coluna: a ordem é `estagioDesde` asc (mais antigo primeiro), desempate pelo id. */
export type PosicaoNaColuna = { estagioDesde: Date; id: string };

/** Cursor opaco: base64url de `estagioDesde|id`. */
export function codificarCursor(p: PosicaoNaColuna): string {
  return Buffer.from(`${p.estagioDesde.toISOString()}|${p.id}`).toString('base64url');
}

/** Nulo se o cursor não for um que `codificarCursor` produziu. */
export function decodificarCursor(cursor: string): PosicaoNaColuna | null {
  const texto = Buffer.from(cursor, 'base64url').toString('utf8');
  const separador = texto.indexOf('|');
  if (separador < 0) return null;
  const estagioDesde = new Date(texto.slice(0, separador));
  const id = texto.slice(separador + 1);
  if (Number.isNaN(estagioDesde.getTime()) || !id) return null;
  return { estagioDesde, id };
}

/** Itens depois da posição do cursor, na ordem da coluna. */
export function whereDepoisDoCursor(p: PosicaoNaColuna): Where {
  return { OR: [{ estagioDesde: { gt: p.estagioDesde } }, { estagioDesde: p.estagioDesde, id: { gt: p.id } }] };
}
