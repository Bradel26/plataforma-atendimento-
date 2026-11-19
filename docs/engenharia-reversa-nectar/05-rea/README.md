# Fase REA: frontend real do NectarCRM (2026-10-22)

As fases anteriores (14/10) leram só a documentação pública (Central de Ajuda + repositório `nectarcrm-api`). Esta fase analisa o **código que o navegador recebe** de `app.nectarcrm.com.br`, com o REA 6.5.0 e evidência com hash.

## Escopo e limites

- **Analisado:** a página pública de login (`/crm/?language=pt-BR`) e os 31 scripts que ela carrega, entre eles o i18n completo da aplicação (15.607 chaves). Isso já cobre o mapa inteiro de módulos.
- **Área autenticada (mesma data, segunda etapa):** um usuário da Bradel fez login **manualmente** no Chrome isolado. Foram analisados o bundle do app (`all.js`, 7 MB), os micro-frontends Vue e o Nchat (1.391 chunks), e a rede de 8 telas de listagem. Nada foi criado nem alterado, e nenhum corpo de resposta foi capturado.
- Nenhuma credencial foi usada, extraída ou testada por mim. Nenhum caminho foi adivinhado ou enumerado: só foram baixadas URLs que a própria aplicação carregou ou importou.
- Nada foi executado: o REA faz parse dos scripts como texto inerte. Código e textos proprietários ficaram fora do repositório; aqui só entram fatos derivados, contagens e hashes.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [stack-e-infraestrutura.md](stack-e-infraestrutura.md) | Tecnologias do front e do back, versão, cabeçalhos, terceiros |
| [api-interna-e-autenticacao.md](api-interna-e-autenticacao.md) | As duas camadas de API (Struts `.do` + REST `api/1`), envelope de resposta, login multi-tenant |
| [mapa-funcionalidades-i18n.md](mapa-funcionalidades-i18n.md) | Mapa de módulos pelo volume de i18n, suíte de agentes de IA, Vendas, BI, arquivos |
| [permissoes-e-automacoes.md](permissoes-e-automacoes.md) | Catálogo das 54 permissões numeradas e a gramática do construtor de automações |
| [area-autenticada.md](area-autenticada.md) | Arquitetura de serviços (monólito + IA + automações + omnichannel + MCP), rotas, chamadas por tela, API de IA, segurança e privacidade |
| [nchat-omnichannel.md](nchat-omnichannel.md) | Nchat por dentro: bootstrap OAuth, modelo GraphQL (atendimento, fila, SLA, capacidade, campanhas), comparação conosco |
| [whatsapp.md](whatsapp.md) | Os 4 caminhos de WhatsApp (Oficial por Embedded Signup, Lite por QR, extensão Nectar for Whats, integrações), quem está por trás do Nchat |
| [telefonia-e-integracoes-comunicacao.md](telefonia-e-integracoes-comunicacao.md) | Seção "Integrações > Comunicação": Nchat, VoIP (Nectar VoIP/Nvoip, Zenvia, 55PBX, PCM…), URL de ligação, ligação como tarefa |
| [inventario-endpoints-internos.md](inventario-endpoints-internos.md) | Apêndice gerado: 137 rotas, 185 caminhos REST, 64 ações Struts / 600 métodos |
| [comparativo-e-proximos-passos.md](comparativo-e-proximos-passos.md) | O que isso muda para a `plataforma-atendimento` e o que falta investigar |
| [evidencias.md](evidencias.md) | IDs de evidência do REA, SHA-256 dos artefatos e método de verificação |
| [instalacao-rea.md](instalacao-rea.md) | Dependências do REA instaladas nesta máquina e como estão registradas |

## Convenção

- **OBSERVADO:** está literalmente no artefato (script, cabeçalho, chave de i18n).
- **INFERIDO:** conclusão a partir do observado; vem com a base que a sustenta.
- **NÃO VERIFICADO:** depende de tela autenticada ou de comportamento do servidor.
