# Dependências do REA nesta máquina (2026-10-22)

REA: `rea-agents@6.5.0`, servidor MCP `rea` no escopo de usuário do Claude Code (`~/.claude.json`; backup em `~/.claude.json.bak-rea-*`). Validado com `npx -y rea-agents@6.5.0 doctor --client claude_code --json`: Ghidra, Java e JADX aprovados, registro aprovado.

## Instalado

| Provedor | Versão | Onde | Variável no registro MCP |
|---|---|---|---|
| JDK (Temurin) | 21.0.12 | `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` (winget) | `JAVA_HOME` |
| Ghidra | 12.1.4 (o REA exige 12.1.x; a 12.2 não serve) | `%USERPROFILE%\tools\rea-deps\ghidra_12.1.4_PUBLIC` | `GHIDRA_INSTALL_DIR` |
| adb (platform-tools) | 1.0.41 | winget `Google.PlatformTools` | `REA_ADB_PATH` |
| apktool | 3.0.3 | `...\rea-deps\apktool\apktool.bat` (chama o java do JDK pelo caminho absoluto) | `REA_APKTOOL_COMMAND` |
| jadx-headless-mcp | 0.7.1 | `...\rea-deps\jadx\` | `REA_JADX_MCP_JAR` |
| WABT | 1.0.42 | `...\rea-deps\wabt\wabt-1.0.42\bin` | `REA_WABT_BIN_DIRECTORY` |
| Rizin | 0.9.1 | `...\rea-deps\rizin\...\bin\rizin.exe` | `REA_RIZIN_COMMAND` |
| Chrome | 155 (já existia) | `C:\Program Files\Google\Chrome\Application\chrome.exe` | `REA_BROWSER_EXECUTABLE` |

As variáveis só valem depois de **reiniciar o Claude Code / VS Code**, porque o servidor MCP herda o ambiente na inicialização.

## Não instalável aqui

| Provedor | Motivo |
|---|---|
| TShark, Binwalk/Unblob, sigrok, pwntools, Wakaru (`recover_javascript_sources`), perfil EVM, `capture_process_scenario` | Só Linux (ou Linux/macOS), e esta máquina não tem WSL2 |
| Swift, Mach-O, plist, assinatura, asset catalog, UI nativa | Só macOS |
| Hopper, IDA, JEB | Comerciais e pagos |

Nada disso é necessário para o Nectar, que é web + Android.
