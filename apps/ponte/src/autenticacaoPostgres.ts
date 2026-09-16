import { BufferJSON, initAuthCreds, WAProto, type AuthenticationState, type SignalDataTypeMap } from '@whiskeysockets/baileys';
import { cifrar, decifrar } from './segredo.js';

/**
 * Onde o blob cifrado de uma sessao entra e sai. Interface, e nao a
 * implementacao Postgres direto: o teste de unidade usa um `Map` em memoria
 * (ver `autenticacaoPostgres.test.ts`), e a implementacao real
 * (`bancoDeSessaoPg`, em `banco.ts`) so entra em producao.
 */
export type BancoDeSessao = {
  obter(sessao: string): Promise<string | null>;
  salvar(sessao: string, dados: string): Promise<void>;
  apagar(sessao: string): Promise<void>;
};

/** O que vai persistido: creds + o mapa de chaves, tudo num blob so. */
type Persistido = {
  creds: ReturnType<typeof initAuthCreds>;
  /** `keys[categoria][id]` — mesmo formato do `SignalDataTypeMap`, so achatado num objeto. */
  keys: Record<string, Record<string, unknown>>;
};

/**
 * Equivalente a `useMultiFileAuthState`, mas guardando tudo numa linha do
 * Postgres em vez de um arquivo por chave.
 *
 * E deliberadamente mais simples que a versao da lib: um blob unico por sessao,
 * regravado inteiro a cada mudanca. Para o volume de chaves de uma conta
 * pessoal de WhatsApp isso e barato o bastante, e evita reimplementar o
 * esquema de arquivo-por-chave (com lock de arquivo e tudo) so trocando
 * "arquivo" por "linha".
 */
export async function criarAuthStatePersistido(
  nome: string,
  banco: BancoDeSessao,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const salvo = await banco.obter(nome);
  const decifrado = salvo ? decifrar(salvo) : '';

  let persistido: Persistido;
  if (decifrado) {
    try {
      persistido = JSON.parse(decifrado, BufferJSON.reviver) as Persistido;
    } catch {
      // Registro corrompido ou chave de cifra trocada: comeca do zero, como se
      // fosse sessao nova. Insistir com lixo so faria o Baileys quebrar mais
      // tarde, de um jeito mais dificil de diagnosticar.
      persistido = { creds: initAuthCreds(), keys: {} };
    }
  } else {
    persistido = { creds: initAuthCreds(), keys: {} };
  }

  const persistir = () => {
    const serializado = JSON.stringify(persistido, BufferJSON.replacer);
    return banco.salvar(nome, cifrar(serializado));
  };

  const state: AuthenticationState = {
    creds: persistido.creds,
    keys: {
      get: async (type, ids) => {
        const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        const categoria = persistido.keys[type] ?? {};
        for (const id of ids) {
          let valor = categoria[id];
          // Mesmo caso especial do `useMultiFileAuthState`: essas chaves saem
          // do JSON puro e precisam virar instancia de proto para o Baileys
          // aceitar (ele confere `instanceof`).
          if (type === 'app-state-sync-key' && valor) {
            valor = WAProto.Message.AppStateSyncKeyData.fromObject(valor as object);
          }
          if (valor !== undefined) data[id] = valor as SignalDataTypeMap[typeof type];
        }
        return data;
      },
      set: async (data) => {
        for (const categoria in data) {
          const porCategoria = data[categoria as keyof SignalDataTypeMap];
          if (!porCategoria) continue;
          persistido.keys[categoria] ??= {};
          for (const id in porCategoria) {
            const valor = porCategoria[id];
            if (valor === null || valor === undefined) {
              delete persistido.keys[categoria]![id];
            } else {
              persistido.keys[categoria]![id] = valor;
            }
          }
        }
        await persistir();
      },
    },
  };

  return {
    state,
    saveCreds: () => persistir(),
  };
}
