# Modelo relacional — núcleo de atendimento + CRM

ERD do **nosso schema real** (não um schema novo proposto — o projeto já tem um Prisma maduro). Escopo: só as entidades-núcleo relevantes a esta investigação (atendimento/Nchat-equivalente + CRM comercial). As demais 50+ models (LGPD, voz, tickets, credenciamento, etc.) existem mas ficam fora deste diagrama para legibilidade — ver `07-nosso-crm/modulos-existentes.md` para a lista completa.

```mermaid
erDiagram
    ORGANIZACAO ||--o{ USER : emprega
    ORGANIZACAO ||--o{ CHANNEL_CONFIG : possui
    ORGANIZACAO ||--o{ QUEUE : possui
    ORGANIZACAO ||--o{ CONTACT : possui
    ORGANIZACAO ||--o{ CONVERSATION : possui
    ORGANIZACAO ||--o{ FUNNEL : possui
    ORGANIZACAO ||--o{ CAMPAIGN : possui
    ORGANIZACAO ||--o{ FLUXO : possui

    QUEUE ||--o{ QUEUE_AGENT : tem
    USER ||--o{ QUEUE_AGENT : participa

    CHANNEL_CONFIG ||--o| FLUXO : "publicado em (1:1)"
    CHANNEL_CONFIG ||--o{ CONVERSATION : recebe

    CONTACT ||--o| CONVERSATION : "1 conversa ativa (regra Nchat, a confirmar no nosso codigo)"
    CONVERSATION ||--o{ MESSAGE : contem
    CONVERSATION }o--o| QUEUE : atribuida_a
    CONVERSATION }o--o| USER : agente_responsavel
    CONVERSATION ||--o| EXECUCAO_FLUXO : "1:1, se em automacao"
    EXECUCAO_FLUXO }o--o| FLUXO : executa_versao_de

    CAMPAIGN ||--o{ CAMPAIGN_ITEM : dispara_para
    CAMPAIGN_ITEM }o--|| CONTACT : alvo
    CAMPAIGN_ITEM }o--o| CONVERSATION : "gera, se responder"

    FUNNEL ||--o{ FUNNEL_STAGE : tem
    FUNNEL_STAGE ||--o{ OPPORTUNITY : recebe
    CONTACT ||--o{ OPPORTUNITY : "via Account (conta)"
    ACCOUNT ||--o{ OPPORTUNITY : possui
    ACCOUNT ||--o{ CONTACT : agrupa

    USER ||--o{ MENSAGEM_RAPIDA : cria
    USER ||--o{ TICKET : atende
    CONVERSATION ||--o| TICKET : "origem, se aplicavel"
```

## Notas de fidelidade ao schema real

- `ORGANIZACAO` = model `Organizacao`; todas as entidades têm `organizacaoId` como isolamento multi-tenant (confirmado em `Conversation`, `Message`, `Contact`, `Campaign`, `Fluxo`, `MensagemRapida`, `Ticket`, `Queue` — padrão consistente em todo o schema lido).
- `CONTACT ||--o| CONVERSATION` com cardinalidade "1 conversa ativa por contato" é a regra **documentada do Nchat** (`"O Nchat mantém uma única conversa ativa por contato"`), **ainda não confirmada como regra efetivamente imposta pelo nosso código** (não há `@@unique` visível no trecho de `Conversation` lido que force isso por `contatoId` — pode ser imposta na camada de aplicação, não no banco). Marcar como **PROPOSTA DE VERIFICAÇÃO**: conferir se `apps/api/src/modules/conversations` garante essa invariante, e se não, se deveríamos adicionar um índice único parcial (`WHERE status != 'FINALIZADO'`).
- `CHANNEL_CONFIG ||--o| FLUXO` é `@unique` confirmado no schema (`canalConfigId String? @unique` em `Fluxo`) — 1 fluxo publicado por canal, mesma regra do Nchat ("um número = um chatbot").
- Campos de equipe (`Equipe`/`Team` equivalente) e permissões não entraram no ERD por não terem sido lidos em profundidade nesta investigação — ver `09-relatorios/nao-verificado.md`.

## Chaves e índices observados (evidência direta do schema)

- `Message.idExterno` com `@unique` — idempotência de webhook (mensagem reentregue pela Meta não duplica).
- `ExecucaoFluxo.conversaId` com `@unique` — garante 1 execução de fluxo ativa por conversa.
- `Fluxo.canalConfigId` com `@unique` — garante 1 fluxo publicado por canal.
- `Queue` com `@@unique([organizacaoId, nome])` — nomes de fila únicos por organização, não globalmente (correto para multi-tenant).
- `CampaignItem` com `@@unique([campanhaId, contatoId])` — não disparar a mesma campanha duas vezes para o mesmo contato.
- `MensagemRapida` com `@@unique([organizacaoId, atalho])`.

Essas restrições já resolvem, no nível de banco, boa parte dos requisitos de integridade que a documentação do Nectar deixa como regra de negócio não garantida tecnicamente (ex.: o Nectar não documenta nenhuma proteção de banco contra reentrega de webhook; nós já temos).
