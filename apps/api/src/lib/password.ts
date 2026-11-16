import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * Hash descartavel, com o MESMO custo dos reais. Serve para gastar o mesmo tempo
 * de bcrypt quando o e-mail nao existe: sem isso, "e-mail inexistente" responde em
 * poucos milissegundos e "senha errada" em dezenas, e a diferenca de tempo diz a
 * quem mede se a conta existe.
 */
const HASH_DESCARTAVEL = bcrypt.hashSync('descartavel-sem-uso', ROUNDS);
export const gastarTempoDeVerificacao = (plain: string) => bcrypt.compare(plain, HASH_DESCARTAVEL);
