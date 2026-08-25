import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

const PRODUCAO = process.env.NODE_ENV === 'production';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@plataforma.local';
const ADMIN_SENHA = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

/**
 * Em producao o seed nao inventa credencial. Senha fraca sobrevive a implantacao
 * porque ninguem lembra de trocar depois — entao aqui ela nem chega a existir.
 * Gere o arquivo de ambiente com `npm run gerar:segredos`.
 */
if (PRODUCAO) {
  const problemas = [];
  if (!process.env.SEED_ADMIN_PASSWORD) problemas.push('SEED_ADMIN_PASSWORD nao esta definida');
  else if (process.env.SEED_ADMIN_PASSWORD === 'Admin@123') problemas.push('SEED_ADMIN_PASSWORD ainda e a senha de exemplo');
  else if (process.env.SEED_ADMIN_PASSWORD.length < 12) problemas.push('SEED_ADMIN_PASSWORD tem menos de 12 caracteres');
  if (!process.env.SEED_ADMIN_EMAIL) problemas.push('SEED_ADMIN_EMAIL nao esta definida');
  else if (process.env.SEED_ADMIN_EMAIL.endsWith('@plataforma.local')) problemas.push('SEED_ADMIN_EMAIL e o dominio de exemplo');

  if (problemas.length > 0) {
    console.error('Seed de producao recusado:');
    for (const p of problemas) console.error(`  - ${p}`);
    console.error('\nGere um ambiente valido com: npm run gerar:segredos');
    process.exit(1);
  }
}

/**
 * Usuarios. Em producao existe apenas o admin: supervisor e agentes de
 * demonstracao teriam senha conhecida, e senha conhecida em producao e porta.
 */
const usuarios: Array<{ nome: string; email: string; senha: string; perfil: Role }> = [
  { nome: 'Administrador', email: ADMIN_EMAIL, senha: ADMIN_SENHA, perfil: 'ADMIN' },
  ...(PRODUCAO
    ? []
    : [
        { nome: 'Supervisor Demo', email: 'supervisor@plataforma.local', senha: 'Super@123', perfil: 'SUPERVISOR' as Role },
        { nome: 'Agente Um', email: 'agente1@plataforma.local', senha: 'Agente@123', perfil: 'AGENTE' as Role },
        { nome: 'Agente Dois', email: 'agente2@plataforma.local', senha: 'Agente@123', perfil: 'AGENTE' as Role },
      ]),
];

async function main() {
  await prisma.branding.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } });

  for (const u of usuarios) {
    const email = u.email.toLowerCase();
    await prisma.user.upsert({
      where: { email },
      update: { nome: u.nome, perfil: u.perfil, ativo: true },
      create: { nome: u.nome, email, perfil: u.perfil, senhaHash: await bcrypt.hash(u.senha, 10) },
    });
  }

  const filas = [
    { nome: 'Atendimento Geral', descricao: 'Fila padrao do Webchat', canalPadrao: 'WEBCHAT' as const },
    { nome: 'Suporte Tecnico', descricao: 'Chamados tecnicos', canalPadrao: 'WEBCHAT' as const },
  ];

  const agentes = await prisma.user.findMany({ where: { perfil: 'AGENTE' } });

  for (const f of filas) {
    const fila = await prisma.queue.upsert({ where: { nome: f.nome }, update: f, create: f });
    for (const agente of agentes) {
      await prisma.queueAgent.upsert({
        where: { filaId_usuarioId: { filaId: fila.id, usuarioId: agente.id } },
        update: {},
        create: { filaId: fila.id, usuarioId: agente.id },
      });
    }
  }

  await semearCrm();

  console.log('Seed concluido.');
  if (PRODUCAO) {
    console.log(`  admin: ${ADMIN_EMAIL} (senha veio de SEED_ADMIN_PASSWORD, nao e impressa aqui)`);
    console.log('  nenhum usuario de demonstracao foi criado');
  } else {
    console.log(`  admin:      ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
    console.log('  supervisor: supervisor@plataforma.local / Super@123');
    console.log('  agente:     agente1@plataforma.local / Agente@123');
  }
}

/**
 * CRM (Fase 2): um funil padrao e um catalogo de precos, necessarios para abrir
 * oportunidades. Idempotente — pode rodar de novo sem duplicar.
 */
async function semearCrm() {
  const estagios = [
    { nome: 'Prospeccao', probabilidade: 10 },
    { nome: 'Qualificacao', probabilidade: 25 },
    { nome: 'Proposta', probabilidade: 50 },
    { nome: 'Negociacao', probabilidade: 75 },
    { nome: 'Fechamento', probabilidade: 90 },
  ];

  const funil = await prisma.funnel.upsert({
    where: { nome: 'Funil de Vendas' },
    update: {},
    create: { nome: 'Funil de Vendas' },
  });

  for (const [indice, estagio] of estagios.entries()) {
    await prisma.funnelStage.upsert({
      where: { funilId_ordem: { funilId: funil.id, ordem: indice + 1 } },
      update: { nome: estagio.nome, probabilidade: estagio.probabilidade },
      create: { funilId: funil.id, ordem: indice + 1, ...estagio },
    });
  }

  const catalogo = await prisma.priceCatalog.upsert({
    where: { nome: 'Tabela Padrao' },
    update: {},
    create: { nome: 'Tabela Padrao', moeda: 'BRL' },
  });

  // Produto com preco e demonstracao: em producao o catalogo nasce vazio, para
  // ninguem abrir oportunidade com "Plano Basico R$ 299,90" que nao existe.
  const produtos = PRODUCAO
    ? []
    : [
        { sku: 'PLAT-BASIC', nome: 'Plataforma - Plano Basico', preco: 299.9 },
        { sku: 'PLAT-PRO', nome: 'Plataforma - Plano Pro', preco: 799.9 },
        { sku: 'AGENTE-ADD', nome: 'Licenca adicional de agente', preco: 89.9 },
      ];

  for (const p of produtos) {
    const produto = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { nome: p.nome },
      create: { sku: p.sku, nome: p.nome },
    });
    await prisma.catalogItem.upsert({
      where: { catalogoId_produtoId: { catalogoId: catalogo.id, produtoId: produto.id } },
      update: { preco: p.preco },
      create: { catalogoId: catalogo.id, produtoId: produto.id, preco: p.preco },
    });
  }

  console.log(`  funil: ${funil.nome} (${estagios.length} estagios) | catalogo: ${catalogo.nome}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
