import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_EXPIRADA, api, loginRequest, refreshRequest, setAccessToken } from '../../lib/api';
import type { AgentStatus, Perfil, Usuario } from '../../lib/types';

type AuthContextValue = {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  alterarStatus: (status: AgentStatus) => Promise<void>;
  temPerfil: (...perfis: Perfil[]) => boolean;
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
    setUsuario(atualizado);
  }, []);

  const temPerfil = useCallback(
    (...perfis: Perfil[]) => (usuario ? perfis.includes(usuario.perfil) : false),
    [usuario],
  );

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, alterarStatus, temPerfil }),
    [usuario, carregando, entrar, sair, alterarStatus, temPerfil],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
