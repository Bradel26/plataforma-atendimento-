# 09 — Arquitetura (evidências vs. hipótese)

## CONFIRMADO (observação técnica direta)

- **Site institucional roda em WordPress**, com multilíngue via plugin de troca de idioma (`#pll_switcher`, padrão de Polylang/WPML) — evidência: URL de âncora e estrutura de menu típica de tema WP.
- **O app do CRM é uma aplicação separada**, em domínio e design system próprios (`app.nectarcrm.com.br`), distinta do site institucional.
- **Front-end do app usa AngularJS** — evidência: requisição `GET .../crm/js/angularjs/components/login/login-component.html.jsp` retornando `200`, e o padrão de arquivo `*-component.html` é convenção de template de componente AngularJS.
- **Backend serve arquivos `.jsp`** — o componente de login é servido como `login-component.html.jsp`, não um `.html` estático nem uma rota SPA pura. Isso indica um backend Java (JSP é tecnologia de servlet container Java — Tomcat/Jetty ou similar), ou ao menos um proxy/roteador que ainda expõe essa extensão por herança histórica.
- **Login com Google via iframe isolado** — o botão "Fazer Login com o Google" vive em um `<iframe>` próprio, separado do iframe do formulário de cadastro. Padrão compatível com Google Identity Services (GIS), que exige esse isolamento de origem.
- **Validação client-side no cadastro**: botão "Criar minha conta" nasce desabilitado até preencher campos — confirma alguma validação em JS antes do POST, não dá para saber se há também validação server-side correspondente (presumível, mas não confirmado).

## PROVÁVEL (hipótese com justificativa, não confirmada)

- Dado o uso de AngularJS (framework pré-2020 em termos de popularidade) + JSP, é provável que o **core do CRM seja um sistema mais antigo/monolítico em Java**, com features novas (como o "Copilot de IA" da landing de Ads) plugadas por cima ou em serviços separados — é comum em produtos SaaS B2B de vida longa ter esse tipo de estratificação. Isso é inferência de padrão de mercado, não evidência direta coletada aqui.
- O GA4 "server-side" via Stape sugere alguma maturidade de time de growth/marketing, mas não diz nada sobre a arquitetura do produto em si.

## DESCONHECIDO

- Linguagem/framework do backend de fato (JSP aponta para Java, mas não confirma qual framework: Spring, Struts, JSF puro, etc.).
- Banco de dados usado.
- Infraestrutura (cloud provider, orquestração).
- Se o app autenticado usa a mesma stack AngularJS em todas as telas ou se módulos mais novos (Nchat, Copilot de IA) usam outra stack (React/Vue) — plausível dado o hiato de tempo entre o core e os add-ons, mas não verificado.
- Protocolo de comunicação do Nchat (REST, WebSocket, polling) — não aberto nesta rodada.

## Comparativo rápido de stack com o nosso CRM

Nossa `plataforma-atendimento` usa stack moderna (Next.js/React no `apps/web`, API própria em `apps/api`, Prisma/Postgres) — ou seja, em termos de stack de frontend, **já estamos à frente** do que foi possível confirmar do Nectar (AngularJS). Isso não é automaticamente uma vantagem de produto, mas reduz o argumento de "copiar a arquitetura deles" — não há evidência de que valha a pena.
