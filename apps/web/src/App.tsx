import type { ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NAV } from './components/layout/nav';
import { useAuth } from './features/auth/AuthProvider';
import { AtendimentoPage } from './pages/AtendimentoPage';
import { AvaliacaoPage } from './pages/AvaliacaoPage';
import { CampanhasPage } from './pages/CampanhasPage';
import { DashboardsPage } from './pages/DashboardsPage';
import { EscalasPage } from './pages/EscalasPage';
import { GestaoPage } from './pages/GestaoPage';
import { LoginPage } from './pages/LoginPage';
import { MonitoramentoPage } from './pages/MonitoramentoPage';
import { RelatoriosPage } from './pages/RelatoriosPage';
import { WebchatPage } from './pages/WebchatPage';
import { ConfiguracoesPage } from './pages/configuracoes/ConfiguracoesPage';
import { CrmPage } from './pages/crm/CrmPage';
import { ProtocoloPage } from './pages/protocolo/ProtocoloPage';

/**
 * Pagina de cada rota do menu. Os perfis com acesso vivem em NAV, entao a mesma
 * regra filtra o menu e as rotas — digitar a URL na mao nao contorna a permissao.
 */
const PAGINAS: Record<string, ComponentType> = {
  '/dashboards': DashboardsPage,
  '/atendimento': AtendimentoPage,
  '/protocolo': ProtocoloPage,
  '/monitoramento': MonitoramentoPage,
  '/gestao': GestaoPage,
  '/campanhas': CampanhasPage,
  '/relatorios': RelatoriosPage,
  '/escalas': EscalasPage,
  '/crm': CrmPage,
  '/configuracoes': ConfiguracoesPage,
};

/** Rotas publicas: nao exigem sessao e existem logado ou nao. */
function RotasPublicas() {
  return (
    <>
      <Route path="/webchat" element={<WebchatPage />} />
      <Route path="/avaliacao/:token" element={<AvaliacaoPage />} />
    </>
  );
}

function AppRoutes() {
  const { usuario, carregando, temPerfil } = useAuth();

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">Carregando sessao...</div>
    );
  }

  if (!usuario) {
    return (
      <Routes>
        {RotasPublicas()}
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const permitidos = NAV.filter((item) => temPerfil(...item.perfis));
  const inicial = permitidos[0]?.rota ?? '/atendimento';

  return (
    <Routes>
      {RotasPublicas()}
      <Route path="/login" element={<Navigate to={inicial} replace />} />
      <Route element={<AppShell />}>
        {permitidos.map(({ rota }) => {
          const Pagina = PAGINAS[rota];
          return Pagina ? <Route key={rota} path={rota} element={<Pagina />} /> : null;
        })}
      </Route>
      {/* Rota fora do perfil cai no primeiro modulo permitido, nao numa tela vazia. */}
      <Route path="*" element={<Navigate to={inicial} replace />} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
