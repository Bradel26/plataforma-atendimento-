# Subir em produção — Hostinger KVM 2

Passo a passo para o servidor que você já tem:

- **Host:** `srv1783216.hstgr.cloud`
- **IP:** `187.127.32.153`

Cobre os dois itens que você escolheu: **domínio com certificado** e **migrations em produção**.
Docker não entra — nesta VPS a aplicação roda direto com Node, que é o caminho já verificado.

---

## Antes de tudo: você não precisa comprar domínio hoje

O hostname que a Hostinger te deu **já resolve para o seu IP** — conferi:

```
srv1783216.hstgr.cloud → 187.127.32.153
```

Isso é suficiente para emitir certificado gratuito e ter HTTPS funcionando hoje, inclusive para o
webhook da Meta. Use `srv1783216.hstgr.cloud` para validar tudo, e troque por
`atendimento.suaempresa.com.br` quando quiser — a troca é uma linha no nginx, um `certbot` novo e
uma variável no `.env.production`.

Se preferir já usar domínio próprio, crie antes um registro **A** apontando para `187.127.32.153`
(e opcionalmente **AAAA** para o IPv6 que o host também tem). Espere o DNS propagar antes de pedir
o certificado — o certbot falha se o nome ainda não apontar para a máquina.

---

## 1. Rotacione as credenciais (5 minutos, e é o mais importante)

As credenciais atuais do Neon e do Upstash passaram por conversa de texto. Antes de colocá-las num
servidor exposto à internet:

1. **Neon** → painel do projeto → *Roles* → resete a senha do usuário. Copie as duas strings de
   conexão: a **pooled** e a **direta**.
2. **Upstash** → painel do banco → *Details* → role a senha. Copie a URL `rediss://`.

Guarde as quatro coisas: `DATABASE_URL` (pooled), `DIRECT_URL` (direta), `REDIS_URL`.

## 2. Gere o arquivo de segredos (na sua máquina)

> **PowerShell bloqueando o npm?** A mensagem *"npm.ps1 não pode ser carregado porque a execução
> de scripts foi desabilitada"* é política do Windows, não erro do projeto. Duas saídas:
>
> ```powershell
> npm.cmd run gerar:segredos          # contorna, sem mudar nada no sistema
> ```
>
> ou libere de uma vez, só para o seu usuário (não precisa de administrador):
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```


```bash
npm run gerar:segredos
```

Isso escreve `apps/api/.env.production` com JWT, chave de cifragem e senha do admin, todos
sorteados. **Anote a senha do admin que ele imprime** — depois só existe o hash.

Abra o arquivo e preencha as cinco linhas que faltam:

```env
DATABASE_URL="postgresql://...pooler..."      # do Neon, pooled
DIRECT_URL="postgresql://...direct..."        # do Neon, direta
REDIS_URL="rediss://...upstash.io:6379"       # do Upstash
WEB_ORIGIN="https://srv1783216.hstgr.cloud"   # com https, sem barra no fim
SEED_ADMIN_EMAIL="voce@suaempresa.com.br"     # nao pode ser @plataforma.local
```

Confira também, no mesmo arquivo:

```env
TRUST_PROXY=true            # tem nginx na frente; sem isso o limite por IP ve o IP do nginx
WORKER_EMBUTIDO=false       # vamos rodar o worker como servico separado
```

> Esse arquivo **não vai para o git** (o `.gitignore` cobre `.env*`). Você vai copiá-lo para o
> servidor por SSH, no passo 5.

---

## 3. Prepare o servidor

> **Tudo deste passo em diante roda no servidor, não na sua máquina.** Os scripts `.sh` são de
> Linux: no PowerShell eles dão *"não é reconhecido como nome de cmdlet"*, que é o Windows dizendo
> que não sabe o que fazer com eles. Entre por SSH primeiro.


Entre por SSH (a Hostinger mostra a senha do root no painel; troque-a no primeiro acesso):

```bash
ssh root@187.127.32.153
```

Clone o repositório e rode o preparador:

```bash
apt-get update && apt-get install -y git
git clone SEU_REPOSITORIO /opt/plataforma
bash /opt/plataforma/scripts/deploy/preparar-servidor.sh srv1783216.hstgr.cloud
```

O script instala Node 22, nginx, certbot e git; fecha o firewall deixando só SSH, 80 e 443; cria o
usuário de serviço `plataforma`; e põe o nginx de pé em HTTP.

**A porta 3333 fica fechada de propósito.** Quem fala com a API é o nginx, por `127.0.0.1`. Expor a
API direto derrubaria o HTTPS e faria o limite por IP ver o IP errado.

## 4. Certificado HTTPS

```bash
certbot --nginx -d srv1783216.hstgr.cloud
```

O certbot valida o domínio, emite o certificado e **reescreve o nginx** para HTTPS com redirecionamento
do HTTP. Ele também instala a renovação automática — confira com:

```bash
systemctl status certbot.timer
certbot renew --dry-run
```

Certificado Let's Encrypt vale 90 dias e renova sozinho aos 60. Se o `--dry-run` falhar, resolva
agora: em três meses ninguém vai lembrar.

## 5. Leve os segredos e publique

Na **sua máquina**, copie o arquivo de segredos:

```bash
scp apps/api/.env.production root@187.127.32.153:/opt/plataforma/apps/api/.env.production
```

No **servidor**, ajuste o dono e a permissão — o arquivo tem a chave que decifra todos os segredos
de canal:

```bash
chown plataforma:plataforma /opt/plataforma/apps/api/.env.production
chmod 600 /opt/plataforma/apps/api/.env.production
```

Instale os serviços e publique:

```bash
cp /opt/plataforma/scripts/deploy/plataforma-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable plataforma-api plataforma-worker

bash /opt/plataforma/scripts/deploy/publicar.sh
```

O `publicar.sh` faz, nesta ordem: `npm ci`, gera o Prisma, compila, **roda as migrations**, copia o
front para o nginx e reinicia os serviços. A ordem importa — reiniciar antes de migrar deixaria a
aplicação nova falando com um banco velho.

## 6. As migrations (o item 1.6)

Elas rodam dentro do `publicar.sh`, mas vale entender o que aconteceu:

```bash
cd /opt/plataforma
sudo -u plataforma env NODE_ENV=production npm run db:deploy -w @plataforma/api
```

`prisma migrate deploy` aplica, em ordem, as 10 migrations que estão em
`apps/api/prisma/migrations`. Ele usa a `DIRECT_URL` sozinho, porque o schema declara `directUrl`.

Três coisas importantes:

- **É idempotente.** Rodar de novo não repete o que já foi aplicado; ele consulta a tabela
  `_prisma_migrations` no próprio banco.
- **Nunca use `migrate dev` em produção.** Ele é interativo e pode propor apagar dados.
- **Nunca aponte `--shadow-database-url` para um banco com dados.** Isso já destruiu o banco de
  desenvolvimento deste projeto uma vez.

## 7. Crie o usuário admin

```bash
cd /opt/plataforma
sudo -u plataforma env NODE_ENV=production npm run db:seed -w @plataforma/api
```

Em produção o seed **exige** senha forte e domínio real, cria **apenas o admin** (sem os usuários de
demonstração) e não imprime a senha. Se ele recusar, a mensagem diz exatamente qual variável
corrigir.

Entre em `https://srv1783216.hstgr.cloud` com o e-mail e a senha que você anotou no passo 2, e crie
supervisores e agentes pela tela de *Configurações → Usuários*.

---

## Conferindo que subiu

```bash
# A API responde e alcanca banco e Redis?
curl -s https://srv1783216.hstgr.cloud/api/health

# Esperado:
# {"status":"ok","dependencias":{"postgres":"ok","redis":"ok"},"versao":"0.1.0"}
```

Depois, no navegador:

| Confira | Por que importa |
|---|---|
| `https://srv1783216.hstgr.cloud` abre com cadeado | certificado válido e nginx servindo o front |
| Login funciona | JWT e banco de produção conversando |
| Recarregar a página mantém você dentro | cookie de sessão com `secure` funcionando em HTTPS |
| Abrir `/webchat` em janela anônima e mandar mensagem | WebSocket atravessando o proxy |
| A mensagem aparece no painel sem recarregar | `/socket.io/` com upgrade correto no nginx |

Se algo falhar, o log está em:

```bash
journalctl -u plataforma-api -n 100 --no-pager
journalctl -u plataforma-worker -n 50 --no-pager
tail -50 /var/log/nginx/error.log
```

## Problemas que costumam aparecer

**A API não sobe e o log fala de segredo de exemplo.** É a proteção de arranque funcionando:
`NODE_ENV=production` recusa subir com os valores do `.env.example`. Confira o `.env.production`.

**Login funciona, mas recarregar derruba.** `WEB_ORIGIN` diferente do endereço real, ou com barra no
fim. O cookie de sessão é amarrado nessa origem.

**Limite por IP bloqueando todo mundo junto.** Falta `TRUST_PROXY=true` — sem ele a API vê o IP do
nginx em todas as requisições e conta como se fosse uma pessoa só.

**Certbot falha dizendo que não alcançou o domínio.** DNS ainda não propagou, ou a porta 80 está
fechada. Confira com `ufw status` e `dig +short SEU_DOMINIO`.

**O WebSocket não conecta (o painel não atualiza sozinho).** O bloco `location /socket.io/` precisa
do `proxy_http_version 1.1` e dos headers de `Upgrade`. O certbot não mexe nesses blocos, mas vale
conferir depois que ele reescreve o arquivo.

---

## Depois disso

Com a plataforma de pé em HTTPS, o próximo item da lista deixa de estar bloqueado: o **webhook da
Meta** exige exatamente isso — um endereço HTTPS público e alcançável. A URL a informar no painel da
Meta será:

```
https://srv1783216.hstgr.cloud/api/webhooks/whatsapp
https://srv1783216.hstgr.cloud/api/webhooks/instagram
https://srv1783216.hstgr.cloud/api/webhooks/facebook
```

Uma URL por canal — cada um tem token de verificação e segredo próprios, configurados em
*Configurações → Canais*.

O passo a passo da Meta (empresa verificada, número dedicado, token, templates) está em
[PENDENCIAS.md](PENDENCIAS.md), grupo 2.

Duas coisas para não esquecer no médio prazo:

- **Backup.** O Neon tem *point-in-time restore* no plano pago; no gratuito, não. Se o banco for
  virar operação de verdade, isso deixa de ser opcional. E se algum dia você restaurar um backup,
  rode `npm run lgpd:reaplicar` — restaurar traz de volta dado que titulares pediram para apagar.
- **Anexos.** Ficam em `/opt/plataforma/apps/api/storage`, no disco da VPS. Entram no seu backup de
  máquina, não no do banco.
