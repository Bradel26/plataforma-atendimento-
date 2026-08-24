import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NAV } from './components/layout/nav';
import { useAuth } from './features/auth/AuthProvider';
import { AtendimentoPage } from './pages/AtendimentoPage';
import { CrmPage } from './pages/crm/CrmPage';
import { ProtocoloPage } from './pages/protocolo/ProtocoloPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { WebchatPage } from './pages/WebchatPage';
import { ConfiguracoesPage } from './pages/configuracoes/ConfiguracoesPage';

/** Descricao de cada modulo ainda nao implementado, exibida no placeholder. */
const DESCRICOES: Record<string, string> = {
  '/dashboards': 'Indicadores gerais de chamadas, atendimentos e filas em tempo real.',
  '/monitoramento': 'Acompanhamento dos agentes em tempo real, com status e produtividade.',
  '/gestao': 'Painel do supervisor: metricas de qualidade, monitoria e acompanhamento da equipe.',
  '/campanhas': 'Discagem ativa e campanhas em massa.',
  '/relatorios': 'Relatorios detalhados com exportacao para Excel e PDF.',
  '/escalas': 'Jornada de trabalho, escalas e pausas dos agentes.',
};

/** Rotas ja implementadas — as demais caem no placeholder da fase. */
const PRONTOS = ['/configuracoes', '/atendimento', '/crm', '/protocolo'];

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
        <Route path="/webchat" element={<WebchatPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const permitidos = NAV.filter((item) => temPerfil(...item.perfis));
  const inicial = permitidos[0]?.rota ?? '/atendimento';

  return (
    <Routes>
      <Route path="/webchat" element={<WebchatPage />} />
      <Route path="/login" element={<Navigate to={inicial} replace />} />
      <Route element={<AppShell />}>
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/atendimento" element={<AtendimentoPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/protocolo" element={<ProtocoloPage />} />
        {permitidos
          .filter((item) => !PRONTOS.includes(item.rota))
          .map(({ rota, label, fase }) => (
            <Route
              key={rota}
              path={rota}
              element={<PlaceholderPage titulo={label} fase={fase} descricao={DESCRICOES[rota] ?? ''} />}
            />
          ))}
      </Route>
      <Route path="*" element={<Navigate to={inicial} replace />} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
