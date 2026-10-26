import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_EXPIRADA, api, loginRequest, refreshRequest, setAccessToken } from '../../lib/api';
import type { AcessoOperacoes, AgentStatus, Perfil, Usuario } from '../../lib/types';
import { operacoesPermitidas } from '../../pages/esteira/estadoEsteira';

type AuthContextValue = {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  alterarStatus: (status: AgentStatus) => Promise<void>;
  temPerfil: (...perfis: Perfil[]) => boolean;
  temModulo: (modulo: string) => boolean;
  /** Operações da esteira acessíveis e o nível (vem da sessão; `/auth/me` se faltar). */
  operacoes: AcessoOperacoes;
  /** Módulo Esteira liberado E alguma operação acessível: decide menu e rotas da Esteira. */
  temEsteira: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Restaura a sessao a partir do cookie de refresh (sobrevive a recarregar a pagina).
  useEffect(() => {
    let ativo = true;
    refreshRequest()
      .then((sessao) => {
        if (!ativo) return;
        if (sessao) {
          setAccessToken(sessao.accessToken);
          setUsuario(sessao.usuario);
        }
      })
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    const aoExpirar = () => {
      setAccessToken(null);
      setUsuario(null);
    };
    window.addEventListener(AUTH_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(AUTH_EXPIRADA, aoExpirar);
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const sessao = await loginRequest(email, senha);
    setAccessToken(sessao.accessToken);
    setUsuario(sessao.usuario);
  }, []);

  const sair = useCallback(async () => {
    try {
      await api.post('/auth/sair');
    } finally {
      setAccessToken(null);
      setUsuario(null);
    }
  }, []);

  const alterarStatus = useCallback(async (status: AgentStatus) => {
    const { usuario: atualizado } = await api.patch<{ usuario: Usuario }>('/usuarios/me/status', { status });
    // A resposta de status não traz as operações: mantém as da sessão.
    setUsuario((atual) => ({ ...atualizado, operacoes: atualizado.operacoes ?? atual?.operacoes }));
  }, []);

  // Sessão sem `operacoes` (API anterior a este campo no login/refresh): busca em `/auth/me` uma vez.
  const faltamOperacoes = Boolean(usuario && usuario.operacoes === undefined);
  useEffect(() => {
    if (!faltamOperacoes) return;
    let ativo = true;
    api
      .get<{ usuario: Usuario }>('/auth/me')
      .then(({ usuario: me }) => ativo && setUsuario((atual) => (atual ? { ...atual, operacoes: me.operacoes ?? {} } : atual)))
      .catch(() => ativo && setUsuario((atual) => (atual ? { ...atual, operacoes: {} } : atual)));
    return () => {
      ativo = false;
    };
  }, [faltamOperacoes]);

  const temPerfil = useCallback(
    (...perfis: Perfil[]) => (usuario ? perfis.includes(usuario.perfil) : false),
    [usuario],
  );
  const temModulo = useCallback((modulo: string) => Boolean(usuario && (usuario.perfil === 'ADMIN' || (modulo !== 'configuracoes' && usuario.modulosPermitidos?.includes(modulo)))), [usuario]);

  /*
   * Heartbeat: enquanto a aba fica visivel, avisa o backend "ainda estou aqui"
   * a cada minuto. Sem isto, quem fecha a aba sem clicar em "Sair" (ou perde a
   * conexao) fica com o status antigo (ex.: Disponivel) travado no
   * Monitoramento para sempre — o job `encerrarPresencasInativas` do backend
   * usa este sinal para saber quando fechar a presenca sozinho.
   *
   * So enquanto visivel, e nao num intervalo fixo desde o login: aba minimizada
   * ou em segundo plano nao deve contar como "em uso".
   */
  useEffect(() => {
    if (!usuario) return;

    const pingar = () => {
      if (document.visibilityState === 'visible') void api.post('/usuarios/me/heartbeat').catch(() => undefined);
    };

    pingar();
    const intervalo = setInterval(pingar, 60_000);
    document.addEventListener('visibilitychange', pingar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', pingar);
    };
  }, [usuario]);

  const operacoes = useMemo<AcessoOperacoes>(() => usuario?.operacoes ?? {}, [usuario?.operacoes]);
  const temEsteira = temModulo('esteira') && operacoesPermitidas(operacoes).length > 0;

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, alterarStatus, temPerfil, temModulo, operacoes, temEsteira }),
    [usuario, carregando, entrar, sair, alterarStatus, temPerfil, temModulo, operacoes, temEsteira],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
