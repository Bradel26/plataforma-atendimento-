# Ligar os canais reais da Meta

WhatsApp Business, Instagram Direct e Messenger. Este documento fecha a pendência 2.1 — a única
que separa "os canais foram construídos" de "os canais recebem mensagem de gente".

> **O que já está pronto e o que falta.** O código dos três canais está construído e testado: o
> `npm run smoke:canais` monta payloads no formato real da Meta, assina com HMAC SHA-256 como ela
> assina, e confere verificação de assinatura, idempotência, roteamento para fila, download de
> mídia e recusa de envio. O que ele **não** pode provar é que a conta existe, que o token é
> válido e que a Meta chama o webhook — nada disso é decidido aqui. É essa metade que falta, e ela
> depende de credencial que só você tem.

---

## O túnel HTTPS não é mais necessário

A pendência 2.1 pedia "credenciais Meta verificadas **+ túnel HTTPS público**". A segunda metade
caiu: a produção já está publicada em HTTPS com certificado válido de CA pública, o que é
exatamente o requisito da Meta para URL de webhook.

Verificado: as chamadas do `validar:producao` e do `verificar:meta` completam o TLS com o
repositório de CAs padrão do Node, que recusaria certificado autoassinado.

A URL do webhook, portanto, é a própria produção:

| Canal | URL do webhook |
|---|---|
| WhatsApp | `https://zios6of26x7kizkh57fxw62t.187.127.32.153.sslip.io/api/webhooks/whatsapp` |
| Instagram | `https://zios6of26x7kizkh57fxw62t.187.127.32.153.sslip.io/api/webhooks/instagram` |
| Messenger | `https://zios6of26x7kizkh57fxw62t.187.127.32.153.sslip.io/api/webhooks/facebook` |

Nenhum ngrok, nenhum túnel, nada rodando nesta máquina.

**O único risco que sobra neste ponto:** não sei se a Meta aceita um hostname `sslip.io` no cadastro
do webhook. O certificado é válido e o domínio resolve, que é o que ela documenta exigir, mas não
tenho como testar sem um app real. Se ela recusar, o desbloqueio é o item 1.4 (domínio próprio) —
e aí a URL passa a ser `https://atendimento.bradel.com.br/api/webhooks/…`.

---

## 1. No painel da Meta

Em [developers.facebook.com](https://developers.facebook.com) → seu app (tipo *Business*).

### 1.1 Token permanente

*Business Settings* → *Users* → *System users* → criar um usuário de sistema → *Generate token*.

Escolha o app, marque **sem expiração**, e as permissões:

| Permissão | Para quê |
|---|---|
| `whatsapp_business_messaging` | enviar e receber no WhatsApp |
| `whatsapp_business_management` | ler os templates |
| `pages_messaging` | Messenger e Instagram Direct |
| `pages_manage_metadata` | inscrever o app nos eventos da página |

Token de usuário comum expira em 60 dias e derruba o canal sem aviso. O verificador reprova token
com menos de 7 dias de validade justamente por isso.

### 1.2 Os ids

Anote, sem confundir um com o outro:

| Id | Onde acha |
|---|---|
| **Phone number ID** | *WhatsApp* → *API Setup* — **não** é o número de telefone |
| **WhatsApp Business Account ID** (WABA) | mesma tela, acima do número |
| **App Secret** | *Settings* → *Basic* → *App Secret* → *Show* |
| **Page ID** | *Settings* → *Basic* da página, ou *Sobre* na página |

### 1.3 Verify token

Invente um. É um segredo compartilhado que serve só para a Meta provar, no cadastro, que está
falando com quem devia. Gere um de verdade:

```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### 1.4 Cadastrar o webhook

*WhatsApp* → *Configuration* → *Webhook* → *Edit*:

- **Callback URL**: a da tabela acima
- **Verify token**: o do passo 1.3

Ao salvar, a Meta faz um `GET` na URL com `hub.challenge` e espera o valor de volta em texto puro.
**Configure a plataforma antes (passo 2)** — sem o canal ativo com o mesmo verify token, esse
handshake responde 403 e a Meta recusa o cadastro.

Depois de salvar, em *Webhook fields*, assine **`messages`**. Sem isso a URL está cadastrada e a
Meta nunca chama.

Para Messenger e Instagram, o mesmo em *Messenger* → *Settings* → *Webhooks*, campo `messages`, e
a página precisa estar inscrita no app.

---

## 2. Na plataforma

*Configurações* → *Canais* → o canal desejado. Preencha:

| Campo | Valor |
|---|---|
| Access token | o token do passo 1.1 |
| App secret | o do passo 1.2 |
| Verify token | o do passo 1.3 |
| Phone number ID | WhatsApp |
| Page ID / IG user ID | Messenger e Instagram |
| Fila | onde as conversas novas entram |

Só então marque **Ativo**. A API recusa ativar sem os três segredos — de propósito: canal ativo e
incompleto responderia 503 à Meta, que reentregaria em laço.

Os quatro segredos ficam cifrados em repouso e a listagem só devolve máscara. Depois de salvar,
você não consegue lê-los de volta pela tela — guarde-os no seu gerenciador de senhas.

---

## 3. Verificar, antes de esperar mensagem de cliente

```
npm run verificar:meta -- apps/api/.env.meta
```

Crie o `apps/api/.env.meta` com as chaves abaixo (`.env.*` está no `.gitignore`; o script nunca
imprime nenhuma delas, nem mascarada):

```
META_ACCESS_TOKEN=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=
META_PAGE_ID=
```

O que ele confere, nesta ordem:

**Na Meta** — token válido, sem expiração próxima e com os escopos de mensageria; o número existe,
está verificado e a qualidade não está em `RED` (qualidade vermelha significa entrega limitada: a
plataforma funciona e as mensagens somem); o app está **inscrito** na conta business e na página,
com o campo `messages`; e quais templates estão aprovados, em análise ou recusados — isso cobre a
pendência 2.2.

**Na plataforma** — o mesmo handshake `GET` que a Meta faz ao cadastrar a URL, para você descobrir
que o verify token não bate **antes** de a Meta recusar o cadastro; assinatura errada recusada com
401; e a assinatura real aceita.

**Ele não escreve nada.** As duas verificações que tocam a produção foram escolhidas para isso: o
handshake é um `GET`, e o `POST` leva um payload de **status de entrega**, que o parser normaliza
para zero mensagens. O caminho da assinatura é exercitado inteiro, com o App Secret real, e
nenhuma conversa aparece na tela.

O que os símbolos querem dizer: `ok` passou, `FALHOU` bloqueia, `--` foi pulado porque a
credencial daquele canal não está no arquivo (não é falha — é normal se você só usa WhatsApp).

### Provar o canal de saída

O verificador não envia mensagem por padrão: isso gasta janela de atendimento e aparece no telefone
de alguém. Quando quiser:

```
npm run verificar:meta -- apps/api/.env.meta --enviar 5551999999999
```

Fora da janela de 24h, a Meta recusa texto puro e o script reporta isso como esperado, não como
falha — é o comportamento correto dela. Para provar de verdade, peça ao destinatário que escreva
primeiro, ou use um template aprovado.

---

## 4. O teste que fecha a pendência

Nenhum script substitui este:

1. Pelo seu celular, mande uma mensagem para o número do WhatsApp Business.
2. A conversa deve aparecer em *Conversas*, em espera, na fila configurada, com o seu nome de
   perfil.
3. Assuma a conversa e responda pela plataforma.
4. A resposta deve chegar no seu celular.

Ida e volta completas, com mensagem de gente. **Só depois disso a pendência 2.1 sai da lista** — e
foi por isso que o softphone (item 3.1) não foi construído às cegas: um canal que nunca entregou
nada aparenta estar pronto sem estar.

---

## Se der errado

| Sintoma | Causa provável |
|---|---|
| Meta recusa o cadastro do webhook | verify token diferente do gravado no canal, ou canal inativo. Rode o verificador: o handshake acusa antes |
| Cadastro aceito, mensagem nunca chega | o app não está inscrito no campo `messages`. O verificador acusa |
| `401 ASSINATURA_INVALIDA` no log | App Secret gravado no canal é de outro app |
| `503 CANAL_INDISPONIVEL` | canal inativo, ou o `phone_number_id` da mensagem não é o do canal |
| Mensagem entra, resposta do agente falha | access token sem `whatsapp_business_messaging`, ou fora da janela de 24h |
| Anexo do Instagram não sobe | não é defeito: o canal só aceita URL, não upload. Pendência 2.4, sem solução |
