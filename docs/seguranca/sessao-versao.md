# Versão de sessão (`sessaoVersao` / claim `sv`)

Encerra as sessões de uma pessoa quando o **perfil muda**, a **senha muda** ou a **conta é desativada** (ou excluída).
Antes, o token de acesso (15 min) e o refresh (7 dias) continuavam valendo com o perfil antigo.

## Como funciona

- `usuarios.sessao_versao` (inteiro, padrão 0). Só sobe, nunca desce.
- Todo token emitido leva `sv` = a versão da pessoa naquele momento (acesso **e** refresh).
- `requireAuth`, o handshake do Socket.IO e a renovação comparam `sv` com a versão do banco. Diferente → 401.
- O incremento vai **na mesma escrita** que muda perfil/senha/`ativo` (`users.service.ts`). Não existe estado em que o perfil mudou e a sessão antiga ainda vale. Não há mais uma gravação separada no Redis para falhar no meio.
- Depois do commit: o cache local da instância é esquecido e os sockets da pessoa são derrubados (`desconectarUsuario`).

Quem sobe a versão: `updateUser` (perfil diferente, senha enviada, `ativo:false` em quem estava ativo), `deactivateUser`, `alterarSenhaInicial`, `cli/criar-admin` (conta existente). `deleteUserPermanently` remove a linha (a validação recusa por 401) e também derruba cache e sockets.

## Token legado (sem `sv`) — por que valer como 0 é seguro

- Até a primeira revogação de uma pessoa a versão dela é 0 e o token legado representa exatamente o estado em que foi emitido. Nada piora; ninguém cai no deploy.
- Na primeira revogação a versão vira 1 e o token legado deixa de valer, como qualquer token anterior.
- Não dá para forjar um token sem `sv` com mais direito: o token é assinado e todo token emitido pelo código novo leva `sv`.
- Efeito colateral aceito: revogações feitas **antes** do deploy não existiam para o sistema (era o defeito original); um token legado de conta desativada antes do deploy continua barrado porque a renovação confere `ativo`.

## Falhas: nunca 401 por falha de infraestrutura

- Banco fora/lento (timeout 3 s) em `requireAuth`/handshake → **503 `SESSAO_INDISPONIVEL`**, fail-closed. Falha não é guardada no cache.
- Renovação: ordem **ler cookie → validar no banco → consumir → emitir**. Falha do banco ou do Redis → 503 e o cookie **não** é consumido.

## Janela residual (leia antes de afirmar "revogação imediata")

| Situação | Janela |
|---|---|
| Instância que executa a revogação | imediata (cache local invalidado) |
| **Outra** instância da API | **até 5 s** (TTL do cache; não há mensagem entre instâncias) |
| Socket já aberto em **outra** instância | até reconectar (sem adapter Redis do Socket.IO, `disconnectSockets` só alcança a instância local) |
| Falha ao derrubar sockets | registrada em log (`[sessao] ... falhou ao desconectar os sockets`); a revogação **não** é desfeita; socket fica até reconectar |
| Socket aberto e o token expira | **não** é derrubado por expiração (decisão desta entrega); só por revogação (evento local ou revalidação periódica de ~60 s) |
| `cli/criar-admin` | sobe a versão, mas roda fora da API: não limpa cache (≤ 5 s) nem derruba sockets |
| Banco fora | 503 (fail-closed); sessões em cache seguem aceitas até 5 s |

Quantas instâncias a API roda em produção **não foi verificado** (não há réplicas no `docker-compose`; produção é Coolify). A desconexão entre instâncias é coberta pela **revalidação periódica (alternativa D, implementada)**: janela ≈ 60 s ± 20 % + 5 s de cache. As demais alternativas (B/A/E/F), não implementadas: `docs/seguranca/socketio-multiplas-instancias.md`.

## Revisão independente (asa-security) — o que foi corrigido e o que ficou

Corrigido depois da revisão (conferido no código antes de aceitar): **(1)** o login assinava os tokens com a versão da linha devolvida pelo `update`; um reset de senha concorrente daria sessão válida a quem usou a senha antiga — agora usa a versão e o perfil do momento em que a senha foi conferida; **(2)** o socket é revalidado depois dos joins e a cada `conversa:entrar` (sessão revogada → desconecta; banco fora → não concede, não derruba); **(3)** removida a função morta `consumeRefreshToken`, que ignorava a versão.

Ficou como risco residual, sem correção nesta entrega:
- ~~`prisma/seed.ts`~~ — corrigido: sobe a versão quando o perfil de uma conta **existente** muda. Um teste-guarda (`sessao.escritas.test.ts`) falha se algum arquivo escrever perfil/senha/ativo de `User` sem citar `sessaoVersao` (varredura de texto por arquivo; não substitui os testes de cada serviço). Escritas por SQL manual continuam fora de qualquer proteção.
- O timeout de 3 s não cancela a consulta e a falha não é cacheada: com o banco lento, cada pessoa pode abrir uma consulta nova a cada ~3 s. Pool saturando **não foi medido**. Mitigação possível: cache negativo de 1–2 s.
- `validar` converte qualquer erro de consulta (inclusive bug) em 503, o que pode mascarar defeito — o erro é registrado em log.
- Durante o rolling deploy: instância antiga não sobe a versão **e** emite token sem `sv`; quem já teve a versão subida e cair no login/refresh de uma instância antiga recebe 401 intermitente. Preferir deploy sem sobreposição (drain das instâncias antigas) e não alterar perfil/senha/ativo na janela.
- Tokens legados anteriores à migration valem como versão 0; um refresh legado emitido antes de uma troca de senha **anterior** à migration continua válido (já era assim). Se for crítico: `UPDATE usuarios SET sessao_versao = 1` na migration (desloga todos).
- Testes com banco simulado não provam o `x + 1` atômico do Postgres nem o filtro real da extensão de organização; `consultarNoBanco` não tem teste unitário.

## Achado dos testes com Postgres real

`consultarNoBanco` devolvia de dentro de `comOrganizacao` a promessa **preguiçosa** do Prisma; ela executava fora do contexto de organização e a extensão de isolamento a recusava, o que teria feito **toda requisição autenticada responder 503**. Só apareceu contra um Postgres real (os testes de unidade simulavam a consulta). Corrigido e coberto por `lib/sessao.consulta.test.ts`. Detalhes em `testes-integracao-postgres.md`.

## Front-end (corrigido)

`apps/web/src/lib/api.ts` agora distingue três resultados da renovação (`ResultadoRefresh`): `ok`, `expirada` (**só** um 401 da API, com o corpo de erro dela) e `indisponivel` (5xx, 429, falha de rede, resposta ilegível, 401 sem o formato da API). Só `expirada` limpa o token e dispara o logout. Em `indisponivel` o cliente **não** desloga, o cookie fica intacto, a chamada recebe um erro 503 e a próxima tenta renovar de novo. No carregamento da página, `restaurarSessao` continua tentando com espera crescente (2, 4, 8, 15, 30 s) e a tela mostra "Servidor indisponível. Tentando reconectar..."; quando o serviço volta a sessão é restaurada sozinha. O cookie de refresh é `httpOnly`: o cliente nunca o toca.

## Custo

Uma consulta por chave primária (2 colunas) por pessoa ativa, no máximo a cada 5 s por instância, com requisições simultâneas coalescidas. **Estimativa, não medição:** 30 pessoas ativas ⇒ ≤ ~360 consultas/min por instância. A disponibilidade passa a depender do Postgres também em `requireAuth`; como a maioria das rotas já consulta o banco, o impacto esperado é pequeno, mas **não foi medido** — acompanhar latência e taxa de 503 após o deploy.

## Implantação

Veja o **checklist completo** em `docs/seguranca/checklist-implantacao-sessao.md` (ordem da migration, deploy, verificações pós-deploy e rollback). Pontos que mudaram desde a primeira versão deste documento: a migration roda no `entrypoint.sh` **antes** da API (a ordem já é garantida), o **push na `main` implanta sozinho** (CI), e a migration agora define `lock_timeout = 10s`.
