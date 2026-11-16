import { prisma } from '../../lib/prisma';
import { AppError, unauthorized } from '../../lib/errors';
import { gastarTempoDeVerificacao, hashPassword, verifyPassword } from '../../lib/password';
import { issueRefreshToken, signAccessToken } from '../../lib/tokens';
import { registrarPresenca } from '../metrics/metrics.service';
import { toPublicUser } from '../users/users.serializer';
import { modulosPermitidos } from '../../lib/modulos';
import { comOrganizacao } from '../../lib/tenant';
import { acessoDoUsuario } from '../esteira/acesso';
import type { AlterarSenhaInicialInput, LoginInput } from './auth.schemas';
import { garantirNaoBloqueado, limparFalhas, registrarFalha } from './tentativas';

const CREDENCIAIS_INVALIDAS = new AppError(401, 'INVALID_CREDENTIALS', 'Email ou senha incorretos');

type UsuarioDoLogin = Awaited<ReturnType<typeof prisma.user.findFirstOrThrow>>;

/**
 * Acha a conta cujo e-mail E senha conferem.
 *
 * O e-mail e unico POR organizacao, entao o mesmo e-mail pode existir em mais de
 * uma. Antes, a ambiguidade era anunciada (409) ANTES de conferir a senha: qualquer
 * pessoa, sem credencial nenhuma, descobria quais e-mails existem em varias
 * organizacoes. Agora a senha e conferida em todos os candidatos primeiro:
 *
 *   - nenhum confere (ou nao ha conta) -> a mesma resposta generica;
 *   - exatamente um confere            -> e ele;
 *   - mais de um confere               -> ai sim a ambiguidade, que so chega a
 *                                         quem ja provou conhecer a senha.
 *
 * `take: 2` de proposito: um terceiro candidato nao muda a resposta.
 * Quando nao ha conta, gasta-se o mesmo tempo de bcrypt de uma senha errada, para
 * o tempo de resposta nao denunciar se o e-mail existe.
 */
async function autenticarPorSenha(email: string, senha: string): Promise<UsuarioDoLogin | null> {
  const candidatos = await prisma.user.findMany({ where: { email: email.toLowerCase() }, take: 2 });
  if (candidatos.length === 0) {
    await gastarTempoDeVerificacao(senha);
    return null;
  }

  const conferem: UsuarioDoLogin[] = [];
  for (const candidato of candidatos) {
    if (await verifyPassword(senha, candidato.senhaHash)) conferem.push(candidato);
  }
  if (conferem.length > 1) {
    throw new AppError(
      409,
      'ORGANIZACAO_AMBIGUA',
      'Este e-mail existe em mais de uma organização. Informe qual delas.',
    );
  }
  return conferem[0] ?? null;
}

export async function login({ email, senha }: LoginInput) {
  await garantirNaoBloqueado(email);

  const user = await autenticarPorSenha(email, senha);
  if (!user) {
    // Conta o erro mesmo sem usuario: sem isso, varrer emails sai de graca.
    await registrarFalha(email);
    throw CREDENCIAIS_INVALIDAS;
  }
  if (!user.ativo) throw new AppError(403, 'USER_INACTIVE', 'Usuário desativado — procure um administrador');
  if (user.senhaPendente) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Altere sua senha temporária para continuar');
  }

  await limparFalhas(email);

  const atualizado = await prisma.user.update({
    where: { id: user.id },
    data: {
      ultimoLogin: new Date(),
      // Evita a janela entre o login e o primeiro heartbeat do front: sem isto,
      // o job de inatividade (ver `encerrarPresencasInativas`) poderia marcar
      // como offline alguem que acabou de entrar, antes da primeira ping chegar.
      ultimoHeartbeat: new Date(),
      status: user.status === 'OFFLINE' ? 'DISPONIVEL' : user.status,
    },
  });
  // O login abre a jornada: sem este registro o relatorio de horas comecaria
  // apenas na primeira troca manual de status. `forcarNovoIntervalo` garante que
  // "no status" no Monitoramento reflita este login, e nao um intervalo aberto
  // ha dias por alguem que fechou a aba sem clicar em "Sair".
  await registrarPresenca(atualizado.id, atualizado.status, { forcarNovoIntervalo: true });

  return buildSession(atualizado);
}

/** A troca da senha temporaria ocorre antes de emitir qualquer sessao autenticada. */
export async function alterarSenhaInicial({ email, senhaAtual, novaSenha }: AlterarSenhaInicialInput) {
  await garantirNaoBloqueado(email);
  const user = await autenticarPorSenha(email, senhaAtual);
  if (!user) {
    await registrarFalha(email);
    throw CREDENCIAIS_INVALIDAS;
  }
  if (!user.ativo) throw new AppError(403, 'USER_INACTIVE', 'Usuário desativado — procure um administrador');
  if (!user.senhaPendente) throw new AppError(409, 'PASSWORD_CHANGE_NOT_REQUIRED', 'A senha desta conta já foi alterada.');

  await prisma.user.update({
    where: { id: user.id },
    data: { senhaHash: await hashPassword(novaSenha), senhaPendente: false },
  });
  await limparFalhas(email);
}

/** Emite um novo par de tokens a partir de um refresh token ja validado. */
export async function sessionForUserId(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.ativo) throw unauthorized('Sessão inválida, faca login novamente');
  return buildSession(user);
}

async function buildSession(user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>) {
  const accessToken = signAccessToken({
    sub: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    org: user.organizacaoId,
  });
  const refreshToken = await issueRefreshToken(user.id, user.organizacaoId);
  const modulosPermitidosSessao = await comOrganizacao(user.organizacaoId, () => modulosPermitidos(user.perfil));
  // Mesmo campo de `/auth/me`: o front decide menu e rotas da Esteira por ele.
  const operacoes = await comOrganizacao(user.organizacaoId, () => acessoDoUsuario(user.id, user.perfil));
  return {
    accessToken,
    refreshToken,
    usuario: { ...toPublicUser(user), modulosPermitidos: [...modulosPermitidosSessao], operacoes },
  };
}

export async function marcarOffline(userId: string) {
  await prisma.user
    .update({ where: { id: userId }, data: { status: 'OFFLINE' } })
    .then(() => registrarPresenca(userId, 'OFFLINE'))
    .catch(() => undefined);
}
