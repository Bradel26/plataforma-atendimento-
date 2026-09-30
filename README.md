# Plataforma de Atendimento Bradel

Sistema web de atendimento, CRM e gestão operacional da Bradel. O código inclui frontend, API e integrações.

**Produção:** [atendimento.bradel.com.br](https://atendimento.bradel.com.br)

## Funcionalidades

- Atendimento e gestão de conversas, filas e agentes.
- CRM com agenda, contatos, histórico, empresas, jornadas, metas e produtividade.
- Esteira de credenciamento, campanhas, relatórios e dashboards.
- Configurações de usuários e permissões.
- Chamados internos de TI, com histórico e acompanhamento por status.
- Integrações de canais, incluindo opções de WhatsApp. A disponibilidade depende das credenciais e do provedor configurado.

O CRM tem abas com acesso controlado por perfil: Agenda, Contatos, Histórico, Acompanhamentos, Ciclo do parceiro, Empresas, Jornadas, Metas, Produtividade, Painel do vendedor e Importar / Exportar.

## Tecnologias

- Frontend: React, TypeScript, Vite e Tailwind CSS.
- API: Node.js, Express, TypeScript e Prisma.
- Banco de dados: PostgreSQL; Redis para filas e dados temporários.
- Aplicação local e produção: Docker. A produção é gerenciada pelo Coolify.

## Rodar localmente

Pré-requisitos: Node.js 20 ou superior e Docker com Docker Compose.

```powershell
Copy-Item apps/api/.env.example apps/api/.env
npm install
npm run infra:up
npm run db:migrate
npm run db:seed
npm run dev
```

Abra <http://localhost:5173>. A interface usa a API local na porta `3333`; Postgres e Redis são iniciados pelo Docker Compose. Revise `apps/api/.env` para apontar para serviços locais antes de iniciar.

Atalho: `npm run setup` instala dependências, inicia a infraestrutura local, aplica migrations e executa o seed.

As contas do seed servem apenas para desenvolvimento local. Não use senhas de demonstração em produção.

## Verificações locais

```bash
npm run typecheck
npm test
npm run build
```

## Perfis

A aplicação define seis perfis: Administrador (`ADMIN`), Supervisor (`SUPERVISOR`), Gestor (`GESTOR`), Comercial (`COMERCIAL`), Suporte (`SUPORTE`) e Agente (`AGENTE`). As telas e os dados disponíveis dependem das permissões de cada perfil.

## Documentação

- [Manual de uso](MANUAL.md)
- [Integração GOWA](GOWA.md)
- [Integração WAHA](WAHA.md)
- [Integração WPPConnect](WPPCONNECT.md)

## Segurança

Nunca versione arquivos .env, credenciais, tokens ou dados reais. Use valores fictícios em desenvolvimento e configure os segredos fora do repositório.
