import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ConfirmProvider } from '../ui/ConfirmDialog';
import { ToastProvider } from '../ui/Toast';
import { itemDaRota } from './nav';
import { PaletaDeComando } from './PaletaDeComando';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const { pathname } = useLocation();
  const atual = itemDaRota(pathname);
  const [menuAberto, setMenuAberto] = useState(false);

  const fecharMenu = () => {
    setMenuAberto(false);
    // O foco volta pro botao que abriu — sem isto, depois de fechar por Esc
    // ou pelo backdrop o foco ficava perdido no documento, em vez de num
    // controle que a pessoa reconhece.
    document.getElementById('botao-abrir-menu')?.focus();
  };

  return (
    // Toast e ConfirmDialog moram no shell pela mesma razao da paleta de
    // comando: sao infraestrutura de qualquer tela, nao de uma pagina —
    // montar por pagina perderia o estado a cada navegacao.
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex h-full">
          <Sidebar aberta={menuAberto} aoFechar={fecharMenu} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar titulo={atual?.label ?? 'Plataforma'} aoAbrirMenu={() => setMenuAberto(true)} />
            <main className="flex-1 overflow-y-auto p-6">
              <Outlet />
            </main>
          </div>
          <PaletaDeComando />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
