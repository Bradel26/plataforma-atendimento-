import { Pool } from 'pg';
import { config } from './config.js';
import type { BancoDeSessao } from './autenticacaoPostgres.js';

/**
 * Conexao com o mesmo Postgres da plataforma, so para a tabela
 * `ponte_sessoes_auth`.
 *
 * `pg` puro, e nao Prisma: gerar (e manter atualizado) um client Prisma
 * inteiro num segundo pacote so para uma tabela de duas colunas seria mais
 * trabalho que o problema pede.
 */
export const pool = new Pool({ connectionString: config.bancoUrl });

/** Implementacao real de `BancoDeSessao`, usada por `sessao.ts` em producao. */
export const bancoDeSessaoPg: BancoDeSessao = {
  async obter(sessao) {
    const r = await pool.query<{ dados: string }>('SELECT dados FROM ponte_sessoes_auth WHERE sessao = $1', [
      sessao,
    ]);
    return r.rows[0]?.dados ?? null;
  },

  async salvar(sessao, dados) {
    await pool.query(
      `INSERT INTO ponte_sessoes_auth (sessao, dados, atualizado_em)
       VALUES ($1, $2, now())
       ON CONFLICT (sessao) DO UPDATE SET dados = $2, atualizado_em = now()`,
      [sessao, dados],
    );
  },

  async apagar(sessao) {
    await pool.query('DELETE FROM ponte_sessoes_auth WHERE sessao = $1', [sessao]);
  },
};
