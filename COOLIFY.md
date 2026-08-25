# Subir pelo Coolify

Este é o caminho para a VPS `srv1783216.hstgr.cloud`, onde o **Coolify já está
instalado** e o Traefik dele é o dono das portas 80 e 443.

> Se a VPS não tivesse Coolify, o caminho seria o [DEPLOY.md](DEPLOY.md), com nginx próprio. Os dois
> funcionam; **não use os dois na mesma máquina** — o `preparar-servidor.sh` instalaria um nginx que
> brigaria com o Traefik pela porta 80.

---

## Por que muda o desenho

O Traefik ocupa 80 e 443, e o hostname `srv1783216.hstgr.cloud` é da Hostinger — você não controla o
DNS dele, então **não pode criar subdomínios** como `api.srv1783216...`. Sem subdomínio, não dá para
publicar front e API em dois endereços.

A solução é um **container único**: a própria API serve o front compilado. Um endereço, um serviço,
nada de roteamento por caminho no proxy.

Isso está pronto no repositório: o `Dockerfile` da **raiz** compila os dois e sobe um container só.
Os Dockerfiles de `apps/api` e `apps/web` continuam existindo para o caminho com nginx.

Dois defeitos foram encontrados ao montar isso — nenhum aparecia antes porque a imagem nunca havia
sido construída:

- O `CMD` roda `prisma migrate deploy`, mas o `prisma` era dependência de desenvolvimento e a imagem
  final é instalada sem elas. A cada arranque ele tentaria baixar o CLI da internet. Corrigido:
  `prisma` passou para `dependencies`.
- Servido por nginx, o front não passava pelo helmet. Servido pela API, passa — e o helmet proibia
  enquadrar a página, o que **mataria o widget** no site do cliente. Corrigido com exceção para
  `/webchat`, e travado por teste.

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
https://srv1783216.hstgr.cloud
```

O Coolify pede o certificado ao Let's Encrypt pelo Traefik automaticamente. Nada de certbot aqui.

> **Cuidado:** se o Nexus já usa esse mesmo hostname, os dois vão brigar pelo endereço. Nesse caso
> você precisa de um domínio próprio (um registro **A** para `187.127.32.153`), ou publicar a
> plataforma num caminho — e caminho traz complicação com o WebSocket. Confira antes o que o Nexus
> está usando.

## 3. Variáveis de ambiente

Em **Environment Variables**, cole o conteúdo do seu `apps/api/.env.production` — o Coolify aceita
colar tudo de uma vez no modo *Developer view*. São estas as que importam:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3333` |
| `DATABASE_URL` | a string **pooled** do Neon, banco `producao` |
| `DIRECT_URL` | a string **direta** do Neon, banco `producao` |
| `REDIS_URL` | a URL `rediss://` do Upstash |
| `WEB_ORIGIN` | `https://srv1783216.hstgr.cloud` |
| `JWT_ACCESS_SECRET` | o gerado |
| `JWT_REFRESH_SECRET` | o gerado |
| `SECRETS_KEY` | o gerado |
| `TRUST_PROXY` | `true` — tem Traefik na frente |
| `WORKER_EMBUTIDO` | `true` — **aqui sim**, veja abaixo |
| `STORAGE_DIR` | `./storage` |
| `SEED_ADMIN_EMAIL` | seu e-mail |
| `SEED_ADMIN_PASSWORD` | a senha gerada |

**`WORKER_EMBUTIDO=true` neste caminho**, ao contrário do deploy com systemd. Um container = um
processo; para separar o worker você criaria um segundo recurso no Coolify com o mesmo repositório e
comando `node dist/src/worker.js`. Comece embutido; separe quando o volume de campanha justificar.

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

Abra `https://srv1783216.hstgr.cloud`:

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

Com o repositório conectado, cada `git push` para `main` pode disparar deploy automático (ligue
*Auto Deploy* no recurso). Sem isso, é clicar em **Redeploy**.

O ciclo passa a ser: eu mudo o código aqui, você dá `git push`, o Coolify constrói e sobe. Nenhum
comando no servidor.
