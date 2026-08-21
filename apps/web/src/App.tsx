import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NAV } from './components/layout/nav';
import { useAuth } from './features/auth/AuthProvider';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ConfiguracoesPage } from './pages/configuracoes/ConfiguracoesPage';

/** Descricao de cada modulo ainda nao implementado, exibida no placeholder. */
const DESCRICOES: Record<string, string> = {
  '/dashboards': 'Indicadores gerais de chamadas, atendimentos e filas em tempo real.',
  '/atendimento': 'Painel central com lista de conversas (Em espera, Atribuido, Em atendimento, Finalizado) e chat ativo.',
  '/protocolo': 'Gestao de chamados e tickets em Kanban, com anexos, comentarios e agendamentos.',
  '/monitoramento': 'Acompanhamento dos agentes em tempo real, com status e produtividade.',
  '/gestao': 'Painel do supervisor: metricas de qualidade, monitoria e acompanhamento da equipe.',
  '/campanhas': 'Discagem ativa e campanhas em massa.',
  '/relatorios': 'Relatorios detalhados com exportacao para Excel e PDF.',
  '/escalas': 'Jornada de trabalho, escalas e pausas dos agentes.',
  '/crm': 'Contas, contatos, leads, oportunidades, catalogo e produtos.',
};

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
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const permitidos = NAV.filter((item) => temPerfil(...item.perfis));
  const inicial = permitidos[0]?.rota ?? '/atendimento';

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={inicial} replace />} />
      <Route element={<AppShell />}>
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        {permitidos
          .filter((item) => item.rota !== '/configuracoes')
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
