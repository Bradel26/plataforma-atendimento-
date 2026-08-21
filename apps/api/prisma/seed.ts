import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@plataforma.local';
const ADMIN_SENHA = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

/** Usuarios de demonstracao — um por perfil, para validar as permissoes da Fase 0. */
const usuarios: Array<{ nome: string; email: string; senha: string; perfil: Role }> = [
  { nome: 'Administrador', email: ADMIN_EMAIL, senha: ADMIN_SENHA, perfil: 'ADMIN' },
  { nome: 'Supervisor Demo', email: 'supervisor@plataforma.local', senha: 'Super@123', perfil: 'SUPERVISOR' },
  { nome: 'Agente Um', email: 'agente1@plataforma.local', senha: 'Agente@123', perfil: 'AGENTE' },
  { nome: 'Agente Dois', email: 'agente2@plataforma.local', senha: 'Agente@123', perfil: 'AGENTE' },
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

  console.log('Seed concluido.');
  console.log(`  admin:      ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
  console.log('  supervisor: supervisor@plataforma.local / Super@123');
  console.log('  agente:     agente1@plataforma.local / Agente@123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
