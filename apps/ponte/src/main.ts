import type { WAMessage } from '@whiskeysockets/baileys';
import { config } from './config.js';
import { GerenciadorDeContatos } from './contatos.js';
import { avisarStatus, entregarContatos } from './plataforma.js';
import { receber } from './recebida.js';
import { criarServidor } from './servidor.js';
import { garantirNoAr, quandoMudarStatus, quandoReceber, quandoReceberContatos, type Sessao } from './sessao.js';

/**
 * Sobe a ponte.
 *
 * A costura entre a sessao e a plataforma acontece aqui, e nao dentro de
 * `sessao.ts`: assim o modulo que fala com o WhatsApp nao conhece a plataforma,
 * e da para testar um sem o outro.
 */

quandoReceber((sessao, msg) => {
  void receber(sessao as Sessao, msg as WAMessage);
});

quandoMudarStatus((sessao) => {
  void avisarStatus(sessao.nome, sessao.situacao === 'CONECTADO' ? 'CONECTADO' : 'DESCONECTADO', sessao.detalhe);
});

/*
 * Um gerenciador de debounce POR SESSAO: contato de um vendedor nunca pode
 * entrar acumulado junto com o de outro, senao a entrega marcaria a sessao
 * errada no corpo do POST.
 */
const gerenciadoresDeContatos = new Map<string, GerenciadorDeContatos>();

quandoReceberContatos((sessao, contatos) => {
  let gerenciador = gerenciadoresDeContatos.get(sessao.nome);
  if (!gerenciador) {
    gerenciador = new GerenciadorDeContatos((acumulados) => {
      void entregarContatos(sessao.nome, acumulados);
    });
    gerenciadoresDeContatos.set(sessao.nome, gerenciador);
  }
  gerenciador.adicionar(contatos);
});

const app = criarServidor();

app.listen(config.porta, () => {
  console.log('[ponte] ouvindo na porta ' + config.porta);
  console.log('[ponte] entrego em ' + config.plataformaUrl + '/api/webhooks/ponte/whatsapp/' + config.organizacaoId);

  /*
   * Sobe a sessao padrao junto com o processo.
   *
   * Sem isto, um restart deixaria o WhatsApp mudo ate alguem abrir a tela de
   * Canais — e o sintoma seria "o cliente mandou e ninguem viu", que ninguem
   * liga a um container que reiniciou de madrugada. Como as credenciais estao
   * em disco, reconectar nao pede QR nenhum.
   */
  void garantirNoAr(config.sessaoPadrao).catch((err) => {
    console.error('[ponte] nao consegui subir a sessao padrao:', err);
  });
});

/*
 * Rede instavel derruba promessa solta em qualquer biblioteca de socket. Sair do
 * processo por causa disso desconecta o numero da empresa, entao registra alto e
 * segue: a sessao se reconecta sozinha, e o log fica para quem for investigar.
 */
process.on('unhandledRejection', (motivo) => {
  console.error('[ponte] promessa rejeitada sem tratamento:', motivo);
});
