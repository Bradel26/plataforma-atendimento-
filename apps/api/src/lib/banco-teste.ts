/**
 * Guarda dos testes de integracao com PostgreSQL REAL.
 *
 * Estes testes criam e apagam organizacoes e usuarios. Por isso so podem rodar
 * contra um banco local e descartavel — nunca contra o Neon compartilhado, que
 * tem dados reais e (ver memoria do projeto) ja foi sobrescrito por smoke tests.
 *
 * A guarda e restritiva de proposito: recusa tudo que nao for claramente um
 * banco de teste na propria maquina. Um falso "recusado" custa uma linha de
 * configuracao; um falso "aceito" apaga dados de verdade.
 */

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
/** Qualquer sinal de servico compartilhado/hospedado, mesmo que o host pareca local (tunel, proxy). */
const SERVICOS_COMPARTILHADOS = /(neon|upstash|supabase|amazonaws|azure|render\.com|railway|coolify|bradel)/i;
const NOME_DE_TESTE = /(teste|test|tmp|descart)/i;

export type ResultadoDaGuarda = { ok: true; url: string } | { ok: false; motivo: string };

export function validarUrlDeBancoDeTeste(url: string | undefined): ResultadoDaGuarda {
  if (!url) return { ok: false, motivo: 'TEST_DATABASE_URL nao esta definida' };

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: 'TEST_DATABASE_URL nao e uma URL valida' };
  }

  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    return { ok: false, motivo: 'TEST_DATABASE_URL precisa ser postgresql://' };
  }
  if (SERVICOS_COMPARTILHADOS.test(url)) {
    return { ok: false, motivo: 'a URL parece apontar para um servico compartilhado ou hospedado' };
  }
  if (!HOSTS_LOCAIS.has(u.hostname)) {
    return { ok: false, motivo: `o host "${u.hostname}" nao e local (so 127.0.0.1, localhost ou ::1)` };
  }
  // `?host=` troca o destino real por fora do host da URL (socket/endereco alternativo).
  if (u.searchParams.has('host') || u.searchParams.has('hostaddr')) {
    return { ok: false, motivo: 'parametros host/hostaddr na query nao sao permitidos' };
  }
  const banco = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!NOME_DE_TESTE.test(banco)) {
    return { ok: false, motivo: `o nome do banco "${banco}" precisa conter teste, test, tmp ou descart` };
  }

  return { ok: true, url };
}
