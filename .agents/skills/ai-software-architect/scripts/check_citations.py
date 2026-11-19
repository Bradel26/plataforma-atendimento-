"""Mechanical check of the citations in an audit report.

Usage:
    python check_citations.py REPORT.md [--root DIR ...]

For every `path:line` or `path:start-end` found in the report it checks:
  1. the file exists under one of the --root directories (default: current dir);
  2. the line (range) is within the file's length;
  3. when a snippet follows the citation on the same line, wrapped in backticks or
     double quotes, that the snippet appears within 3 lines of the cited range.

WHAT THIS DOES NOT DO: it does not read the code for meaning. A citation that
passes can still support the wrong conclusion. It only catches citations that
point at nothing (missing file, line beyond end of file, snippet not there) —
exactly the failures a reviewer cannot see without opening each file.

Read-only. Exit code 1 if any citation is invalid.
"""
import argparse
import re
import sys
from pathlib import Path, PurePosixPath

TOLERANCIA = 3  # linhas de folga para o trecho citado

# caminho com extensao, ':' e linha ou intervalo. Evita URLs (http://host:80) e horas (12:30).
CITACAO = re.compile(r'(?<![\w/])((?:[A-Za-z]:)?[\w.\-/\\]+\.[A-Za-z0-9]{1,6}):(\d+)(?:-(\d+))?')
TRECHO = re.compile(r'`([^`]{3,})`|"([^"]{3,})"')


def normalizar(texto: str) -> str:
    return re.sub(r'\s+', ' ', texto).strip()


def resolver(caminho: str, raizes: list[Path]) -> Path | None:
    candidato = caminho.replace('\\', '/')
    # Rejeita ANTES de tocar o sistema de arquivos: caminho absoluto, UNC (//host/share,
    # que no Windows faz resolve() acessar a rede e vazar credenciais NTLM), letra de
    # unidade e qualquer '..'. O relatorio auditado e entrada nao confiavel.
    partes = PurePosixPath(candidato)
    if (
        not candidato
        or candidato.startswith('/')
        or re.match(r'^[A-Za-z]:', candidato)
        or '..' in partes.parts
        or '\x00' in candidato
    ):
        return None
    for raiz in raizes:
        raiz_real = raiz.resolve()
        alvo = (raiz_real / candidato).resolve()
        try:
            alvo.relative_to(raiz_real)
        except ValueError:
            continue  # nunca sair da raiz (ex.: symlink que aponta para fora)
        if alvo.is_file():
            return alvo
    return None


def verificar_linha(linha: str, raizes: list[Path], cache: dict[Path, list[str]]):
    """Devolve (citacao, status, detalhe) para cada citacao da linha."""
    resultados = []
    achadas = list(CITACAO.finditer(linha))
    for i, m in enumerate(achadas):
        # O trecho de uma citacao vai ate a proxima citacao da mesma linha: sem
        # isso, o texto da vizinha seria lido como se fosse o trecho desta.
        limite = achadas[i + 1].start() if i + 1 < len(achadas) else len(linha)
        caminho, ini, fim = m.group(1), int(m.group(2)), m.group(3)
        fim_n = int(fim) if fim else ini
        rotulo = f'{caminho}:{ini}' + (f'-{fim_n}' if fim else '')

        if fim_n < ini or ini < 1:
            resultados.append((rotulo, 'INTERVALO_INVALIDO', 'linha inicial < 1 ou final < inicial'))
            continue
        arquivo = resolver(caminho, raizes)
        if arquivo is None:
            resultados.append((rotulo, 'ARQUIVO_NAO_ENCONTRADO', 'nao existe sob as raizes informadas'))
            continue
        if arquivo not in cache:
            cache[arquivo] = arquivo.read_text(encoding='utf-8', errors='replace').splitlines()
        linhas = cache[arquivo]
        if fim_n > len(linhas):
            resultados.append((rotulo, 'LINHA_ALEM_DO_ARQUIVO', f'o arquivo tem {len(linhas)} linhas'))
            continue

        depois = linha[m.end():limite]
        t = TRECHO.search(depois)
        if not t:
            resultados.append((rotulo, 'OK_SEM_TRECHO', 'arquivo e intervalo existem; nenhum trecho informado para conferir'))
            continue
        trecho = normalizar(t.group(1) or t.group(2))
        janela = normalizar(' '.join(linhas[max(0, ini - 1 - TOLERANCIA): fim_n + TOLERANCIA]))
        if trecho in janela:
            resultados.append((rotulo, 'OK', 'trecho encontrado no intervalo citado'))
        else:
            resultados.append((rotulo, 'TRECHO_NAO_ENCONTRADO', f'"{trecho[:60]}" nao aparece em +-{TOLERANCIA} linhas'))
    return resultados


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description='Confere arquivo, intervalo de linhas e trecho das citacoes de um relatorio.')
    ap.add_argument('relatorio', type=Path)
    ap.add_argument('--root', type=Path, action='append', default=None, help='raiz para resolver caminhos relativos (repetivel)')
    args = ap.parse_args(argv)

    raizes = [r.resolve() for r in (args.root or [Path.cwd()])]
    texto = args.relatorio.read_text(encoding='utf-8', errors='replace')
    cache: dict[Path, list[str]] = {}
    todos = []
    for linha in texto.splitlines():
        todos.extend(verificar_linha(linha, raizes, cache))

    invalidos = [r for r in todos if not r[1].startswith('OK')]
    for rotulo, status, detalhe in todos:
        print(f'{status:<24} {rotulo}  {detalhe}')
    print()
    print(f'{len(todos)} citacoes, {len(invalidos)} invalidas.')
    print('Aviso: so confere existencia do arquivo, limite de linhas e presenca do trecho. NAO valida a conclusao semantica.')
    return 1 if invalidos else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
