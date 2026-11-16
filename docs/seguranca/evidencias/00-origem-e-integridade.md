# Origem e integridade do `embedded-postgres` usado nos testes de integração (2026-11-16)

Instalado **fora do repositório** (pasta temporária da sessão), com `--ignore-scripts` e versão exata. Não consta em nenhum `package.json` do projeto.

| Verificação | Resultado | Como foi obtido |
|---|---|---|
| Pacote e versão | `embedded-postgres@16.15.0-beta.19` + `@embedded-postgres/windows-x64@16.15.0-beta.19` | `npm install --save-exact` |
| Idade da publicação | 2026-10-30 (17 dias na data do teste; mínimo exigido: 2 semanas) | `npm view ... time` |
| Origem declarada | `github.com/leinelissen/embedded-postgres`, licença MIT, mantenedor `leinelissen` | `npm view` |
| Integridade (hash do lock = hash publicado no registro) | **24 de 24 pacotes IGUAIS, 0 divergentes** | script `verificar_integridade.mjs` (Node), comparando `package-lock.json` com `npm view <pkg>@<ver> dist.integrity` |
| Assinaturas do registro npm | **17 pacotes com assinatura de registro verificada** | `npm audit signatures` |
| Scripts de instalação | `postinstall: hydrate-symlinks.js` no pacote de plataforma; lido: apenas recria symlinks (no Windows não faz nada útil). Foi pulado por `--ignore-scripts`. | leitura do arquivo |
| Executáveis | `postgres.exe`, `initdb.exe`, `pg_ctl.exe` identificam-se como **PostgreSQL 16.15**. **Sem assinatura Authenticode** (`NotSigned`). SHA-256 de `postgres.exe`: `8192A1B2E02F9546B4FC775519C5CA719F2BFA1D6A4A7AC6F3258C5E4DA39E5D` | `Get-AuthenticodeSignature`, `Get-FileHash` |

**Limite desta verificação (TECHNICAL_SUSPICION):** a cadeia npm (registro, hash e assinatura) está íntegra, mas os binários **não** foram comparados com os do distribuidor oficial do PostgreSQL, e não são assinados. Aceitável para um banco descartável em loopback, sob usuário comum, com dados em diretório temporário apagado ao final; **não** é base para usar esses binários fora deste contexto.

Contenção usada: escuta apenas em `127.0.0.1:55432`, banco `plataforma_teste`, usuário/senha temporários `teste`, cluster em UTF8, diretório de dados em `%TEMP%` removido ao encerrar.
