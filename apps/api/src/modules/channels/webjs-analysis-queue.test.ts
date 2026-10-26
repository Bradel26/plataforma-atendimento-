import { describe, expect, it } from 'vitest';
import { RecordingAnalysisQueue } from '../../../../../experimentos/whatsapp-webjs-call-poc/analysis-queue.mjs';

const aguardar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RecordingAnalysisQueue', () => {
  it('executa análises de gravações diferentes uma por vez', async () => {
    const queue = new RecordingAnalysisQueue({ pollIntervalMs: 2 });
    let ativas = 0;
    let pico = 0;
    const executar = (key: string) => queue.run(key, () => false, async () => {
      ativas += 1;
      pico = Math.max(pico, ativas);
      await aguardar(10);
      ativas -= 1;
      return key;
    });

    await expect(Promise.all([executar('a'), executar('b'), executar('c')])).resolves.toEqual(['a', 'b', 'c']);
    expect(pico).toBe(1);
  });

  it('compartilha o trabalho de pedidos simultâneos para a mesma gravação', async () => {
    const queue = new RecordingAnalysisQueue({ pollIntervalMs: 2 });
    let execucoes = 0;
    const tarefa = async () => { execucoes += 1; await aguardar(10); return { transcript: 'feito' }; };

    const resultados = await Promise.all([
      queue.run('mesma', () => false, tarefa),
      queue.run('mesma', () => false, tarefa),
    ]);

    expect(resultados).toEqual([{ transcript: 'feito' }, { transcript: 'feito' }]);
    expect(execucoes).toBe(1);
  });

  it('aguarda o fim de uma chamada antes de começar a análise', async () => {
    const queue = new RecordingAnalysisQueue({ pollIntervalMs: 2 });
    let chamadaAtiva = true;
    let iniciou = false;
    const pending = queue.run('call', () => chamadaAtiva, async () => { iniciou = true; return 'ok'; });

    await aguardar(10);
    expect(iniciou).toBe(false);
    chamadaAtiva = false;
    await expect(pending).resolves.toBe('ok');
    expect(iniciou).toBe(true);
  });

  it('libera a fila quando uma análise falha', async () => {
    const queue = new RecordingAnalysisQueue({ pollIntervalMs: 2 });
    await expect(queue.run('falha', () => false, async () => { throw new Error('transcriber'); })).rejects.toThrow('transcriber');
    await expect(queue.run('seguinte', () => false, async () => 'ok')).resolves.toBe('ok');
  });
});
