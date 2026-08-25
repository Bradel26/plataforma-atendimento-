# Pendências

Estado em 25/08/2026. Tudo que está no `SCOPE.md` foi construído, exceto os quatro itens de voz
que dependem de provedor contratado. Este arquivo lista o que falta, quem precisa fazer e o que
acontece se ficar como está.

Legenda de responsável: **você** = depende de credencial, contrato ou decisão de negócio.
**eu** = dá para construir e verificar nesta máquina, sem depender de terceiros.

---

## 1. Bloqueia ir para produção

| # | O que falta | Quem | Se ficar assim |
|---|---|---|---|
| 1.1 | **Rotacionar as credenciais do Neon e do Upstash** | você | Elas passaram pelo chat. Quem tiver o histórico tem o banco e o Redis. |
| 1.2 | ~~Trocar os segredos de exemplo por valores gerados~~ | **feito** | `npm run gerar:segredos` escreve `apps/api/.env.production` com tudo saído de `randomBytes`, permissão 600, fora do git. |
| 1.3 | ~~Trocar a senha do admin do seed~~ | **feito** | O seed recusa senha ou domínio de exemplo em produção, cria só o admin (sem os três usuários de demonstração) e não imprime a senha. |
| 1.4 | Definir o domínio e emitir o certificado (o `WEB_ORIGIN` não pode ser localhost) | você | Sem isso o cookie de sessão e o CORS não fecham. |
| 1.5 | **Construir e subir a imagem Docker** | você | O `Dockerfile` e o compose existem e foram revisados, mas **nunca passaram por um build** — não há Docker/WSL2 nesta máquina. É o único artefato de deploy não verificado. |
| 1.6 | Rodar as migrations no banco de produção (`prisma migrate deploy`) | você | 10 migrations aguardando. Nunca use `--shadow-database-url` apontando para banco com dados. |

## 2. Canais: construído, nunca exercitado de verdade

| # | O que falta | Quem | Situação hoje |
|---|---|---|---|
| 2.1 | **Credenciais Meta verificadas** (WhatsApp Business, Instagram, Messenger) + túnel HTTPS público | você | Os três canais foram testados com payloads que eu mesmo assinei e com a Graph API recusando token falso. Nunca houve mensagem real. |
| 2.2 | Aprovar os templates de mensagem no WhatsApp | você | Campanha ativa fora da janela de 24h exige template aprovado. |
| 2.3 | **Contratar o provedor de voz** (Twilio ou compatível) | você | O driver foi escrito a partir do contrato documentado da API e **nunca falou com conta real**. |
| 2.4 | Anexo do agente no Instagram Direct | — | Não é possível: o canal só aceita URL, não upload. Documentado. |

## 3. Voz: o que só existe com tronco

Os quatro itens ainda abertos no roadmap. Todos dependem do item 2.3.

| # | O que falta | Depende de |
|---|---|---|
| 3.1 | Softphone no navegador | SDK WebRTC do provedor |
| 3.2 | Ramais e URA | Roteamento de áudio só se valida com tronco real |
| 3.3 | Monitoria (escuta, sussurro, espionagem) | Conferência no provedor |
| 3.4 | Transcrição automática | Serviço de fala-para-texto contratado |

Um softphone que nunca completou uma chamada aparenta estar pronto sem estar — por isso não foi
construído "às cegas".

## 4. Dívida técnica que eu consigo fazer agora

Em ordem de risco que remove, do maior para o menor.

| # | O que falta | Por que importa | Tamanho |
|---|---|---|---|
| 4.1 | ~~Teste de navegador (Playwright)~~ | **feito** — 10 testes em Chromium que cobrem login, menu por perfil, rota proibida, logout e sessão atravessando recarga. Achou um bug real na primeira execução (ver decisão 37). | — |
| 4.2 | ~~Worker em processo separado~~ | **feito** — `src/worker.ts`, mesma imagem, outro processo; `WORKER_EMBUTIDO` controla o embutido. | — |
| 4.3 | ~~Anonimização de backup e de log~~ | **feito** — `npm run lgpd:reaplicar` reanonimiza a partir da trilha depois de restaurar; log redige dado pessoal antes de imprimir. | — |
| 4.4 | Testes de integração com banco efêmero | Os smokes usam o banco de dev; um teste destrutivo não tem onde rodar em segurança. Precisa de Docker. | médio |
| 4.5 | Modo escuro | O app não tem. A paleta de dados foi validada só sobre fundo claro. | pequeno |
| 4.6 | Tabela acessível nos gráficos do dashboard | Quem usa leitor de tela não lê barra. Hoje há rótulo e valor visíveis, o que atende o mínimo, mas não substitui a tabela. | pequeno |
| 4.7 | ~~Reprocessar dead-letter pela interface~~ | **feito** — aba Configurações › Fila de trabalho, restrita a ADMIN. | — |

## 5. Fora do escopo, mas os concorrentes têm

Nada disso está no `SCOPE.md`. Só entra se você decidir.

| # | Recurso | O que resolve |
|---|---|---|
| 5.1 | Respostas rápidas / atalhos do agente | O agente digita a mesma resposta vinte vezes por dia |
| 5.2 | Etiquetas em conversa | Hoje não há como classificar assunto para relatório |
| 5.3 | SLA de atendimento por fila | O SLA existe em protocolo, não em conversa |
| 5.4 | Chat interno entre agentes | Pedir ajuda ao supervisor hoje é fora da plataforma |
| 5.5 | Discador preditivo / power dialer | Campanha de voz hoje é chamada por chamada |
| 5.6 | Base de conhecimento / FAQ | O bot responde por passos fixos, sem busca em conteúdo |

---

## Ordem que eu recomendo

1. **1.1 a 1.6** — sem isso não existe produção. O item 1.5 (build da imagem) é o único que pode
   revelar surpresa, porque nunca rodou.
2. **2.1** — credencial Meta é o que prova que a plataforma atende cliente de verdade.
3. **4.1** — teste de navegador, o maior risco não coberto do que está pronto.
4. **2.3 e o grupo 3** — voz completa, depois que houver provedor.
5. **4.2 e 4.3** — antes do primeiro volume real de campanha e do primeiro pedido de exclusão.
