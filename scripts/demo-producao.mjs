/**
 * Base de demonstracao: clientes ficticios para mostrar a plataforma, e a
 * remocao exata deles depois.
 *
 * Existe porque produção tem dois contatos e nenhum cliente — uma tela honesta,
 * e inutil para mostrar a alguem o que o sistema faz. Dashboard com zero em tudo
 * nao demonstra nada.
 *
 * Duas travas, porque isto escreve em producao:
 *
 * 1. `--confirmar` e obrigatorio. Rodar sem ele nao faz nada.
 * 2. Todo registro criado nasce com a etiqueta `demo` E fica anotado num
 *    inventario em disco, com o id. A remocao le esse inventario e apaga
 *    **exatamente** o que foi criado — nao "tudo que parece demo", que e como se
 *    apaga dado de verdade por engano.
 *
 * Nenhum usuario e criado: login em producao e coisa que fica. As conversas sao
 * atribuidas ao usuario que ja existe.
 *
 *   node scripts/demo-producao.mjs --env apps/api/.env.coolify --confirmar
 *   node scripts/demo-producao.mjs --env apps/api/.env.coolify --remover demo-producao.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

/* ── argumentos ────────────────────────────────────────────────────────────── */

const arg = (nome) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? true) : null;
};

const caminhoEnv = arg('--env');
const confirmar = process.argv.includes('--confirmar');
const remover = arg('--remover');
const saida = arg('--saida') ?? 'demo-producao.json';

if (!caminhoEnv) {
  console.error('Informe --env <arquivo .env> com a DIRECT_URL do banco alvo.');
  process.exit(1);
}
if (!confirmar && !remover) {
  console.error(
    'Nada feito. Use --confirmar para criar a base de demonstracao, ou --remover <inventario.json>.',
  );
  process.exit(1);
}

/** Le a DIRECT_URL do arquivo, nunca da linha de comando: credencial em argumento fica no historico do shell. */
function urlDoArquivo(caminho) {
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const [chave, ...resto] = linha.split('=');
    if (chave.trim() === 'DIRECT_URL') return resto.join('=').trim().replace(/^"|"$/g, '');
  }
  throw new Error(`DIRECT_URL nao encontrada em ${caminho}`);
}

const url = urlDoArquivo(caminhoEnv);
// O host aparece mascarado no log: quem le precisa saber QUAL banco, sem a senha.
console.log(`\nbanco alvo: ${url.replace(/\/\/[^@]+@/, '//<credencial>@')}\n`);

const prisma = new PrismaClient({ datasources: { db: { url } } });

/* ── remocao ───────────────────────────────────────────────────────────────── */

if (remover) {
  const inv = JSON.parse(readFileSync(remover, 'utf8'));
  console.log(`removendo o inventario de ${inv.criadoEm} (organizacao ${inv.organizacaoId})\n`);

  /*
   * Ordem importa: filho antes de pai.
   *
   * Varias relacoes sao `onDelete: SetNull` e nao `Cascade` — apagar o contato
   * deixaria a conversa orfa em vez de apagada. Por isso a ordem e explicita, e
   * nao "apaga tudo e o banco resolve".
   */
  const passos = [
    ['pesquisas', () => prisma.survey.deleteMany({ where: { id: { in: inv.pesquisas } } })],
    ['mensagens', () => prisma.message.deleteMany({ where: { conversaId: { in: inv.conversas } } })],
    ['atividades', () => prisma.activity.deleteMany({ where: { id: { in: inv.atividades } } })],
    ['comentarios', () => prisma.ticketComment.deleteMany({ where: { ticketId: { in: inv.protocolos } } })],
    ['protocolos', () => prisma.ticket.deleteMany({ where: { id: { in: inv.protocolos } } })],
    ['chamadas', () => prisma.call.deleteMany({ where: { id: { in: inv.chamadas } } })],
    ['conversas', () => prisma.conversation.deleteMany({ where: { id: { in: inv.conversas } } })],
    ['oportunidades', () => prisma.opportunity.deleteMany({ where: { id: { in: inv.oportunidades } } })],
    ['leads', () => prisma.lead.deleteMany({ where: { id: { in: inv.leads } } })],
    ['contatos', () => prisma.contact.deleteMany({ where: { id: { in: inv.contatos } } })],
    ['contas', () => prisma.account.deleteMany({ where: { id: { in: inv.contas } } })],
  ];

  for (const [nome, executar] of passos) {
    const { count } = await executar();
    console.log(`  ${String(count).padStart(3)} ${nome}`);
  }

  // O contador de protocolo nao volta: numero de protocolo emitido nao se
  // reutiliza, e reaproveitar faria dois chamados diferentes terem o mesmo
  // numero no historico de quem ja recebeu.
  const [{ maior }] = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(MAX(numero), 0) AS maior FROM protocolos WHERE organizacao_id = $1`,
    inv.organizacaoId,
  );
  console.log(`\ncontador de protocolo segue adiante (maior numero restante: ${maior}).`);
  console.log('Remocao concluida.\n');
  await prisma.$disconnect();
  process.exit(0);
}

/* ── criacao ───────────────────────────────────────────────────────────────── */

const orgs = await prisma.organizacao.findMany({ select: { id: true, nome: true, slug: true } });
const escolhida = arg('--organizacao');
/*
 * Uma organizacao so, ou o id explicito.
 *
 * Producao tem uma, e a trava serve para o script nunca ter de adivinhar em
 * qual escrever. Em desenvolvimento sobram as organizacoes das suites de smoke,
 * e para poder ensaiar o script antes de apontar para producao o id vem no
 * `--organizacao`.
 */
const org = escolhida
  ? orgs.find((o) => o.id === escolhida || o.slug === escolhida)
  : orgs.length === 1
    ? orgs[0]
    : null;
if (!org) {
  console.error(
    orgs.length === 1 || escolhida
      ? `Organizacao "${escolhida}" nao encontrada neste banco.`
      : `Este banco tem ${orgs.length} organizacoes. Informe --organizacao <id ou slug> para nao escrever na errada.`,
  );
  process.exit(1);
}
const ORG = org.id;
console.log(`organizacao: ${org.nome} (${org.slug})`);

const usuario = await prisma.user.findFirst({ where: { organizacaoId: ORG, ativo: true } });
if (!usuario) throw new Error('nenhum usuario ativo para atribuir as conversas');

const filas = await prisma.queue.findMany({ where: { organizacaoId: ORG, ativa: true } });
if (filas.length === 0) throw new Error('nenhuma fila ativa');

const funil = await prisma.funnel.findFirst({
  where: { organizacaoId: ORG },
  include: { estagios: { orderBy: { ordem: 'asc' } } },
});
if (!funil || funil.estagios.length === 0) throw new Error('nenhum funil com estagios');

/** Inventario do que foi criado. Sem ele a remocao seria adivinhacao. */
const inv = {
  criadoEm: new Date().toISOString(),
  organizacaoId: ORG,
  contas: [],
  contatos: [],
  conversas: [],
  pesquisas: [],
  chamadas: [],
  protocolos: [],
  leads: [],
  oportunidades: [],
  atividades: [],
};

/** Marca tudo o que e ficticio, e da o filtro para conferir na tela. */
const ETIQUETA = 'demo';

/** Minutos atras, como Date. Fracao de hora aceita. */
const atras = (minutos) => new Date(Date.now() - minutos * 60000);
const horas = (h) => atras(h * 60);
const dias = (d) => atras(d * 24 * 60);

const sorteio = (lista, i) => lista[i % lista.length];

/*
 * Empresas inventadas de proposito.
 *
 * Nada de nome de empresa real: um cliente ficticio com nome de empresa que
 * existe passa a parecer um registro verdadeiro no dia em que alguem esquecer
 * que era demonstracao.
 */
const EMPRESAS = [
  { nome: 'Supermercado Vale Verde (demo)', segmento: 'Varejo alimentar', tags: ['revenda', 'atacado'] },
  { nome: 'Padaria Trigo de Ouro (demo)', segmento: 'Alimentacao', tags: ['pequeno porte'] },
  { nome: 'Clinica Bem Estar (demo)', segmento: 'Saude', tags: ['contrato anual'] },
  { nome: 'Colegio Novo Horizonte (demo)', segmento: 'Educacao', tags: ['contrato anual', 'licitacao'] },
  { nome: 'Hotel Serra Azul (demo)', segmento: 'Hotelaria', tags: ['revenda'] },
  { nome: 'Distribuidora Campo Largo (demo)', segmento: 'Distribuicao', tags: ['atacado'] },
];

const PESSOAS = [
  ['Marina Alves', 'Gerente de manutencao'],
  ['Rogerio Pinto', 'Proprietario'],
  ['Cintia Barros', 'Administradora'],
  ['Elias Moura', 'Diretor'],
  ['Tatiana Rocha', 'Gerente predial'],
  ['Vitor Sampaio', 'Comprador'],
  ['Helena Diniz', 'Coordenadora'],
  ['Bruno Teixeira', 'Supervisor de obras'],
];

const ASSUNTOS = [
  'Orcamento de split para o salao',
  'Manutencao preventiva do semestre',
  'Ar-condicionado nao esta gelando',
  'Agendamento de instalacao',
  'Duvida sobre a garantia',
  'Ruido na unidade externa',
];

const CANAIS = ['WHATSAPP', 'WEBCHAT', 'INSTAGRAM', 'WHATSAPP', 'WEBCHAT'];

console.log('\ncriando...');

/* clientes e contatos */
for (const [i, empresa] of EMPRESAS.entries()) {
  const conta = await prisma.account.create({
    data: {
      organizacaoId: ORG,
      nome: empresa.nome,
      segmento: empresa.segmento,
      telefone: `+55629${String(30000000 + i * 1111).slice(0, 8)}`,
      tags: [ETIQUETA, ...empresa.tags],
      criadoEm: dias(120 - i * 12),
    },
  });
  inv.contas.push(conta.id);
}

for (const [i, [nome, cargo]] of PESSOAS.entries()) {
  const conta = inv.contas[i % inv.contas.length];
  const contato = await prisma.contact.create({
    data: {
      organizacaoId: ORG,
      nome: `${nome} (demo)`,
      telefone: `+55629${String(81000000 + i * 137).slice(0, 8)}`,
      email: `${nome.split(' ')[0].toLowerCase()}.demo@exemplo.com.br`,
      canalOrigem: sorteio(CANAIS, i),
      contaId: conta,
      observacoes: cargo,
      tags: [ETIQUETA, i % 3 === 0 ? 'decisor' : 'operacional'],
      criadoEm: dias(110 - i * 9),
    },
  });
  inv.contatos.push(contato.id);
}

/*
 * Conversas em tres tempos, porque o dashboard mede a janela de 24 horas.
 *
 * Sem conversa recente, a tela mostra zero em tudo e a demonstracao nao mostra
 * nada. Sem conversa antiga, a linha do tempo da ficha fica rasa. Precisa das
 * duas coisas.
 */
const FALAS = [
  ['CLIENTE', 'Bom dia! Preciso de ajuda com o ar-condicionado da loja.'],
  ['AGENTE', 'Bom dia! Claro. Qual o modelo e desde quando esta acontecendo?'],
  ['CLIENTE', 'Split de 18 mil, desde ontem soprando quente.'],
  ['AGENTE', 'Entendi. Vou agendar uma visita tecnica para hoje a tarde.'],
  ['CLIENTE', 'Perfeito, obrigado!'],
];

/*
 * `estado` e explicito, e nao derivado de `i % 3`.
 *
 * A primeira versao calculava o status a partir do indice e do "finalizada", e o
 * resultado foi **zero conversas em atendimento** em producao — todas as nao
 * finalizadas cairam em espera. Numa demonstracao isso e o pior lugar para
 * errar: a tela de Atendimento e onde se mostra o trabalho acontecendo, e ela
 * ficou vazia. Estado calculado por resto de divisao economiza uma linha e
 * esconde o que a base vai parecer.
 */
async function conversa({ contatoId, i, minutosAtras, estado, comPesquisa }) {
  const inicio = atras(minutosAtras);
  const atribuido = new Date(inicio.getTime() + (60 + i * 37) * 1000);
  const fim = estado === 'FINALIZADO' ? new Date(atribuido.getTime() + (300 + i * 211) * 1000) : null;
  // Espera nao tem agente nem atribuicao: e o que faz a fila existir na tela.
  const naFila = estado === 'EM_ESPERA';

  const c = await prisma.conversation.create({
    data: {
      organizacaoId: ORG,
      canal: sorteio(CANAIS, i),
      status: estado,
      assunto: sorteio(ASSUNTOS, i),
      contatoId,
      filaId: sorteio(filas, i).id,
      agenteId: naFila ? null : usuario.id,
      criadoEm: inicio,
      atribuidoEm: naFila ? null : atribuido,
      finalizadoEm: fim,
      ultimaMensagemEm: fim ?? (naFila ? inicio : atribuido),
    },
  });
  inv.conversas.push(c.id);

  for (const [j, [autor, conteudo]] of FALAS.entries()) {
    await prisma.message.create({
      data: {
        organizacaoId: ORG,
        conversaId: c.id,
        autor,
        autorId: autor === 'AGENTE' ? usuario.id : null,
        conteudo,
        criadoEm: new Date(inicio.getTime() + j * 4 * 60000),
      },
    });
  }

  if (comPesquisa && fim) {
    const p = await prisma.survey.create({
      data: {
        organizacaoId: ORG,
        conversaId: c.id,
        tipo: i % 4 === 0 ? 'NPS' : 'CSAT',
        // Notas boas com um senao: CSAT 5 em tudo parece dado inventado, porque e.
        nota: i % 4 === 0 ? (i % 8 === 0 ? 9 : 7) : i % 5 === 0 ? 3 : 5,
        comentario: i % 5 === 0 ? 'Demorou para atender, mas resolveu.' : 'Atendimento rapido.',
        token: `demo-${c.id.slice(0, 8)}-${i}`,
        enviadoEm: new Date(fim.getTime() + 60000),
        entregueEm: new Date(fim.getTime() + 90000),
        respondidoEm: new Date(fim.getTime() + 15 * 60000),
      },
    });
    inv.pesquisas.push(p.id);
  }
  return c;
}

/*
 * Mistura das ultimas 24 horas, escrita a mao.
 *
 * Tres em espera para a fila ter trabalho, tres em atendimento para a tela do
 * agente ter cartao aberto, e cinco finalizadas para haver TME, TMA e pesquisa
 * respondida. E o retrato de um dia de operacao, e nao uma lista de status.
 */
const RECENTES = [
  'EM_ESPERA',
  'EM_ATENDIMENTO',
  'FINALIZADO',
  'EM_ATENDIMENTO',
  'FINALIZADO',
  'EM_ESPERA',
  'FINALIZADO',
  'EM_ATENDIMENTO',
  'FINALIZADO',
  'EM_ESPERA',
  'FINALIZADO',
];

for (const [i, estado] of RECENTES.entries()) {
  await conversa({
    contatoId: sorteio(inv.contatos, i),
    i,
    minutosAtras: 25 + i * 80,
    estado,
    comPesquisa: true,
  });
}
// Antigas: dao profundidade a ficha dos clientes.
for (let i = RECENTES.length; i < RECENTES.length + 6; i += 1) {
  await conversa({
    contatoId: sorteio(inv.contatos, i),
    i,
    minutosAtras: (i - 6) * 24 * 60,
    estado: 'FINALIZADO',
    comPesquisa: i % 2 === 0,
  });
}

/* chamadas de voz */
for (let i = 0; i < 6; i += 1) {
  const atendida = i % 4 !== 0;
  const inicio = horas(2 + i * 3);
  const chamada = await prisma.call.create({
    data: {
      organizacaoId: ORG,
      idExterno: `demo-voz-${Date.now()}-${i}`,
      direcao: i % 2 === 0 ? 'ENTRANTE' : 'SAINTE',
      status: atendida ? 'COMPLETADA' : 'NAO_ATENDIDA',
      numeroOrigem: '+556232110000',
      numeroDestino: `+55629810000${i}`,
      contatoId: sorteio(inv.contatos, i),
      agenteId: usuario.id,
      filaId: sorteio(filas, i).id,
      iniciadoEm: inicio,
      atendidoEm: atendida ? new Date(inicio.getTime() + 12000) : null,
      encerradoEm: new Date(inicio.getTime() + (atendida ? 400000 : 25000)),
      duracao: atendida ? 180 + i * 47 : null,
    },
  });
  inv.chamadas.push(chamada.id);
}

/* protocolos: abertos, um com SLA vencido, e resolvidos */
async function proximoNumero() {
  const [linha] = await prisma.$queryRawUnsafe(
    `UPDATE "organizacoes" SET "proximo_protocolo" = "proximo_protocolo" + 1 WHERE id = $1 RETURNING "proximo_protocolo" - 1 AS numero`,
    ORG,
  );
  return Number(linha.numero);
}

const CHAMADOS = [
  ['Split da padaria nao esta gelando', 'ALTA', 'EM_ANDAMENTO', -6],
  ['Troca de filtro atrasada', 'NORMAL', 'ABERTO', 30],
  ['Ruido na condensadora', 'NORMAL', 'RESOLVIDO', null],
  ['Vazamento de agua no evaporador', 'URGENTE', 'ABERTO', 8],
  ['Revisao preventiva semestral', 'BAIXA', 'RESOLVIDO', null],
  ['Controle remoto sem resposta', 'NORMAL', 'AGUARDANDO_CLIENTE', 48],
];

for (const [i, [titulo, prioridade, status, slaHoras]] of CHAMADOS.entries()) {
  const resolvido = status === 'RESOLVIDO';
  const t = await prisma.ticket.create({
    data: {
      organizacaoId: ORG,
      numero: await proximoNumero(),
      titulo: `${titulo} (demo)`,
      descricao: 'Registro de demonstracao. Pode ser removido.',
      status,
      prioridade,
      contatoId: sorteio(inv.contatos, i),
      contaId: sorteio(inv.contas, i),
      filaId: sorteio(filas, i).id,
      responsavelId: i % 3 === 0 ? null : usuario.id,
      // SLA negativo = ja venceu: e o numero que o painel mostra em vermelho.
      prazoSla: slaHoras === null ? null : horas(-slaHoras),
      criadoEm: dias(i % 3 === 0 ? 0 : 3 + i),
      resolvidoEm: resolvido ? horas(20 + i) : null,
    },
  });
  inv.protocolos.push(t.id);

  await prisma.ticketComment.create({
    data: {
      ticketId: t.id,
      autorId: usuario.id,
      conteudo: resolvido ? 'Servico concluido e conferido com o cliente.' : 'Tecnico acionado.',
      interno: false,
      criadoEm: dias(1),
    },
  });
}

/* leads e oportunidades espalhados pelo funil */
const FASES = ['NOVO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO'];
for (let i = 0; i < 7; i += 1) {
  const fase = sorteio(FASES, i);
  const l = await prisma.lead.create({
    data: {
      organizacaoId: ORG,
      contatoId: sorteio(inv.contatos, i),
      contaId: sorteio(inv.contas, i),
      fase,
      tipo: sorteio(['INBOUND', 'OUTBOUND', 'INDICACAO'], i),
      canalOrigem: sorteio(CANAIS, i),
      valorEstimado: 8000 + i * 4500,
      observacoes: 'Lead de demonstracao.',
      motivoPerda: fase === 'PERDIDO' ? 'PRECO' : null,
      fechadoEm: fase === 'GANHO' || fase === 'PERDIDO' ? dias(5 + i) : null,
      criadoEm: dias(20 + i * 4),
    },
  });
  inv.leads.push(l.id);
}

const NEGOCIOS = [
  ['Climatizacao do salao principal', 86400, 'ABERTA'],
  ['Contrato de manutencao anual', 21600, 'ABERTA'],
  ['Troca de 4 splits do escritorio', 32800, 'ABERTA'],
  ['Cortina de ar da entrada', 9400, 'GANHA'],
  ['Camara fria do acougue', 54200, 'GANHA'],
  ['Reforma do sistema de exaustao', 18900, 'PERDIDA'],
];

for (const [i, [titulo, valor, status]] of NEGOCIOS.entries()) {
  const o = await prisma.opportunity.create({
    data: {
      organizacaoId: ORG,
      titulo: `${titulo} (demo)`,
      contaId: sorteio(inv.contas, i),
      funilId: funil.id,
      // Espalha pelos estagios para o kanban ter colunas com conteudo.
      estagioId: sorteio(funil.estagios, i).id,
      responsavelId: usuario.id,
      valor,
      status,
      motivoPerda: status === 'PERDIDA' ? 'CONCORRENTE' : null,
      previsaoFechamento: dias(-15 - i * 5),
      fechadoEm: status === 'ABERTA' ? null : dias(4 + i),
      criadoEm: dias(30 + i * 6),
    },
  });
  inv.oportunidades.push(o.id);
}

/* atividades: algumas em aberto, uma atrasada, algumas concluidas */
const TAREFAS = [
  ['VISITA', 'Visita tecnica agendada', -1],
  ['LIGACAO', 'Retornar sobre a proposta', -2],
  ['PROPOSTA', 'Enviar proposta revisada', 3],
  ['NOTA', 'Cliente prefere contato por WhatsApp', null],
  ['REUNIAO', 'Reuniao de fechamento', -4],
  ['EMAIL', 'Mandar nota fiscal', 1],
];

for (const [i, [tipo, titulo, prazoDias]] of TAREFAS.entries()) {
  const concluida = i % 3 === 2;
  const a = await prisma.activity.create({
    data: {
      organizacaoId: ORG,
      tipo,
      titulo: `${titulo} (demo)`,
      descricao: 'Atividade de demonstracao.',
      prazo: prazoDias === null ? null : dias(prazoDias),
      concluidoEm: concluida ? dias(1) : null,
      responsavelId: usuario.id,
      criadoPorId: usuario.id,
      contatoId: sorteio(inv.contatos, i),
      contaId: sorteio(inv.contas, i),
      criadoEm: dias(6 + i),
    },
  });
  inv.atividades.push(a.id);
}

writeFileSync(saida, JSON.stringify(inv, null, 2));

const total = Object.entries(inv)
  .filter(([, v]) => Array.isArray(v))
  .map(([k, v]) => `${v.length} ${k}`)
  .join(', ');

console.log(`\ncriado: ${total}`);
console.log(`inventario: ${saida}`);
console.log(`\nTodo registro tem a etiqueta "${ETIQUETA}" e o sufixo "(demo)" no nome.`);
console.log('Para remover exatamente isto:');
console.log(`  node scripts/demo-producao.mjs --env ${caminhoEnv} --remover ${saida}\n`);

await prisma.$disconnect();
