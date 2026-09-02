# Subir pelo Coolify

Este é o caminho para a VPS `srv1783216.hstgr.cloud`, onde o **Coolify já está
instalado** e o Traefik dele é o dono das portas 80 e 443.

> Se a VPS não tivesse Coolify, o caminho seria o [DEPLOY.md](DEPLOY.md), com nginx próprio. Os dois
> funcionam; **não use os dois na mesma máquina** — o `preparar-servidor.sh` instalaria um nginx que
> brigaria com o Traefik pela porta 80.

---

## Por que muda o desenho

O Traefik do Coolify ocupa as portas 80 e 443 da VPS. Instalar um nginx nosso ali brigaria por elas
— por isso este caminho, e nao o do DEPLOY.md.

O padrao da casa ja esta estabelecido: **um subdominio por aplicacao**, todos apontando para a
mesma VPS (`coolify.bradel.com.br`, `nexus.bradel.com.br`). A plataforma entra como
`atendimento.bradel.com.br`, sem conflito com o Nexus.

Ainda assim, um **container unico** — a propria API serve o front compilado. Poderiam ser dois
recursos (front e API em subdominios diferentes), mas um so significa um deploy, um log, um
certificado, e nenhum `proxy_pass` entre containers. O `Dockerfile` da raiz compila os dois; os de
`apps/api` e `apps/web` continuam para o caminho com nginx.

Dois defeitos reais apareceram ao montar isso, nenhum visivel antes porque a imagem nunca havia
sido construida:

- O `CMD` roda `prisma migrate deploy`, mas o `prisma` era dependencia de desenvolvimento e a imagem
  final e instalada sem elas. A cada arranque ele tentaria baixar o CLI da internet. Corrigido:
  `prisma` passou para `dependencies`.
- Servido por nginx, o front nao passava pelo helmet. Servido pela API, passa — e o helmet proibia
  enquadrar a pagina, o que **mataria o widget** no site do cliente. Corrigido com excecao para
  `/webchat`, e travado por teste.

---

## 0. DNS: criar o subdominio

Antes de mexer no Coolify, crie o registro onde o DNS de `bradel.com.br` e gerenciado (o mesmo lugar
onde `nexus` e `coolify` foram criados):

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `atendimento` | `187.127.32.153` | o padrao |

Confira antes de seguir — o Let's Encrypt falha se o nome ainda nao apontar para a maquina:

```bash
nslookup atendimento.bradel.com.br
```

Tem que responder `187.127.32.153`. Se responder outra coisa (ou um IP de resolvedor, tipo
`208.67.222.222`), o registro ainda nao propagou.

---

## 1. No Coolify: criar o recurso

1. Abra o Coolify (o endereço que você já usa) e escolha o **Project** onde vai ficar. Pode ser o
   mesmo do Nexus — são recursos separados.
2. **+ New** → **Resource** → **Public Repository** (ou *Private Repository (with GitHub App)*, se
   quiser que ele acompanhe os commits automaticamente).
3. URL do repositório:
   ```
   https://github.com/Bradel26/plataforma-atendimento-
   ```
   Branch: `main`
4. **Build Pack**: escolha **Dockerfile**.
5. **Dockerfile Location**: `/Dockerfile` — o da raiz, não os de `apps/`.
6. **Port**: `3333`.

## 2. Domínio

No campo de domínio do recurso, coloque:

```
https://atendimento.bradel.com.br
```

O Coolify pede o certificado ao Let's Encrypt pelo Traefik automaticamente. Nada de certbot aqui.

> O Nexus usa o subdomínio dele (), então não há conflito de endereço.

## 3. Variáveis de ambiente

Na sua máquina, gere o bloco pronto para colar:

```bash
npm run env:coolify
```

Isso escreve `apps/api/.env.coolify` — o mesmo conteúdo do `.env.production`, sem comentários e sem
aspas (o Coolify engasga com os dois), já com os três ajustes de container:

| Variável | Valor no container | Por quê |
|---|---|---|
| `PORT` | `3333` | a porta que o Traefik espera |
| `WORKER_EMBUTIDO` | `true` | um container é um processo; o worker vai junto |
| `STATIC_DIR` | `../web/dist` | o front compilado dentro da imagem |
| `PUBLIC_URL` | vazio | opcional: endereço público da API, para o anexo que o motor de IA externo baixa. Vazio usa `WEB_ORIGIN` |
| `REDIS_PREFIXO` | vazio | prefixo de toda chave no Redis. **Deixe vazio na produção** e use algo como `dev` no ambiente de desenvolvimento: os dois apontam para o mesmo Upstash, e sem prefixo os dois workers disputam a mesma fila de trabalho — cada um descartando em silêncio o trabalho do outro |

No Coolify, em **Environment Variables**, abra o **Developer view** (o modo de colar em bloco), e
cole o arquivo inteiro.

> `WORKER_EMBUTIDO=true` **aqui**, ao contrário do deploy com systemd. Para separar o worker depois,
> crie um segundo recurso no Coolify com o mesmo repositório e o comando
> `node dist/src/worker.js`. Comece embutido; separe quando o volume de campanha justificar.

O arquivo gerado **não vai para o git** — o `.gitignore` cobre `.env*`.

## 4. Volume para os anexos

Sem isto, todo arquivo enviado por atendente ou cliente **desaparece no próximo deploy** — container
é descartável.

Em **Storages** → *Add volume mount*:

| Campo | Valor |
|---|---|
| Name | `plataforma-storage` |
| Destination Path | `/app/apps/api/storage` |

## 5. Deploy

Clique em **Deploy** e acompanhe o log. O que esperar, na ordem:

1. `npm ci` — alguns minutos na primeira vez
2. `prisma generate` e o build dos dois apps
3. `npm ci --omit=dev` no estágio final
4. Container subindo, com `prisma migrate deploy` no arranque
5. `Front servido por esta API a partir de ../web/dist`
6. `API ouvindo em http://localhost:3333 (production)`

As migrations vão dizer `No pending migrations to apply` — porque eu já as apliquei no banco
`producao`. Isso é o esperado, não um erro.

---

## Conferindo

Abra `https://atendimento.bradel.com.br`:

| Confira | Se falhar, olhe |
|---|---|
| a tela de login abre com cadeado | o log do Traefik e o domínio do recurso |
| `/api/health` responde `"status":"ok"` | as três URLs de banco e Redis |
| login funciona | `SEED_ADMIN_EMAIL` e a senha |
| recarregar mantém você dentro | `WEB_ORIGIN` exatamente igual ao endereço, sem barra no fim |
| o painel atualiza sem recarregar | WebSocket: o Coolify já passa `Upgrade`, mas confirme no log |

Credenciais: seu e-mail, e a senha que está em `SEED_ADMIN_PASSWORD`.

## Problemas prováveis

**Build estoura memória.** A VPS tem 8 GB e o Nexus já usa parte. Se o `npm ci` for morto pelo
sistema, use *Build Server* ou reduza a concorrência com a variável de build `NODE_OPTIONS=--max-old-space-size=2048`.

**`Authentication failed against database server`.** A senha do Neon no Coolify está desatualizada —
foi rotacionada. Copie de novo do painel do Neon.

**A tela abre mas o login dá erro de CORS.** `WEB_ORIGIN` diferente do endereço real. Tem que ser
idêntico, com `https://` e sem barra no fim.

**Tudo 404.** Domínio do recurso vazio, ou o Nexus ocupando o mesmo hostname.

**Os 1609 processos zumbi.** Não são desta plataforma — já estavam na máquina antes. Vale investigar
separadamente: processo zumbi não consome CPU, mas ocupa entrada na tabela de processos, e 1600 é
sinal de que algum serviço não está recolhendo os filhos dele.

---

## Atualizar depois

O deploy automático desta plataforma é feito pela **GitHub Action**, não pelo *Auto Deploy* do
recurso — que fica desligado de propósito, porque não filtra por CI verde. Ver a seção 8.

O ciclo é: eu mudo o código aqui, você dá `git push`, o CI verifica, e a Action manda o Coolify
construir e subir. Nenhum comando no servidor.

---

## 8. Deploy automático pela GitHub Action

### O diagnóstico, e a correção dele

O sintoma: `git push` não disparava build. Três pushes consecutivos foram acompanhados com o
`observar:deploy`, que detecta a troca de container pela queda da conexão Socket.IO:

| Push | O que o push disparou | O que o Deploy manual fez |
|---|---|---|
| `df5ffc5` (passo 1.1) | nada em 40 min de observação | rolling update, container novo em 8s |
| `fb07715` (passo 1.2) | nada | build em 1m45s, rolling update em 6s |
| `4ec9f6e` (passo 1.3) | nada | build e subida em 2m11s |

Três ocorrências idênticas, e a infraestrutura construindo e subindo bem nas três. A conclusão
registrada na época foi "o webhook do GitHub está quebrado".

> **Estava errada.** Em 02/09/2026, olhando *Configuration › Advanced › Deployment* no recurso, o
> interruptor **Auto Deploy** estava **desmarcado** — e sempre esteve. Não havia gatilho quebrado:
> não havia gatilho. Os três pushes não dispararam nada porque o recurso não estava configurado
> para escutar, e o Deploy manual funcionava porque nada nele depende do webhook.
>
> Vale o registro do erro de raciocínio: três observações idênticas descartaram *intermitência*, o
> que estava certo, mas foram lidas como prova de *defeito* — quando a explicação mais simples,
> configuração desligada, explicava os mesmos três casos e nunca foi checada. Repetição confirma
> que a causa é estável; não diz qual é.

**A Action continua sendo a escolha certa**, e não por causa do webhook. Ela implanta somente com a
suíte verde (`needs: verificar`); ligar o Auto Deploy agora subiria qualquer commit, inclusive um que
não compila. O interruptor fica desligado de propósito.

### Como funciona

O job `implantar` em [.github/workflows/ci.yml](.github/workflows/ci.yml) chama a API do Coolify
direto:

1. `needs: verificar` — o deploy só acontece com typecheck, testes e build verdes. **Isso é melhor
   que o webhook nativo**, que subiria qualquer commit, inclusive um que não compila.
2. `GET /api/v1/deploy?uuid=…` com o token no header dispara o build.
3. A Action acompanha `GET /api/v1/deployments/<uuid>` a cada 15s até `finished` ou `failed`, com
   teto de 20 minutos. Deploy que falha deixa a Action vermelha em vez de passar em silêncio.
4. Por fim confere `/api/health` na produção: um deploy que a API declara concluído mas que subiu
   um container que não atende não está concluído.

Só roda em `push` para `main` — pull request não implanta.

### Verificado em 02/09/2026

Funcionando de ponta a ponta. Execução #16: `verificar` verde em 49s, `implantar` verde em 2m37s, e
as 31 verificações do `npm run validar:producao` passando depois, contra o container novo.

O UUID `zios6of26x7kizkh57fxw62t` foi **confirmado pela API**, não mais deduzido do domínio: é o
único dos 18 recursos do painel apontando para `Bradel26/plataforma-atendimento- @ main`. Nenhuma
*variable* `COOLIFY_UUID` é necessária.

### Já configurado (não precisa repetir)

**O token.** *Keys & Tokens* → *API Tokens*, com as permissões **`deploy` e `read` juntas**.
Cuidado: na tela do Coolify, marcar uma **desmarca** a outra — confira a coluna PERMISSIONS em
*Issued Tokens* antes de sair. Só `deploy` dispara o build mas cega o acompanhamento, e a Action
terminaria vermelha depois de um deploy bem-sucedido.

O valor está no segredo `COOLIFY_TOKEN` do repositório (*Settings* → *Secrets and variables* →
*Actions*). Ele expira em **02/09/2027** — quando chegar perto, crie outro e atualize o segredo pelo
ícone de lápis.

> **Copie o token com Ctrl+C da tela, nunca transcrevendo de uma captura.** As duas primeiras
> execuções falharam com `401` exatamente por isso: o valor foi lido de um print, e `O`/`0` e
> `1`/`l`/`I` são indistinguíveis em pixels. O defeito não estava na Action.

**Enquanto o segredo não existir, a Action avisa e não falha.** Um X vermelho em todo push antes de
o token existir ensina a ignorar o resultado do CI — justamente o hábito que causa deploy esquecido.

### Nada pendente

O *Auto Deploy* do recurso está **desmarcado** (*Configuration › Advanced › Deployment*), conferido
em 02/09/2026, e é assim que deve ficar: ligá-lo criaria um segundo gatilho no mesmo push, e um que
não filtra por CI verde. Só a Action implanta.

### Sobrescrever sem mexer no código

Três *variables* do repositório, todas opcionais:

| Variable | Padrão |
|---|---|
| `COOLIFY_URL` | `https://coolify.bradel.com.br` |
| `COOLIFY_UUID` | `zios6of26x7kizkh57fxw62t` |
| `PRODUCAO_URL` | `https://zios6of26x7kizkh57fxw62t.187.127.32.153.sslip.io` |

Quando o item 1.4 (domínio próprio) for resolvido, `PRODUCAO_URL` é o único lugar a mudar.
