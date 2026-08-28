import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Teste contra erosao arquitetural.
 *
 * O isolamento por organizacao nao se mantem por disciplina: mantem-se porque
 * uma tabela nova que nao decidir de que lado esta **quebra a suite**. Sem isto,
 * a Fase 3 criaria `Proposal` sem `organizacaoId` meses depois desta decisao, o
 * defeito nao apareceria em nenhum teste, e o vazamento estrearia em producao.
 *
 * Toda tabela cai em um de tres grupos, e o grupo tem de ser explicito:
 *
 *  - **raiz**: tem `organizacaoId` e a extensao do Prisma a filtra;
 *  - **filha**: nao tem a coluna porque o pai tem, e toda leitura passa por ele;
 *  - **global**: nao pertence a organizacao nenhuma (a propria `Organizacao`).
 *
 * Uma tabela fora dos tres grupos falha aqui com o nome dela e o que fazer.
 */

// `process.cwd()` e nao `import.meta.dirname`: o tsc do build usa modulo CommonJS
// e recusa `import.meta`. O vitest roda a suite da raiz do repositorio.
const RAIZ_DIR = join(process.cwd(), 'apps', 'api');
const schema = readFileSync(join(RAIZ_DIR, 'prisma', 'schema.prisma'), 'utf8');

/**
 * Filhas: chegam sempre pelo pai, entao a coluna seria uma segunda verdade que
 * pode divergir. Cada entrada diz por qual caminho o filtro chega.
 */
const FILHAS: Record<string, string> = {
  QueueAgent: 'Queue',
  FunnelStage: 'Funnel',
  OpportunityItem: 'Opportunity',
  OpportunityStageLog: 'Opportunity',
  CatalogItem: 'PriceCatalog',
  CampaignItem: 'Campaign',
  BotStep: 'Bot',
  TicketComment: 'Ticket',
  TicketAttachment: 'Ticket',
  TicketSchedule: 'Ticket',
  PresenceLog: 'User',
};

/** Globais: existem acima ou fora de qualquer organizacao. */
const GLOBAIS = new Set(['Organizacao']);

/** Modelos do schema, com o corpo de cada um. */
function modelos(): Map<string, string> {
  const encontrados = new Map<string, string>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) encontrados.set(m[1]!, m[2]!);
  return encontrados;
}

describe('todo modelo declara de que lado do isolamento esta', () => {
  const todos = modelos();

  it('o schema foi lido e tem modelos', () => {
    expect(todos.size).toBeGreaterThan(30);
  });

  it('nenhum modelo ficou sem classificacao', () => {
    const semClassificacao: string[] = [];

    for (const [nome, corpo] of todos) {
      const temColuna = /organizacaoId\s+String/.test(corpo);
      const classificado = temColuna || nome in FILHAS || GLOBAIS.has(nome);
      if (!classificado) semClassificacao.push(nome);
    }

    expect(
      semClassificacao,
      `Modelo(s) sem definicao de organizacao: ${semClassificacao.join(', ')}.\n` +
        'Escolha um dos tres caminhos:\n' +
        '  1. acrescente `organizacaoId String @default("") @map("organizacao_id")` e a relacao,\n' +
        '     inclua o nome em COM_ORGANIZACAO (lib/prisma.ts) e crie a migration com CHECK;\n' +
        '  2. se a tabela e filha e sempre chega pelo pai, declare-a em FILHAS aqui, dizendo qual e o pai;\n' +
        '  3. se ela nao pertence a organizacao nenhuma, declare-a em GLOBAIS aqui.',
    ).toEqual([]);
  });

  it('toda tabela raiz tem o default vazio que o CHECK do banco protege', () => {
    const semDefault: string[] = [];
    for (const [nome, corpo] of todos) {
      if (!/organizacaoId\s+String/.test(corpo)) continue;
      if (!/organizacaoId\s+String\s+.*@default\(""\)/.test(corpo)) semDefault.push(nome);
    }
    expect(
      semDefault,
      `Sem @default(""): ${semDefault.join(', ')}. Ele e o que permite ao TypeScript nao exigir a ` +
        'organizacao em cada criacao; o CHECK no banco e que recusa o valor vazio se a extensao for contornada.',
    ).toEqual([]);
  });

  it('toda tabela raiz tem indice que comeca pela organizacao', () => {
    const semIndice: string[] = [];
    for (const [nome, corpo] of todos) {
      if (!/organizacaoId\s+String/.test(corpo)) continue;
      // Unica por organizacao (as de linha unica) nao precisa de indice extra:
      // a propria unicidade e o indice.
      if (/organizacaoId\s+String\s+.*@unique/.test(corpo)) continue;
      if (!/@@(index|unique)\(\[organizacaoId/.test(corpo)) semIndice.push(nome);
    }
    expect(
      semIndice,
      `Sem indice comecando por organizacaoId: ${semIndice.join(', ')}. Indice que nao comeca pela ` +
        'organizacao nao e usado: toda consulta filtra por ela primeiro, e o Postgres so aproveita o prefixo.',
    ).toEqual([]);
  });

  it('a lista da extensao do Prisma bate com o schema', () => {
    const noSchema = [...todos]
      .filter(([, corpo]) => /organizacaoId\s+String/.test(corpo))
      .map(([nome]) => nome)
      .sort();

    const fonte = readFileSync(join(RAIZ_DIR, 'src', 'lib', 'prisma.ts'), 'utf8');
    const bloco = /const COM_ORGANIZACAO = new Set\(\[([\s\S]*?)\]\)/.exec(fonte);
    expect(bloco, 'nao achei COM_ORGANIZACAO em lib/prisma.ts').toBeTruthy();

    const naExtensao = [...bloco![1]!.matchAll(/'(\w+)'/g)].map((m) => m[1]!).sort();

    // As duas listas tem de ser identicas: tabela no schema e fora da extensao
    // nao e filtrada (vaza); na extensao e fora do schema quebra toda consulta
    // daquela tabela com erro de coluna inexistente.
    expect(naExtensao).toEqual(noSchema);
  });
});
