/**
 * Smoke test dos indicadores da gestao.
 *
 * O dashboard e a tela que decide se a operacao esta bem, e era a unica area
 * sem cobertura ponta a ponta: os numeros eram conferidos a olho. Aqui eles
 * sao conferidos por delta — mexe-se numa conversa de verdade e verifica-se
 * que o indicador andou exatamente o quanto devia.
 *
 * Cobre: autorizacao por perfil, formato do payload, recorte por periodo,
 * coerencia entre /metricas/indicadores e /voz/indicadores, delta de conversa
 * nova, TME/TMA depois de assumir e finalizar, painel de monitoramento e
 * jornada de trabalho.
 *
 * Uso: npm run smoke:metricas  (com a API de pe e o seed aplicado)
 */
const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};

async function req(metodo, rota, { corpo, token } = {}) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: resp.status, dados: await resp.json().catch(() => ({})) };
}

const entrar = async (email, senha) =>
  (await req('POST', '/auth/login', { corpo: { email, senha } })).dados.accessToken;

const admin = await entrar('admin@plataforma.local', 'Admin@123');
const supervisor = await entrar('supervisor@plataforma.local', 'Super@123');
const agente = await entrar('agente1@plataforma.local', 'Agente@123');
checar(Boolean(admin && supervisor && agente), '0. login dos tres perfis do seed');

/** Janela grande o suficiente para conter o que este teste acabou de criar. */
const janela = () => {
  const ate = new Date();
  return `desde=${new Date(ate.getTime() - 60 * 60 * 1000).toISOString()}&ate=${ate.toISOString()}`;
};

const indicadores = async (token = admin, query = janela()) =>
  (await req('GET', `/metricas/indicadores?${query}`, { token })).dados.indicadores;

// 1. Autorizacao: numero da operacao inteira nao e dado de agente.
const semToken = await req('GET', '/metricas/indicadores');
const comoAgente = await req('GET', '/metricas/indicadores', { token: agente });
const agentesComoAgente = await req('GET', '/metricas/agentes', { token: agente });
const comoSupervisor = await req('GET', '/metricas/indicadores', { token: supervisor });
checar(semToken.status === 401, '1. sem token devolve 401', `status ${semToken.status}`);
checar(comoAgente.status === 403, '2. perfil AGENTE recebe 403 nos indicadores', `status ${comoAgente.status}`);
checar(agentesComoAgente.status === 403, '3. perfil AGENTE recebe 403 no monitoramento', `status ${agentesComoAgente.status}`);
checar(comoSupervisor.status === 200, '4. supervisor enxerga os indicadores', `status ${comoSupervisor.status}`);

// 2. Formato: o painel quebra silenciosamente se um bloco sumir.
const atual = await indicadores();
const blocos = ['conversas', 'tempos', 'agentes', 'protocolos', 'voz', 'satisfacao'];
const faltando = blocos.filter((b) => !(b in (atual ?? {})));
checar(faltando.length === 0, '5. payload traz todos os blocos do painel', faltando.join(', ') || blocos.length + ' blocos');

const camposConversa = ['emEspera', 'atribuidas', 'emAtendimento', 'finalizadas', 'novasNoPeriodo', 'mensagensNoPeriodo', 'porCanal'];
checar(
  camposConversa.every((c) => c in atual.conversas),
  '6. bloco de conversas completo',
  camposConversa.filter((c) => !(c in atual.conversas)).join(', ') || 'todos presentes',
);
const camposVoz = ['total', 'entrantes', 'saintes', 'atendidas', 'naoAtendidas', 'taxaAtendimento', 'tma'];
checar(
  camposVoz.every((c) => c in atual.voz),
  '7. bloco de voz completo',
  camposVoz.filter((c) => !(c in atual.voz)).join(', ') || 'todos presentes',
);
checar(
  atual.satisfacao.csat === null || (atual.satisfacao.csat >= 1 && atual.satisfacao.csat <= 5),
  '8. CSAT dentro da escala de 1 a 5',
  String(atual.satisfacao.csat),
);
checar(
  atual.satisfacao.nps === null || (atual.satisfacao.nps >= -100 && atual.satisfacao.nps <= 100),
  '9. NPS dentro da escala de -100 a 100',
  String(atual.satisfacao.nps),
);

// 3. Recorte por periodo: o que e do periodo zera numa janela antiga, o que e
// estado atual (fila agora) nao — sao semanticas diferentes no mesmo payload.
const antigo = await indicadores(admin, 'desde=2020-01-01T00:00:00.000Z&ate=2020-01-02T00:00:00.000Z');
checar(antigo.conversas.novasNoPeriodo === 0, '10. janela de 2020 nao conta conversa nova', String(antigo.conversas.novasNoPeriodo));
checar(antigo.conversas.mensagensNoPeriodo === 0, '11. janela de 2020 nao conta mensagem', String(antigo.conversas.mensagensNoPeriodo));
checar(Object.keys(antigo.conversas.porCanal).length === 0, '12. janela de 2020 nao traz canal');
checar(antigo.voz.total === 0 && antigo.voz.taxaAtendimento === null, '13. janela de 2020 nao traz chamada', `total ${antigo.voz.total}`);
checar(
  antigo.conversas.emEspera === atual.conversas.emEspera,
  '14. fila atual nao muda com a janela (e estado, nao periodo)',
  `${antigo.conversas.emEspera} = ${atual.conversas.emEspera}`,
);

// 4. Coerencia entre os dois paineis: o mesmo periodo tem que dar o mesmo numero.
const q = janela();
const [doDashboard, daTelefonia] = await Promise.all([
  indicadores(admin, q),
  req('GET', `/voz/indicadores?${q}`, { token: admin }),
]);
checar(
  JSON.stringify(doDashboard.voz) === JSON.stringify(daTelefonia.dados.indicadores),
  '15. voz no dashboard bate com a tela de Telefonia',
  JSON.stringify(doDashboard.voz),
);

// 5. Delta de conversa nova: uma sessao de webchat de verdade.
const antes = await indicadores();
const { dados: sessao, status: statusSessao } = await req('POST', '/webchat/sessoes', {
  corpo: { nome: `Metricas ${EXECUCAO}`, email: `metricas-${EXECUCAO}@teste.local`, aceiteLgpd: true },
});
checar(statusSessao === 201, '16. sessao de webchat criada', `status ${statusSessao}`);
const conversaId = sessao.conversa.id;

await req('POST', '/webchat/mensagens', {
  token: sessao.sessaoToken,
  corpo: { conteudo: 'Preciso de ajuda com a fatura' },
});

const comConversa = await indicadores();
checar(
  comConversa.conversas.novasNoPeriodo === antes.conversas.novasNoPeriodo + 1,
  '17. conversa nova soma exatamente 1 no periodo',
  `${antes.conversas.novasNoPeriodo} -> ${comConversa.conversas.novasNoPeriodo}`,
);
checar(
  comConversa.conversas.emEspera === antes.conversas.emEspera + 1,
  '18. fila de espera soma exatamente 1',
  `${antes.conversas.emEspera} -> ${comConversa.conversas.emEspera}`,
);
checar(
  comConversa.conversas.mensagensNoPeriodo >= antes.conversas.mensagensNoPeriodo + 1,
  '19. mensagem do cliente entra na contagem',
  `${antes.conversas.mensagensNoPeriodo} -> ${comConversa.conversas.mensagensNoPeriodo}`,
);
checar(
  (comConversa.conversas.porCanal.WEBCHAT ?? 0) === (antes.conversas.porCanal.WEBCHAT ?? 0) + 1,
  '20. o canal certo recebeu a conversa',
  `WEBCHAT ${comConversa.conversas.porCanal.WEBCHAT}`,
);

// 6. Assumir a conversa: quem atende e o agente, nao o admin. Sai da fila,
// entra em atendimento, e a carga aparece no painel de monitoramento.
const { dados: eu } = await req('GET', '/auth/me', { token: agente });
const meuId = eu?.usuario?.id ?? null;


/** Carga antes de assumir: o teste compara o delta, nao um numero absoluto —
 *  a base cresce a cada execucao de smoke. */
const cargaAntes =
  ((await req('GET', '/metricas/agentes', { token: admin })).dados.agentes ?? []).find((a) => a.id === meuId)
    ?.conversasAtivas ?? 0;
const assumida = await req('POST', `/conversas/${conversaId}/assumir`, { token: agente });
checar(assumida.status === 200 || assumida.status === 201, '21. conversa assumida', `status ${assumida.status}`);

const emAtendimento = await indicadores();
checar(
  emAtendimento.conversas.emEspera === antes.conversas.emEspera,
  '22. assumir devolve a fila de espera ao valor anterior',
  `${comConversa.conversas.emEspera} -> ${emAtendimento.conversas.emEspera}`,
);

const { dados: painel, status: statusPainel } = await req('GET', '/metricas/agentes', { token: admin });
checar(statusPainel === 200 && Array.isArray(painel.agentes), '23. monitoramento devolve lista de agentes');
const euNoPainel = (painel.agentes ?? []).find((a) => a.id === meuId);
checar(Boolean(euNoPainel), '24. quem assumiu aparece no painel', euNoPainel?.nome ?? 'nao encontrado');
checar(
  (euNoPainel?.conversasAtivas ?? 0) === cargaAntes + 1,
  '25. carga do agente sobe exatamente 1 ao assumir',
  `${cargaAntes} -> ${euNoPainel?.conversasAtivas}`,
);
checar(
  euNoPainel !== undefined && !('senhaHash' in euNoPainel),
  '26. painel nao vaza hash de senha',
);

// O painel e de quem atende: ADMIN fica fora de proposito, senao a media de
// carga da equipe sai diluida por quem nao pega conversa.
checar(
  (painel.agentes ?? []).every((a) => a.perfil === 'AGENTE' || a.perfil === 'SUPERVISOR'),
  '27. painel lista apenas quem atende (AGENTE e SUPERVISOR)',
  [...new Set((painel.agentes ?? []).map((a) => a.perfil))].join(', '),
);

// 7. Finalizar: TMA e TME passam a ter valor, e a conversa conta como finalizada.
const finalizada = await req('POST', `/conversas/${conversaId}/finalizar`, { token: agente });
checar(finalizada.status === 200 || finalizada.status === 201, '28. conversa finalizada', `status ${finalizada.status}`);

const depois = await indicadores();
checar(
  depois.conversas.finalizadas === antes.conversas.finalizadas + 1,
  '29. finalizadas soma exatamente 1',
  `${antes.conversas.finalizadas} -> ${depois.conversas.finalizadas}`,
);
checar(depois.tempos.tmeSegundos !== null, '30. TME calculado apos atribuicao', `${depois.tempos.tmeSegundos}s`);
checar(depois.tempos.tmaSegundos !== null, '31. TMA calculado apos finalizacao', `${depois.tempos.tmaSegundos}s`);
checar(
  depois.tempos.tmeSegundos >= 0 && depois.tempos.tmaSegundos >= 0,
  '32. tempos nao sao negativos',
  `TME ${depois.tempos.tmeSegundos}s / TMA ${depois.tempos.tmaSegundos}s`,
);

// 8. Jornada: horas por status a partir do log de presenca.
const jornada = await req('GET', '/escalas/jornada', { token: admin });
checar(jornada.status === 200 && Array.isArray(jornada.dados.jornada), '33. jornada devolve serie por agente', `status ${jornada.status}`);
const jornadaAgente = jornada.dados.jornada?.[0];
checar(
  jornadaAgente === undefined || ['disponivel', 'emAtendimento', 'pausa', 'offline'].every((c) => c in jornadaAgente),
  '34. jornada traz os quatro status',
  jornadaAgente ? Object.keys(jornadaAgente).join(',') : 'sem registro de presenca',
);
const jornadaComoAgente = await req('GET', '/escalas/jornada', { token: agente });
checar(jornadaComoAgente.status === 403, '35. agente nao le a jornada da equipe', `status ${jornadaComoAgente.status}`);

// 9. Limpeza: devolve o admin ao estado que estava, senao o proximo smoke
// encontra a operacao com um atendente falsamente ocupado.
await req('PATCH', '/usuarios/me/status', { token: agente, corpo: { status: 'OFFLINE' } });

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'} — falhas=${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
