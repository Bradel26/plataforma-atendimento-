import { describe, expect, it } from 'vitest';
import { criarAuthStatePersistido, type BancoDeSessao } from './autenticacaoPostgres.js';

/**
 * Banco falso em memoria — nunca Postgres de verdade. `vitest.config.ts` e
 * explicito: teste de unidade nao depende de infraestrutura. `BancoDeSessao` e
 * uma interface injetavel exatamente para permitir isto.
 */
function bancoFake(): BancoDeSessao {
  const mapa = new Map<string, string>();
  return {
    async obter(sessao: string) {
      return mapa.get(sessao) ?? null;
    },
    async salvar(sessao: string, dados: string) {
      mapa.set(sessao, dados);
    },
    async apagar(sessao: string) {
      mapa.delete(sessao);
    },
  };
}

describe('sessao do Baileys persistida no Postgres', () => {
  it('sessao nova (banco vazio) nao lanca erro e devolve creds validas', async () => {
    const banco = bancoFake();
    const { state } = await criarAuthStatePersistido('nova', banco);

    expect(state.creds).toBeTruthy();
    expect(state.creds.noiseKey?.private).toBeInstanceOf(Buffer);
    expect(state.creds.registrationId).toBeTypeOf('number');
  });

  it('saveCreds persiste e reabrir a sessao com o mesmo banco recupera as creds (Buffers inclusive)', async () => {
    const banco = bancoFake();
    const primeira = await criarAuthStatePersistido('minha-sessao', banco);

    // Mutacao tipica do Baileys: mexe no objeto `creds` e chama saveCreds.
    primeira.state.creds.registered = true;
    await primeira.saveCreds();

    const segunda = await criarAuthStatePersistido('minha-sessao', banco);

    expect(segunda.state.creds.registered).toBe(true);
    expect(Buffer.from(segunda.state.creds.noiseKey.private)).toBeInstanceOf(Buffer);
    expect(Buffer.from(segunda.state.creds.noiseKey.private).equals(Buffer.from(primeira.state.creds.noiseKey.private))).toBe(
      true,
    );
  });

  it('keys.set seguido de keys.get no mesmo processo devolve o valor salvo', async () => {
    const banco = bancoFake();
    const { state } = await criarAuthStatePersistido('sessao-chaves', banco);

    const valor = { keyPair: { public: Buffer.from('pub'), private: Buffer.from('priv') }, keyId: 1 };
    await state.keys.set({ 'pre-key': { '1': valor as never } });

    const lido = await state.keys.get('pre-key', ['1']);
    expect(lido['1']).toEqual(valor);
  });

  it('reabrir a sessao depois de um keys.set recupera as chaves salvas', async () => {
    const banco = bancoFake();
    const primeira = await criarAuthStatePersistido('sessao-persistente', banco);

    const valor = { keyPair: { public: Buffer.from('pub2'), private: Buffer.from('priv2') }, keyId: 2 };
    await primeira.state.keys.set({ 'pre-key': { '9': valor as never } });

    const segunda = await criarAuthStatePersistido('sessao-persistente', banco);
    const lido = await segunda.state.keys.get('pre-key', ['9']);

    expect(lido['9']).toEqual(valor);
  });
});
