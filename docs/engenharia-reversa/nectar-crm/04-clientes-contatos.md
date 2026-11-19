# 04 — Clientes e contatos

## Status

**Não investigado em uso real** — o módulo de clientes/contatos vive dentro do app autenticado, fora do escopo desta rodada.

## O que as páginas públicas declaram (não observado em funcionamento)

Da tabela de preços (`/preco/`):
- Campos personalizados: "formulários personalizados" no Pro; "preenchimento automático e campos dependentes" no Enterprise.
- Limite de contatos: 1 milhão (Pro) vs. ilimitado (Enterprise) — sugere que a entidade "contato" tem algum custo de armazenamento/índice relevante para o fabricante segmentar por plano.
- Gestão de equipes e restrição de acesso por horário/IP (Enterprise) — indica controle de acesso por registro ou por módulo, não só por papel de usuário.

Da página Nectar for Whats:
- "Criar contatos e atualizar informações no CRM em poucos cliques" a partir do WhatsApp Web — ou seja, existe um fluxo de criação/merge de contato disparado por uma extensão de navegador, não só pela UI principal do CRM.

## Modelo conceitual equivalente já existente no nosso CRM

Nossa `plataforma-atendimento` já tem um modelo de contato mais rico do que o que foi possível confirmar no Nectar a partir de material público: `Contact`, `ContactOperation`, `ImportSourceMapping`, `ContactDeletionRequest` (LGPD), `CampoCustomizado` + `ValorCampoCustomizadoConta/Lead/Oportunidade` (campos customizados já por entidade), `Filial` (multi-filial). Isso já cobre, na prática, o que o Nectar anuncia como diferencial de plano (campos customizados, multi-unidade).

## Lacuna real a investigar depois (com login)

- Como o Nectar trata duplicidade de contato ao importar do WhatsApp (merge automático? pede confirmação?).
- Se existe de fato uma ficha 360° (contato + oportunidades + conversas + tickets) na mesma tela, ou se são abas separadas.

Isso só é respondível com acesso autenticado — fica registrado como pendência em [11-plano-implementacao.md](11-plano-implementacao.md).
