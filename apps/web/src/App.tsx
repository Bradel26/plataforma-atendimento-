import type { ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NAV } from './components/layout/nav';
import { useAuth } from './features/auth/AuthProvider';
import { AtendimentoPage } from './pages/AtendimentoPage';
import { AuditoriaPage } from './pages/AuditoriaPage';
import { AvaliacaoPage } from './pages/AvaliacaoPage';
import { CampanhasPage } from './pages/CampanhasPage';
import { ChamadoTiPage } from './pages/ChamadoTiPage';
import { DashboardsPage } from './pages/DashboardsPage';
import { GestaoPage } from './pages/GestaoPage';
import { LoginPage } from './pages/LoginPage';
import { MonitoramentoPage } from './pages/MonitoramentoPage';
import { TelefoniaPage } from './pages/TelefoniaPage';
import { DesempenhoPage } from './pages/DesempenhoPage';
import { WebchatPage } from './pages/WebchatPage';
import { WEBCHAT_ATIVO } from './lib/recursos';
import { ConfiguracoesPage } from './pages/configuracoes/ConfiguracoesPage';
import { CrmPage } from './pages/crm/CrmPage';
import { EsteiraPage } from './pages/esteira/EsteiraPage';
import { EditorFluxoPage } from './pages/fluxos/EditorFluxoPage';

/**
 * Pagina de cada rota do menu. Os perfis com acesso vivem em NAV, entao a mesma
 * regra filtra o menu e as rotas — digitar a URL na mao nao contorna a permissao.
 */
const PAGINAS: Record<string, ComponentType> = {
  '/dashboards': DashboardsPage,
  '/atendimento': AtendimentoPage,
  '/telefonia': TelefoniaPage,
  '/auditoria': AuditoriaPage,
  '/chamado-ti': ChamadoTiPage,
  '/esteira': EsteiraPage,
  '/monitoramento': MonitoramentoPage,
  '/gestao': GestaoPage,
  '/campanhas': CampanhasPage,
  // A rota continua /relatorios para links e atalhos antigos nao quebrarem.
  '/relatorios': DesempenhoPage,
  '/crm': CrmPage,
  '/configuracoes': ConfiguracoesPage,
};

/**
 * Rotas com parametro dentro do proprio modulo (mesma pagina, mesma permissao).
 * `/esteira` sozinho redireciona para a operacao; a tela e `/esteira/:operacao`.
 */
const ROTAS_DA_PAGINA: Record<string, string[]> = {
  '/esteira': ['/esteira/:operacao'],
};

/** Rotas publicas: nao exigem sessao e existem logado ou nao. */
function RotasPublicas() {
  return (
    <>
      {WEBCHAT_ATIVO && <Route path="/webchat" element={<WebchatPage />} />}
      <Route path="/avaliacao/:token" element={<AvaliacaoPage />} />
    </>
  );
}

function AppRoutes() {
  const { usuario, carregando, temPerfil, temModulo, temEsteira } = useAuth();

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">Carregando sessão...</div>
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

  const permitidos = NAV.filter((item) => temModulo(item.rota.slice(1)));
  // A Esteira sem nenhuma operação acessível continua registrada (a URL digitada
  // mostra "sem acesso"), mas não é a tela inicial nem aparece no menu.
  const inicial = permitidos.find((item) => item.rota !== '/esteira' || temEsteira)?.rota ?? '/atendimento';

  return (
    <Routes>
      {RotasPublicas()}
      <Route path="/login" element={<Navigate to={inicial} replace />} />
      <Route path="/configuracoes/fluxos/:id" element={temPerfil('ADMIN') ? <EditorFluxoPage /> : <Navigate to="/configuracoes" replace />} />
      <Route path="/protocolo" element={<Navigate to="/chamado-ti" replace />} />
      <Route element={<AppShell />}>
        {permitidos.flatMap(({ rota, subrotas }) => {
          const Pagina = PAGINAS[rota];
          if (!Pagina) return [];
          // A rota de detalhe usa a MESMA pagina do modulo e o mesmo filtro de
          // perfil: `/contatos/:id` existe para quem ve `/crm` e para mais
          // ninguem. Registrar uma pagina propria aqui seria abrir a porta para
          // uma permissao divergir da do menu sem ninguem notar.
          return [
            <Route key={rota} path={rota} element={<Pagina />} />,
            ...(ROTAS_DA_PAGINA[rota] ?? []).map((r) => <Route key={r} path={r} element={<Pagina />} />),
            // A subrota pode restringir mais que o modulo: quem ve o CRM nao
            // necessariamente ve `/oportunidades/:id`. A rota nem e registrada
            // para quem nao tem o perfil, e a URL digitada cai no
            // redirecionamento de rota desconhecida.
            // `perfis` ausente HERDA o do modulo — que ja passou no filtro
            // acima. Escrever `temPerfil(...(s.perfis ?? []))` daria falso com
            // lista vazia e faria a subrota sem restricao deixar de existir.
            ...(subrotas ?? [])
              .filter((s) => (s.perfis ? temPerfil(...s.perfis) : true))
              .map((s) => <Route key={s.rota} path={s.rota} element={<Pagina />} />),
          ];
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
