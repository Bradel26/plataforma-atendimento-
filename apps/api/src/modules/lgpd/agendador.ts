import { redis } from '../../lib/redis';
import { registrarErro } from '../../lib/redacao';
import { executarExpurgo } from './expurgo.service';
import { obterPolitica } from './lgpd.service';

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Expurgo diario, se a politica estiver ativa.
 *
 * O lock no Redis existe porque duas instancias da API acordariam ao mesmo
 * tempo e rodariam o expurgo em paralelo. Nao e cron externo por uma razao
 * simples: a plataforma ja depende de Redis e nao depende de agendador do
 * sistema operacional. Para volume grande, o certo e tirar isto do processo web.
 */
export function agendarExpurgo() {
  const rodar = async () => {
    try {
      const politica = await obterPolitica();
      if (!politica.ativa) return;

      const dono = await redis.set('lgpd:expurgo:lock', String(process.pid), 'EX', 3600, 'NX');
      if (!dono) return;

      const resumo = await executarExpurgo({ simulacao: false, autorId: null });
      console.log(
        `[lgpd] expurgo automatico: ${resumo.mensagens} mensagens, ${resumo.titulares} titulares anonimizados`,
      );
    } catch (err) {
      registrarErro('[lgpd] expurgo automatico falhou:', err);
    }
  };

  // Espera um minuto para nao competir com o arranque da aplicacao.
  setTimeout(() => void rodar(), 60_000).unref();
  setInterval(() => void rodar(), UM_DIA).unref();
}
