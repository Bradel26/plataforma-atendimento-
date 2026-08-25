import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { env } from '../../env';
import { getBranding } from '../branding/branding.service';

/**
 * Widget para o site do cliente.
 *
 * Uma tag e o suficiente:
 *   <script src="https://SUA-PLATAFORMA/api/widget.js" defer></script>
 *
 * O conteudo e um iframe apontando para /webchat, nao a interface injetada na
 * pagina. A escolha e deliberada: iframe isola CSS e JavaScript nos dois
 * sentidos — o site do cliente nao quebra o chat e o chat nao quebra o site —
 * e e como todo widget de atendimento sério funciona.
 */
export const widgetRoutes = Router();

widgetRoutes.get(
  '/widget.js',
  asyncHandler(async (_req, res) => {
    const branding = await getBranding();

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    // Cache curto: trocar a cor da marca nas configuracoes precisa refletir no
    // site do cliente sem esperar o cache expirar por horas.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(script({ cor: branding.corPrimaria, nome: branding.appName, origem: env.WEB_ORIGIN }));
  }),
);

const script = ({ cor, nome, origem }: { cor: string; nome: string; origem: string }) => `/**
 * Widget de atendimento — ${nome}
 * Gerado pela plataforma; nao edite, as cores vem das configuracoes.
 */
(function () {
  if (window.__atendimentoWidget) return;
  window.__atendimentoWidget = true;

  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var fila = script && script.getAttribute('data-fila');
  var titulo = (script && script.getAttribute('data-titulo')) || 'Fale com a gente';
  var url = ${JSON.stringify(origem)} + '/webchat?embed=1' + (fila ? '&fila=' + encodeURIComponent(fila) : '');

  var aberto = false;
  var quadro = null;

  var botao = document.createElement('button');
  botao.type = 'button';
  botao.setAttribute('aria-label', titulo);
  botao.textContent = '\u{1F4AC}';
  estilizar(botao, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483000',
    width: '56px', height: '56px', borderRadius: '9999px', border: 'none',
    background: ${JSON.stringify(cor)}, color: '#fff', fontSize: '24px', cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,.18)'
  });

  botao.addEventListener('click', function () {
    aberto = !aberto;
    if (aberto && !quadro) {
      quadro = document.createElement('iframe');
      quadro.src = url;
      quadro.title = titulo;
      quadro.setAttribute('allow', 'microphone');
      estilizar(quadro, {
        position: 'fixed', bottom: '88px', right: '20px', zIndex: '2147483000',
        width: 'min(380px, calc(100vw - 40px))', height: 'min(600px, calc(100vh - 120px))',
        border: 'none', borderRadius: '16px', background: '#fff',
        boxShadow: '0 12px 40px rgba(0,0,0,.22)'
      });
      document.body.appendChild(quadro);
    }
    if (quadro) quadro.style.display = aberto ? 'block' : 'none';
    botao.textContent = aberto ? '\u2715' : '\u{1F4AC}';
  });

  // O proprio chat pode pedir para fechar (botao dentro do iframe).
  window.addEventListener('message', function (evento) {
    if (evento.origin !== ${JSON.stringify(origem)}) return;
    if (evento.data === 'atendimento:fechar' && quadro) {
      aberto = false;
      quadro.style.display = 'none';
      botao.textContent = '\u{1F4AC}';
    }
  });

  function estilizar(elemento, estilos) {
    for (var chave in estilos) elemento.style[chave] = estilos[chave];
  }

  if (document.body) document.body.appendChild(botao);
  else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(botao); });
})();
`;
