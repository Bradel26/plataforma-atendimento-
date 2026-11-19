# 03 — Interface e UX (somente páginas públicas)

## Site institucional (`/inicio/`)

- Header fixo com menu em mega-dropdown (Produtos, Comunicação, Geração de lead agrupados por categoria), seletor de idioma (PT/EN/ES via `pll_switcher`, indicando WPML ou Polylang — WordPress) e dois CTAs destacados: "Entrar" e "Teste Grátis".
- Layout de landing institucional clássico: hero → seção de automações → blocos alternados de texto+imagem por funcionalidade (Pipeline, Metas, Produtividade, Estatísticas) → prova social numérica → depoimento com carrossel (setas "Anterior/Próximo") → CTA final → rodapé com links de produto, conteúdo e central de ajuda.
- Banner de cookies simples (Aceitar/Ocultar/Configurar) sobreposto no rodapé.

## Landing page de Ads (`lp.nectarcrm.com.br/nectar-google-ads`)

- Estrutura de página de conversão: formulário de captura duplicado (aparece duas vezes na rolagem), com os mesmos 6 campos cada vez — reforça a tese de que é uma LP otimizada para redução de fricção em nutrição por Ads, não a página de produto completa.
- Uso de prova social em formato de citação curta + cargo + empresa (3 depoimentos), e uma seção de "processo" em 4 passos numerados antes da FAQ — padrão comum de página de geração de lead B2B.

## Tela pública de cadastro (`app.nectarcrm.com.br/crm/?register=true`)

- A aplicação do CRM já é visualmente distinta do site institucional (outro domínio, outro design system) — confirma que o app roda separado do WordPress institucional.
- A tela carrega como **iframes aninhados**: um iframe para o formulário de cadastro/login e outro iframe separado para o botão "Fazer Login com o Google" (`ref=f5e65` → `f7e3`). Isso é típico de SDKs de auth de terceiros embutidos via iframe (ex.: Google Identity Services) por isolamento de origem.
- Campos do formulário: Nome, E-mail, Senha, Confirmar senha. Botão "Criar minha conta" nasce **desabilitado** até preencher (validação client-side antes do submit). Link secundário "Ir para tela de login" alterna para o modo login no mesmo formulário (SPA, sem reload de página completo — confirmado pela URL não mudar e pelo rótulo "NectarCRM - Entrar" já aparecer mesmo com `register=true` na querystring).
- Seletor de idioma no topo da tela de login, independente do idioma do site institucional.

## Observação técnica (ver também [09-arquitetura.md](09-arquitetura.md))

Uma das requisições de rede da tela de login carregou `crm/js/angularjs/components/login/login-component.html.jsp` — confirma AngularJS no front e um backend que serve `.jsp` (Java).
