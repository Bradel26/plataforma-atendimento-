/**
 * Exemplo de vida de cliente, para ver a ficha 360 com conteudo de verdade.
 *
 * Escreve DIRETO no banco de desenvolvimento, com datas espalhadas por cinco
 * meses: a linha do tempo so mostra o que ela sabe juntar, e com tudo criado no
 * mesmo instante nao da para ver se a ordem funciona.
 *
 * Caso escolhido de proposito parecido com o real: cliente compra splits, a
 * venda fecha, e depois o mesmo cliente volta como assistencia tecnica. E onde
 * a ficha precisa mostrar as duas vidas no mesmo lugar.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ORG = '00000000-0000-0000-0000-000000000001';

/** Data relativa a agora, em dias para tras (negativo = futuro). */
const diasAtras = (d, hora = 10) => {
  const t = new Date(Date.now() - d * 86400000);
  t.setHours(hora, (Math.abs(d) * 7) % 60, 0, 0);
  return t;
};

const org = await prisma.organizacao.findUnique({ where: { id: ORG } });
if (!org) throw new Error('organizacao de desenvolvimento nao encontrada — rode o seed');

/* -- Usuarios: garante os dois perfis novos do 1.2 ------------------------- */

const agente = await prisma.user.findFirst({ where: { organizacaoId: ORG, perfil: 'AGENTE' } });

async function garantirUsuario(nome, email, senha, perfil, gestorId) {
  const existe = await prisma.user.findFirst({ where: { organizacaoId: ORG, email } });
  if (existe) {
    if (gestorId && !existe.gestorId) {
      return prisma.user.update({ where: { id: existe.id }, data: { gestorId } });
    }
    return existe;
  }
  return prisma.user.create({
    data: {
      organizacaoId: ORG,
      nome,
      email,
      senhaHash: await bcrypt.hash(senha, 10),
      perfil,
      ativo: true,
      gestorId,
    },
  });
}

const gestor = await garantirUsuario('Gestor Demo', 'gestor@plataforma.local', 'Gestor@123', 'GESTOR');
const comercial = await garantirUsuario(
  'Comercial Demo',
  'comercial@plataforma.local',
  'Comer@123',
  'COMERCIAL',
  gestor.id,
);

/* -- Cliente e contato ---------------------------------------------------- */

const conta = await prisma.account.create({
  data: {
    organizacaoId: ORG,
    nome: 'Supermercado Rio Verde LTDA',
    cnpj: '18.402.771/0001-63',
    segmento: 'Varejo alimentar',
    site: 'rioverde.com.br',
    // Carteira do comercial: e o que faz a ficha aparecer para ele e nao para
    // um agente sem vinculo operacional.
    responsavelId: comercial.id,
  },
});

const contato = await prisma.contact.create({
  data: {
    organizacaoId: ORG,
    nome: 'Marcos Rebelo',
    telefone: '+5562984410277',
    email: 'marcos.rebelo@rioverde.com.br',
    observacoes: 'Gerente de manutencao. Decide sobre climatizacao das cinco lojas.',
    canalOrigem: 'WEBCHAT',
    contaId: conta.id,
    responsavelId: comercial.id,
    criadoEm: diasAtras(150),
  },
});

const filaGeral = await prisma.queue.findFirst({ where: { organizacaoId: ORG, nome: 'Atendimento Geral' } });
const filaSuporte = await prisma.queue.findFirst({ where: { organizacaoId: ORG, nome: 'Suporte Tecnico' } });
const funil = await prisma.funnel.findFirst({
  where: { organizacaoId: ORG },
  include: { estagios: { orderBy: { ordem: 'asc' } } },
});
const fechamento = funil.estagios.at(-1);
const negociacao = funil.estagios.find((e) => e.nome === 'Negociacao') ?? funil.estagios.at(-2);

/** Cria as falas de uma conversa a partir de [autor, texto, minutos]. */
async function falar(conversaId, inicio, falas) {
  for (const [autor, conteudo, min] of falas) {
    await prisma.message.create({
      data: {
        organizacaoId: ORG,
        conversaId,
        autor,
        autorId: autor === 'AGENTE' ? agente.id : null,
        conteudo,
        criadoEm: new Date(inicio.getTime() + min * 60000),
      },
    });
  }
}

/* -- 1. A primeira vez que ele apareceu: webchat pedindo orcamento --------- */

const inicioOrcamento = diasAtras(150);
const conversaOrcamento = await prisma.conversation.create({
  data: {
    organizacaoId: ORG,
    canal: 'WEBCHAT',
    status: 'FINALIZADO',
    assunto: 'Orcamento de 12 splits para a loja nova',
    contatoId: contato.id,
    filaId: filaGeral.id,
    agenteId: agente.id,
    criadoEm: inicioOrcamento,
    ultimaMensagemEm: diasAtras(150, 11),
    finalizadoEm: diasAtras(150, 11),
  },
});
await falar(conversaOrcamento.id, inicioOrcamento, [
  ['CLIENTE', 'Bom dia. Estamos abrindo uma loja no setor Bueno e preciso de orcamento para 12 splits.', 0],
  ['AGENTE', 'Bom dia, Marcos! Consigo sim. Sao ambientes de que tamanho?', 4],
  ['CLIENTE', 'Salao principal grande, mais padaria, acougue e dois escritorios.', 9],
  ['AGENTE', 'Perfeito. Vou passar para o comercial montar a proposta com a metragem de cada ambiente.', 12],
  ['CLIENTE', 'Otimo, obrigado.', 15],
]);

await prisma.lead.create({
  data: {
    organizacaoId: ORG,
    contatoId: contato.id,
    contaId: conta.id,
    fase: 'GANHO',
    tipo: 'INBOUND',
    responsavelId: comercial.id,
    canalOrigem: 'WEBCHAT',
    valorEstimado: 84000,
    observacoes: '12 splits para a loja do setor Bueno. Chegou pelo webchat do site.',
    criadoEm: diasAtras(149),
    fechadoEm: diasAtras(121),
  },
});

/* -- 2. A ligacao do comercial -------------------------------------------- */

await prisma.call.create({
  data: {
    organizacaoId: ORG,
    idExterno: `demo-${Date.now()}-1`,
    direcao: 'SAINTE',
    status: 'COMPLETADA',
    numeroOrigem: '+556232112000',
    numeroDestino: contato.telefone,
    contatoId: contato.id,
    agenteId: comercial.id,
    filaId: filaGeral.id,
    iniciadoEm: diasAtras(140, 14),
    atendidoEm: diasAtras(140, 14),
    encerradoEm: diasAtras(140, 15),
    duracao: 823,
  },
});

/* -- 3. A venda que fechou ------------------------------------------------ */

const ganha = await prisma.opportunity.create({
  data: {
    organizacaoId: ORG,
    titulo: 'Climatizacao da loja Setor Bueno — 12 splits',
    contaId: conta.id,
    funilId: funil.id,
    estagioId: fechamento.id,
    responsavelId: comercial.id,
    valor: 86400,
    status: 'GANHA',
    criadoEm: diasAtras(145),
    fechadoEm: diasAtras(121),
  },
});

/* -- 4. Instalacao pelo WhatsApp, com pesquisa respondida ------------------ */

const inicioInstalacao = diasAtras(112);
const conversaInstalacao = await prisma.conversation.create({
  data: {
    organizacaoId: ORG,
    canal: 'WHATSAPP',
    status: 'FINALIZADO',
    assunto: 'Agendamento da instalacao',
    contatoId: contato.id,
    filaId: filaSuporte.id,
    agenteId: agente.id,
    criadoEm: inicioInstalacao,
    ultimaMensagemEm: diasAtras(110, 16),
    finalizadoEm: diasAtras(110, 16),
  },
});
await falar(conversaInstalacao.id, inicioInstalacao, [
  ['CLIENTE', 'Podem instalar na quinta? A loja abre dia 20.', 0],
  ['AGENTE', 'Consigo quinta as 8h com dois tecnicos. Fecho assim?', 30],
  ['CLIENTE', 'Fecha!', 45],
  ['AGENTE', 'Instalacao concluida, Marcos. Qualquer coisa e so chamar por aqui.', 2880],
]);
await prisma.survey.create({
  data: {
    organizacaoId: ORG,
    conversaId: conversaInstalacao.id,
    tipo: 'CSAT',
    nota: 5,
    comentario: 'Equipe pontual e deixou tudo limpo. Recomendo.',
    token: `demo-csat-${Date.now()}`,
    enviadoEm: diasAtras(110, 17),
    entregueEm: diasAtras(110, 17),
    respondidoEm: diasAtras(109, 9),
  },
});

/* -- 5. Assistencia tecnica: um protocolo resolvido, um em aberto ---------- */

async function proximoNumero() {
  const [linha] = await prisma.$queryRawUnsafe(
    `UPDATE "organizacoes" SET "proximo_protocolo" = "proximo_protocolo" + 1 WHERE id = $1 RETURNING "proximo_protocolo" - 1 AS numero`,
    ORG,
  );
  return Number(linha.numero);
}

const resolvido = await prisma.ticket.create({
  data: {
    organizacaoId: ORG,
    numero: await proximoNumero(),
    titulo: 'Ruido na unidade externa do acougue',
    descricao: 'Cliente relatou ruido metalico intermitente na condensadora do acougue.',
    status: 'RESOLVIDO',
    prioridade: 'NORMAL',
    contatoId: contato.id,
    contaId: conta.id,
    filaId: filaSuporte.id,
    responsavelId: agente.id,
    criadoEm: diasAtras(64),
    resolvidoEm: diasAtras(61, 15),
  },
});
await prisma.ticketComment.create({
  data: {
    ticketId: resolvido.id,
    autorId: agente.id,
    conteudo: 'Helice da condensadora reapertada e balanceada. Cliente confirmou que parou.',
    interno: false,
    criadoEm: diasAtras(61, 15),
  },
});

const aberto = await prisma.ticket.create({
  data: {
    organizacaoId: ORG,
    numero: await proximoNumero(),
    titulo: 'Split da padaria nao esta gelando',
    descricao: 'Desde segunda o split da padaria sopra ar quente. Ambiente com forno, prioridade alta.',
    status: 'EM_ANDAMENTO',
    prioridade: 'ALTA',
    contatoId: contato.id,
    contaId: conta.id,
    filaId: filaSuporte.id,
    responsavelId: agente.id,
    prazoSla: diasAtras(-1, 18),
    criadoEm: diasAtras(3, 8),
  },
});
await prisma.ticketComment.create({
  data: {
    ticketId: aberto.id,
    autorId: agente.id,
    conteudo: 'Tecnico passou por telefone: provavel perda de carga. Visita agendada.',
    interno: true,
    criadoEm: diasAtras(2, 9),
  },
});

/* -- 6. Conversa aberta agora, para a fila ter movimento ------------------- */

const inicioHoje = diasAtras(0, 9);
const emAndamento = await prisma.conversation.create({
  data: {
    organizacaoId: ORG,
    canal: 'WHATSAPP',
    status: 'EM_ATENDIMENTO',
    assunto: 'Retorno sobre a visita tecnica',
    contatoId: contato.id,
    filaId: filaSuporte.id,
    agenteId: agente.id,
    criadoEm: inicioHoje,
    atribuidoEm: inicioHoje,
    ultimaMensagemEm: new Date(inicioHoje.getTime() + 8 * 60000),
  },
});
await falar(emAndamento.id, inicioHoje, [
  ['CLIENTE', 'Bom dia, o tecnico vem hoje mesmo? A padaria esta insuportavel.', 0],
  ['AGENTE', 'Bom dia! Esta agendado para hoje a tarde, entre 13h e 16h.', 8],
]);

/* -- 7. Atividades: uma concluida, tres em aberto -------------------------- */

await prisma.activity.createMany({
  data: [
    {
      organizacaoId: ORG,
      tipo: 'VISITA',
      titulo: 'Visita tecnica — split da padaria',
      descricao: 'Levar manifold e cilindro de R410A.',
      prazo: diasAtras(0, 13),
      responsavelId: agente.id,
      criadoPorId: agente.id,
      contatoId: contato.id,
      contaId: conta.id,
      protocoloId: aberto.id,
      criadoEm: diasAtras(2, 9),
    },
    {
      organizacaoId: ORG,
      tipo: 'LIGACAO',
      titulo: 'Confirmar recebimento da nota fiscal',
      prazo: diasAtras(118),
      concluidoEm: diasAtras(118, 15),
      responsavelId: comercial.id,
      criadoPorId: comercial.id,
      contatoId: contato.id,
      contaId: conta.id,
      criadoEm: diasAtras(119),
    },
    {
      organizacaoId: ORG,
      tipo: 'PROPOSTA',
      titulo: 'Enviar proposta de manutencao preventiva anual',
      descricao: 'Contrato de 12 visitas. Base: 14 equipamentos instalados.',
      prazo: diasAtras(-4, 17),
      responsavelId: comercial.id,
      criadoPorId: comercial.id,
      contatoId: contato.id,
      contaId: conta.id,
      criadoEm: diasAtras(5),
    },
    {
      organizacaoId: ORG,
      tipo: 'NOTA',
      titulo: 'Cliente pediu para falar sempre pelo WhatsApp',
      descricao: 'Nao gosta de ligacao no horario da manha, loja cheia.',
      responsavelId: comercial.id,
      criadoPorId: agente.id,
      contatoId: contato.id,
      criadoEm: diasAtras(100),
    },
  ],
});

/* -- 8. Oportunidade em aberto: o proximo negocio -------------------------- */

await prisma.opportunity.create({
  data: {
    organizacaoId: ORG,
    titulo: 'Contrato de manutencao preventiva — 14 equipamentos',
    contaId: conta.id,
    funilId: funil.id,
    estagioId: negociacao.id,
    responsavelId: comercial.id,
    valor: 21600,
    status: 'ABERTA',
    previsaoFechamento: diasAtras(-20),
    criadoEm: diasAtras(5),
  },
});

console.log(`\ncliente:    ${conta.nome}`);
console.log(`contato:    ${contato.nome}`);
console.log(`\nficha do contato:  http://localhost:5173/contatos/${contato.id}`);
console.log(`ficha do cliente:  http://localhost:5173/clientes/${conta.id}`);
console.log(`oportunidade:      http://localhost:5173/oportunidades/${ganha.id}`);
console.log(`protocolos:        #${resolvido.numero} resolvido, #${aberto.numero} em andamento`);
console.log(`\nlogins para comparar o escopo do 1.2:`);
console.log(`  comercial@plataforma.local / Comer@123   COMERCIAL, dono da carteira`);
console.log(`  gestor@plataforma.local    / Gestor@123  GESTOR do comercial`);
console.log(`  admin@plataforma.local                   ADMIN, ve tudo`);
console.log(`  agente1@plataforma.local                 AGENTE, ve por vinculo operacional\n`);

await prisma.$disconnect();
