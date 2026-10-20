import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CabecalhoPagina } from '../../components/ui/Pagina';
import { BotsTab } from './BotsTab';
import { FluxosTab } from './FluxosTab';
import { CamposCustomizadosTab } from './CamposCustomizadosTab';
import { CanaisTab } from './CanaisTab';
import { FilaTab } from './FilaTab';
import { FilasTab } from './FilasTab';
import { FiliaisTab } from './FiliaisTab';
import { IaTab } from './IaTab';
import { LgpdTab } from './LgpdTab';
import { MensagensRapidasTab } from './MensagensRapidasTab';
import { UsuariosTab } from './UsuariosTab';
import { VozTab } from './VozTab';
import { WhiteLabelTab } from './WhiteLabelTab';

const ABAS = [
  { id: 'usuarios', label: 'Usuários e permissões', grupo: 'Equipe e acesso', descricao: 'Quem entra na plataforma, com qual perfil e em quais módulos' },
  { id: 'filiais', label: 'Filiais', grupo: 'Equipe e acesso', descricao: 'Unidades da empresa e o que pertence a cada uma' },
  { id: 'filas', label: 'Filas', grupo: 'Equipe e acesso', descricao: 'Equipes de atendimento e quem recebe as conversas de cada uma' },
  { id: 'canais', label: 'Canais', grupo: 'Canais e atendimento', descricao: 'Números de WhatsApp, redes sociais e o widget do site' },
  { id: 'mensagens-rapidas', label: 'Mensagens rápidas', grupo: 'Canais e atendimento', descricao: 'Respostas prontas para usar durante o atendimento' },
  { id: 'bots', label: 'Chatbot', grupo: 'Canais e atendimento', descricao: 'Perguntas automáticas antes de a conversa chegar a uma pessoa' },
  { id: 'fluxos', label: 'Fluxos', grupo: 'Canais e atendimento', descricao: 'Roteamentos de WhatsApp montados em etapas' },
  { id: 'ia', label: 'IA (motor externo)', grupo: 'Inteligência e voz', descricao: 'Ligação com o motor de IA: ponte por canal e tokens de integração' },
  { id: 'voz', label: 'Voz', grupo: 'Inteligência e voz', descricao: 'Provedor de telefonia, gravação e transcrição das ligações' },
  { id: 'campos-customizados', label: 'Campos customizados', grupo: 'Dados e sistema', descricao: 'Campos extras nas fichas de contato e de conta' },
  { id: 'lgpd', label: 'LGPD e retenção', grupo: 'Dados e sistema', descricao: 'Por quanto tempo os dados ficam guardados e os pedidos do titular' },
  { id: 'fila', label: 'Fila de trabalho', grupo: 'Dados e sistema', descricao: 'Trabalhos em segundo plano esperando, e os que desistiram' },
  { id: 'whitelabel', label: 'White Label', grupo: 'Marca', descricao: 'Nome, logo e cores da plataforma' },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

const GRUPOS = [...new Set(ABAS.map((a) => a.grupo))];

export function ConfiguracoesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaInicial = ABAS.some(({ id }) => id === searchParams.get('aba'))
    ? searchParams.get('aba') as AbaId
    : 'usuarios';
  const [aba, setAba] = useState<AbaId>(abaInicial);
  const atual = ABAS.find((a) => a.id === aba)!;

  const selecionarAba = (id: AbaId) => {
    setAba(id);
    setSearchParams(id === 'usuarios' ? {} : { aba: id }, { replace: true });
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* No celular a lista vira uma faixa que rola de lado; no desktop, grupos empilhados. */}
      <nav
        aria-label="Seções das configurações"
        className="sem-barra-de-rolagem flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 lg:sticky lg:top-4 lg:flex-col lg:gap-3.5 lg:overflow-visible lg:p-2.5"
      >
        {GRUPOS.map((grupo) => (
          <div key={grupo} className="flex shrink-0 gap-1 lg:flex-col lg:gap-0.5">
            <p className="hidden px-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 lg:block">{grupo}</p>
            {ABAS.filter((a) => a.grupo === grupo).map(({ id, label }) => {
              const ativa = aba === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={ativa ? 'page' : undefined}
                  onClick={() => selecionarAba(id)}
                  className={`flex h-[34px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] transition ${
                    ativa
                      ? 'bg-[var(--brand-primary-soft)] font-bold text-[var(--brand-primary)]'
                      : 'font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span
                    className={`hidden h-4 w-[3px] shrink-0 rounded-sm lg:block ${ativa ? 'bg-[var(--brand-primary)]' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* `[&_.grid>*]:min-w-0`: as abas usam grades `1fr`, que crescem ate caber a
          tabela mais larga (a matriz de permissoes) e empurravam a pagina para o
          lado; com min-w-0 a tabela rola dentro do proprio cartao. */}
      <div className="flex min-w-0 flex-col gap-5 [&_.grid>*]:min-w-0">
        <CabecalhoPagina acima={atual.grupo} titulo={atual.label} descricao={atual.descricao} />

        {aba === 'usuarios' && <UsuariosTab />}
        {aba === 'filiais' && <FiliaisTab />}
        {aba === 'campos-customizados' && <CamposCustomizadosTab />}
        {aba === 'filas' && <FilasTab />}
        {aba === 'canais' && <CanaisTab />}
        {aba === 'mensagens-rapidas' && <MensagensRapidasTab />}
        {aba === 'bots' && <BotsTab />}
        {aba === 'fluxos' && <FluxosTab />}
        {aba === 'ia' && <IaTab />}
        {aba === 'whitelabel' && <WhiteLabelTab />}
        {aba === 'voz' && <VozTab />}
        {aba === 'lgpd' && <LgpdTab />}
        {aba === 'fila' && <FilaTab />}
      </div>
    </div>
  );
}
