/**
 * Cria (ou promove) um usuario ADMIN da plataforma.
 *
 * O seed so cria o admin de `SEED_ADMIN_EMAIL` e, em producao, se recusa a
 * inventar credencial. Quando a senha daquele admin se perde, ou quando outra
 * pessoa precisa de acesso administrativo, nao havia caminho: nao existe rota
 * de "esqueci minha senha" e `/api/usuarios` exige uma sessao ADMIN que
 * justamente ninguem tem. Este comando e esse caminho.
 *
 * Idempotente: e-mail ja existente tem o perfil elevado a ADMIN, a senha
 * redefinida e a conta reativada — nao duplica usuario (o unique e
 * [organizacaoId, email]).
 *
 * Uso:
 *   npm run admin:criar -w @plataforma/api -- --email pessoa@empresa.com.br
 *     (simulacao: diz o que faria, nao escreve nada)
 *
 *   npm run admin:criar -w @plataforma/api -- --email pessoa@empresa.com.br --executar
 *     (aplica; senha forte sorteada e impressa UMA vez)
 *
 *   ADMIN_SENHA='...' npm run admin:criar -w @plataforma/api -- --email ... --executar
 *     (define a senha em vez de sortear; minimo 12 caracteres)
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { ORGANIZACAO_INICIAL, comOrganizacao } from '../lib/tenant';
import { redis } from '../lib/redis';

// Aceita a flag ou a variavel: 'npm run -- --flag' nao atravessa duas camadas
// de workspace, e o comando precisa funcionar dos dois jeitos.
const executar = process.argv.includes('--executar') || process.env.ADMIN_EXECUTAR === 'true';

function argumento(nome: string): string | null {
  const prefixo = `--${nome}=`;
  const colado = process.argv.find((a) => a.startsWith(prefixo));
  if (colado) return colado.slice(prefixo.length);
  const i = process.argv.indexOf(`--${nome}`);
  const seguinte = i >= 0 ? process.argv[i + 1] : undefined;
  return seguinte && !seguinte.startsWith('--') ? seguinte : null;
}

/**
 * Senha sorteada em base64url: 32 bytes de entropia real. O admin troca depois
 * pela tela de perfil — o que importa aqui e que o valor nunca seja adivinhavel
 * nem reaproveitado de outro ambiente.
 */
function sortearSenha(): string {
  return randomBytes(24).toString('base64url');
}

async function main() {
  const email = (argumento('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const nome = argumento('nome') ?? process.env.ADMIN_NOME ?? 'Administrador';

  if (!email || !email.includes('@')) {
    console.error('Informe o e-mail: --email pessoa@empresa.com.br');
    process.exitCode = 1;
    return;
  }

  const senhaInformada = process.env.ADMIN_SENHA ?? null;
  if (senhaInformada && senhaInformada.length < 12) {
    console.error('ADMIN_SENHA tem menos de 12 caracteres.');
    process.exitCode = 1;
    return;
  }

  const existente = await prisma.user.findUnique({
    where: { organizacaoId_email: { organizacaoId: ORGANIZACAO_INICIAL, email } },
    select: { id: true, nome: true, perfil: true, ativo: true },
  });

  if (!executar) {
    console.log('Simulacao — nada foi alterado.');
    console.log(`  organizacao: ${ORGANIZACAO_INICIAL}`);
    console.log(`  e-mail:      ${email}`);
    if (existente) {
      console.log(`  ja existe:   ${existente.nome} (perfil ${existente.perfil}, ativo=${existente.ativo})`);
      console.log('  faria:       elevar a ADMIN, redefinir a senha e reativar a conta');
    } else {
      console.log(`  nao existe`);
      console.log(`  faria:       criar "${nome}" com perfil ADMIN`);
    }
    console.log('');
    console.log('Rode de novo com --executar para aplicar.');
    return;
  }

  const senha = senhaInformada ?? sortearSenha();
  const senhaHash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.user.upsert({
    where: { organizacaoId_email: { organizacaoId: ORGANIZACAO_INICIAL, email } },
    update: { perfil: 'ADMIN', senhaHash, ativo: true },
    create: { nome, email, perfil: 'ADMIN', senhaHash },
    select: { id: true, nome: true, email: true },
  });

  console.log(existente ? 'Usuario atualizado:' : 'Usuario criado:');
  console.log(`  id:     ${usuario.id}`);
  console.log(`  nome:   ${usuario.nome}`);
  console.log(`  e-mail: ${usuario.email}`);
  console.log(`  perfil: ADMIN`);
  console.log('');
  if (senhaInformada) {
    console.log('Senha: a que veio em ADMIN_SENHA.');
  } else {
    console.log(`Senha sorteada (anote agora, nao e recuperavel): ${senha}`);
  }
  console.log('Troque a senha no primeiro acesso, pela tela de perfil.');
}

// Mesma escolha do reaplicar-anonimizacao: roda na organizacao inicial. Com
// mais de uma organizacao, este comando passa a receber o slug como argumento.
void comOrganizacao(ORGANIZACAO_INICIAL, () => main()).finally(() =>
  Promise.allSettled([prisma.$disconnect(), redis.quit()]),
);
