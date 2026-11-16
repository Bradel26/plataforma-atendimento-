# Socket.IO com mais de uma instância da API

**Estado (2026-11-16): a alternativa D está IMPLEMENTADA** (`apps/api/src/realtime/revalidacao.ts`, ligada em `server.ts`; 20 testes em `revalidacao.test.ts`). As alternativas A, B, E e F **não** foram implementadas e exigem aprovação antes de virar código ou infraestrutura. O restante deste documento é a revisão feita antes da implementação.

### Como a D foi implementada

- **Um laço por processo**, não um timer por socket. Intervalo 60 s com jitter de ±20 % (48 a 72 s); reagendado **só depois do fim** da rodada, então rodadas não se sobrepõem. O timer é `unref` e é cancelado quando o servidor HTTP fecha.
- Cada rodada lê só os sockets **locais** (`io.local.fetchSockets()`), agrupa por (organização, pessoa, versão do token) e faz **uma** consulta por grupo — N abas = 1 consulta — com concorrência 8, para não esgotar o pool do Prisma. A consulta passa por `validarSessao` (cache de 5 s, coalescência, timeout de 3 s).
- **Só `revogada` desconecta** (versão diferente, usuário inativo ou inexistente). `indisponivel` (banco fora, timeout, erro inesperado) **nunca** desconecta e não é cacheada: a próxima rodada tenta de novo.
- Como cada instância roda o laço sobre os **seus** sockets, a revogação feita em outra instância chega aqui em até ≈ intervalo + 5 s (≤ ~77 s).
- Visitantes do webchat (sem usuário) não são consultados.
- **Não** derruba por expiração do token (decisão anterior mantida): a regra é versão/ativo, não `exp`.
- **Não** corrige as emissões entre instâncias (isso é a alternativa A).
- Custo: ≤ 1 consulta por chave primária por pessoa conectada por minuto, por instância (**estimado, não medido**).

## O que o código mostra (CONFIRMED_BY_CODE, repositório local)

| Fato | Evidência |
|---|---|
| Não há adapter entre instâncias. A única dependência de Socket.IO é o servidor. | `apps/api/package.json` lista `socket.io` e `ioredis`, sem `@socket.io/redis-adapter`; busca por `createAdapter`/`.adapter(` em `apps/api/src` não achou nada |
| Todo envio ao vivo é local à instância: `io.to(sala).emit(...)` e `io.in(sala).disconnectSockets(true)` só alcançam os sockets conectados **neste** processo | `apps/api/src/realtime/hub.ts` (`desconectarUsuario` e as funções `notificar*`) |
| O servidor Socket.IO é criado no processo da API, junto do conector WhatsApp no mesmo container | `apps/api/src/main.ts` (`criarServidorRealtime(server)`); `apps/api/entrypoint.sh` inicia `server.mjs` do conector e `WEBJS_DATA_DIR` em disco local |
| O cliente usa `websocket` e `polling` | `apps/web/src/lib/realtime.ts` (`transports: ['websocket', 'polling']`) — com várias instâncias, o polling exige afinidade de sessão (sticky) no balanceador |
| Já existe um processo de worker separado, e `redis.duplicate()` é usado para a fila | `apps/api/src/worker.ts`, `apps/api/src/lib/fila.ts:131` |

**Consequência para esta mudança.** Com N > 1 instâncias, ainda sem adapter:
- `desconectarUsuario` derruba só os sockets da instância que processou a revogação;
- o cache de 5 s de `validarSessao` também é por instância;
- e, independentemente da revogação, os eventos em tempo real (nova mensagem etc.) emitidos numa instância **não chegam** aos sockets das outras. Ou seja, o realtime atual já não funcionaria corretamente com mais de uma instância, o que é indício (não prova) de que produção roda uma só.

**Não verificado:** quantas réplicas existem em produção (política do Coolify, volume de `WEBJS_DATA_DIR`). Não presumo uma réplica; as alternativas abaixo valem para os dois casos.

## O que cada revogação deixa aberto hoje

| Situação | Janela |
|---|---|
| Socket na mesma instância da revogação | imediato (desconectado após o commit) |
| Socket em outra instância | até reconectar; sem limite de tempo |
| Cache de `validarSessao` em outra instância | até 5 s |
| Socket aberto e token expirado | não derrubado por expiração (decisão desta entrega) |

## Alternativas para desconexão distribuída

| # | Alternativa | Fecha | Custo / risco | Infra nova? |
|---|---|---|---|---|
| **D** | **Revalidação periódica por socket**: a cada ~60 s cada instância chama `situacaoDaSessao(usuario)` para os sockets que tem e desconecta os `revogada`. Aproveita o cache de 5 s e a consulta por chave primária. | Socket em qualquer instância: janela = intervalo + 5 s. Também cobre o token expirado, se a regra passar a existir. | Código pequeno (um `setInterval` no servidor realtime). Uma consulta por pessoa conectada por ciclo, coalescida. Não corrige emissões entre instâncias. | **Não** |
| **B** | **Canal Redis pub/sub próprio** (`sessao:revogada` com `{org, usuarioId}`): quem revoga publica; toda instância assina, invalida o cache local e chama `disconnectSockets`. | Fecha **também** os 5 s do cache em todas as instâncias. Janela ≈ latência do Redis. | Uma conexão de assinatura por instância (`redis.duplicate()`, já usado em `fila.ts`). Entrega *at-most-once*: instância desconectada do Redis perde a mensagem, e aí valem o TTL de 5 s e a alternativa D. Volume baixo (só revogações). **Cota do Upstash**: poucas mensagens, mas é o mesmo Redis que já estourou a cota; medir antes. | Usa o Redis existente; sem serviço novo |
| **A** | **`@socket.io/redis-adapter`**: o `io.in(sala).disconnectSockets()` e os `emit` passam a valer no cluster inteiro. | Desconexão distribuída **e** a entrega do realtime entre instâncias (que hoje já falta). | Dependência nova, 2 conexões Redis por instância, tráfego de pub/sub proporcional ao volume de eventos (mais pesado para a cota que a B). Exige afinidade de sessão para o polling. | Dependência e configuração de balanceador |
| **E** | Postgres `LISTEN/NOTIFY` | Distribuído, sem Redis | Não funciona atrás do pooler em modo transação (Neon pooled); exige conexão direta por instância. Mais complexo. | Conexão direta nova |
| **F** | Tokens de socket de vida curta com reautenticação forçada pelo cliente | Limita o tempo de qualquer socket | Muda o front e o contrato do handshake; risco de reconexão em massa | Não, mas muda contrato |

### Recomendação (para aprovação)

1. **Agora, independente do número de réplicas: D.** Pequena, sem infraestrutura, e é a única que limita a janela do socket mesmo se a mensagem de outra alternativa se perder. Também deixa de depender de "risco residual sem limite".
2. **Se for confirmado mais de uma instância:** acrescentar **B** (fecha o cache de 5 s e a desconexão) e decidir **A** à parte, porque o realtime entre instâncias é um problema mais amplo que a revogação.
3. Antes de qualquer uma: **confirmar no Coolify** a contagem de réplicas e a política de rolling, e medir o consumo atual de comandos do Redis.

A **D foi implementada** (ver o topo). A, B, E e F continuam não implementadas e aguardam decisão.
