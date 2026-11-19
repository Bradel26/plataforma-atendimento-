import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_citations as cc  # noqa: E402


class CheckCitations(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name).resolve()
        (self.raiz / 'src').mkdir()
        (self.raiz / 'src' / 'a.ts').write_text(
            'linha 1\nexport function concluir() {\n  return carregarVisivel(id);\n}\n', encoding='utf-8'
        )

    def tearDown(self):
        self.tmp.cleanup()

    def rodar(self, linha):
        return cc.verificar_linha(linha, [self.raiz], {})

    def status(self, linha):
        return [s for _, s, _ in self.rodar(linha)]

    def test_citacao_valida_com_trecho(self):
        self.assertEqual(self.status('veja src/a.ts:3 `carregarVisivel(id)`'), ['OK'])

    def test_citacao_valida_sem_trecho_nao_diz_que_conferiu_conteudo(self):
        self.assertEqual(self.status('veja src/a.ts:2'), ['OK_SEM_TRECHO'])

    def test_linha_alem_do_fim_do_arquivo(self):
        # o erro real que motivou o script: arquivo curto, linha inventada
        self.assertEqual(self.status('src/a.ts:269-298'), ['LINHA_ALEM_DO_ARQUIVO'])

    def test_arquivo_inexistente(self):
        self.assertEqual(self.status('src/nao-existe.ts:1'), ['ARQUIVO_NAO_ENCONTRADO'])

    def test_trecho_que_nao_esta_no_lugar(self):
        self.assertEqual(self.status('src/a.ts:3 `requireAdmin()`'), ['TRECHO_NAO_ENCONTRADO'])

    def test_trecho_dentro_da_tolerancia(self):
        self.assertEqual(self.status('src/a.ts:1 `carregarVisivel(id)`'), ['OK'])

    def test_intervalo(self):
        self.assertEqual(self.status('src/a.ts:2-3 `concluir()`'), ['OK'])
        self.assertEqual(self.status('src/a.ts:3-2'), ['INTERVALO_INVALIDO'])

    def test_trecho_nao_e_lido_da_citacao_vizinha(self):
        # duas citacoes na mesma linha: a segunda nao pode virar "trecho" da primeira
        linha = 'src/a.ts:2, src/a.ts:3 `carregarVisivel(id)`'
        self.assertEqual(self.status(linha), ['OK_SEM_TRECHO', 'OK'])

    def test_nao_sai_da_raiz(self):
        self.assertEqual(self.status('../../etc/passwd.txt:1'), ['ARQUIVO_NAO_ENCONTRADO'])

    def test_ignora_url_e_hora(self):
        self.assertEqual(self.rodar('abra http://localhost:3000 as 12:30'), [])


if __name__ == '__main__':
    unittest.main()
