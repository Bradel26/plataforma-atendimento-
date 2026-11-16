import { prisma } from '../../lib/prisma';
import { AppError, unauthorized } from '../../lib/errors';
import { gastarTempoDeVerificacao, hashPassword, verifyPassword } from '../../lib/password';
import { consumirRefresh, issueRefreshToken, lerRefreshToken, signAccessToken } from '../../lib/tokens';
import { invalidarSessaoLocal, SESSAO_INDISPONIVEL } from '../../lib/sessao';
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

  // Os tokens saem com a versao e o perfil do momento em que a SENHA foi conferida
  // (`user`), nao com os da linha devolvida pelo update: se um reset de senha ou
  // uma mudanca de perfil acontecer entre a conferencia e o update, `atualizado`
  // ja traz a versao nova e assinar com ela daria sessao valida a quem usou a
  // senha antiga. Com a versao do snapshot o token nasce velho e e recusado no
  // primeiro uso.
  return buildSession({ ...atualizado, sessaoVersao: user.sessaoVersao, perfil: user.perfil });
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
    // Troca de senha encerra qualquer sessao anterior (mesma regra do reset por ADMIN).
    data: { senhaHash: await hashPassword(novaSenha), senhaPendente: false, sessaoVersao: { increment: 1 } },
  });
  invalidarSessaoLocal(user.organizacaoId, user.id);
  await limparFalhas(email);
}

/**
 * Falha do banco nao e credencial invalida. Erro de dominio (AppError) segue como
 * esta; qualquer outro vira 503, para o cliente nao tratar como 401.
 */
async function daBase<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof AppError) throw erro;
    console.error('[auth] falha do banco na renovação:', erro instanceof Error ? erro.message : erro);
    throw SESSAO_INDISPONIVEL();
  }
}

/**
 * Renova a sessao a partir do cookie de refresh.
 *
 * A ORDEM importa: ler -> validar no banco -> consumir -> emitir. O token so e
 * gasto depois que o banco respondeu; se o banco falhar, responde 503 e o cookie
 * continua valido para uma nova tentativa. Conta desativada ou versao de sessao
 * diferente (perfil/senha mudaram) responde 401, e o token novo nasce com a
 * versao e o perfil de agora.
 */
export async function renovarSessao(token: string | undefined) {
  const lido = await lerRefreshToken(token);

  return comOrganizacao(lido.organizacaoId, async () => {
    const user = await daBase(() => prisma.user.findUnique({ where: { id: lido.userId } }));
    if (!user || !user.ativo) throw unauthorized('Sessão inválida, faca login novamente');
    // Refresh legado, sem `sv`, vale como 0 — ver `lib/sessao.ts` para a justificativa.
    if ((lido.sv ?? 0) !== user.sessaoVersao) throw unauthorized('Sessão encerrada, faça login novamente');

    const modulos = await daBase(() => modulosPermitidos(user.perfil));
    // Uso unico: outra renovacao com o mesmo cookie pode ter chegado antes.
    if (!(await consumirRefresh(lido.jti))) throw unauthorized('Sessão expirada, faca login novamente');

    return montarSessao(user, modulos);
  });
}

type UsuarioDaSessao = Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>;

async function buildSession(user: UsuarioDaSessao) {
  const modulos = await comOrganizacao(user.organizacaoId, () => modulosPermitidos(user.perfil));
  return montarSessao(user, modulos);
}

/** Todo token sai com a versao de sessao ATUAL da pessoa (`sv`), inclusive na renovacao. */
async function montarSessao(user: UsuarioDaSessao, modulos: Set<string>) {
  const accessToken = signAccessToken({
    sub: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    org: user.organizacaoId,
    sv: user.sessaoVersao,
  });
  const refreshToken = await issueRefreshToken(user.id, user.organizacaoId, user.sessaoVersao);
  // Mesmo campo de `/auth/me`: o front decide menu e rotas da Esteira por ele.
  const operacoes = await comOrganizacao(user.organizacaoId, () => acessoDoUsuario(user.id, user.perfil));
  return { accessToken, refreshToken, usuario: { ...toPublicUser(user), modulosPermitidos: [...modulos], operacoes } };
}

export async function marcarOffline(userId: string) {
  await prisma.user
    .update({ where: { id: userId }, data: { status: 'OFFLINE' } })
    .then(() => registrarPresenca(userId, 'OFFLINE'))
    .catch(() => undefined);
}
