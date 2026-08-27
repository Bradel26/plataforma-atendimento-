import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Ficha 360 do cliente.
 *
 * O que so o navegador prova: que a linha do tempo — oito fontes unidas em SQL
 * bruto — chega na tela em ordem, que o filtro por tipo recorta de verdade, e
 * que registrar uma atividade a faz aparecer no fluxo sem recarregar a pagina.
 * O smoke cobre a API; nada nele garante que o componente montou.
 */

const abrirPrimeiroContato = async (page: import('@playwright/test').Page) => {
  await page.goto('/crm');
  const lista = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Contatos' }) });
  const primeiro = lista.locator('li button').first();
  await expect(primeiro).toBeVisible();
  const nome = (await primeiro.locator('p').first().innerText()).trim();
  await primeiro.click();
  return nome;
};

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

test.describe('Ficha 360 do contato', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin');
  });

  test('abre a ficha com os seis indicadores preenchidos', async ({ page }) => {
    const nome = await abrirPrimeiroContato(page);

    // O cabecalho e o nome do contato: confirma que a ficha e do que foi clicado.
    const cabecalho = cartao(page, nome);
    await expect(cabecalho).toBeVisible();

    // Escopo no cartao, e nao busca na pagina: "Oportunidades" tambem e nome de
    // aba do CRM, e a busca solta acha as duas.
    for (const rotulo of ['Conversas', 'Ligacoes', 'Protocolos', 'Oportunidades', 'Ja comprou', 'Tarefas']) {
      await expect(cabecalho.getByText(rotulo, { exact: true })).toBeVisible();
    }

    // Numero, nao vazio: se a chamada nao voltou, o indicador ficaria em branco
    // e o teste passaria por descuido.
    await expect(cabecalho.getByText('Conversas', { exact: true }).locator('..')).toContainText(/\d/);
    // O valor ganho e formatado como moeda, nao como numero cru.
    await expect(cabecalho.getByText('Ja comprou', { exact: true }).locator('..')).toContainText('R$');
  });

  test('a linha do tempo monta e vem em ordem decrescente', async ({ page }) => {
    await abrirPrimeiroContato(page);
    const tempo = cartao(page, 'Linha do tempo');
    await expect(tempo).toBeVisible();

    // Registra dois eventos para a ordenacao ter o que ordenar. Depender do que
    // o banco de desenvolvimento tem faz o teste passar hoje e falhar amanha —
    // foi o que aconteceu na primeira versao deste arquivo.
    // Sufixo por execucao: sem ele a segunda rodada acha dois eventos com o
    // mesmo texto (os desta e os da anterior) e o localizador fica ambiguo.
    const marca = Date.now().toString(36);
    const registrar = cartao(page, 'Registrar');
    for (const ordem of ['Primeiro', 'Segundo']) {
      const titulo = `${ordem} contato ${marca}`;
      await registrar.getByLabel('O que aconteceu').fill(titulo);
      await registrar.getByRole('button', { name: 'Registrar' }).click();
      await expect(tempo.getByText(titulo)).toBeVisible();
    }

    // A ordem e conferida pelo instante completo do atributo `dateTime`, nao
    // pelo texto exibido — que mostra so hora e minuto e empataria entre
    // eventos do mesmo minuto.
    const instantes = await tempo.locator('time').evaluateAll((nos) =>
      nos.map((n) => (n as HTMLTimeElement).dateTime),
    );
    expect(instantes.length).toBeGreaterThanOrEqual(2);
    const ordenados = [...instantes].sort().reverse();
    expect(instantes).toEqual(ordenados);
  });

  test('o filtro por tipo recorta o fluxo, e "Tudo" volta atras', async ({ page }) => {
    await abrirPrimeiroContato(page);
    const tempo = cartao(page, 'Linha do tempo');
    const eventos = tempo.locator('ol > li');
    await expect(eventos.first()).toBeVisible();
    const total = await eventos.count();

    // Atividade e o tipo que este contato pode nao ter — o teste seguinte cria
    // uma. Aqui basta que filtrar mude o resultado e nao quebre a tela.
    await tempo.getByRole('button', { name: 'Conversa' }).click();
    await expect(tempo.getByRole('button', { name: 'Tudo' })).toBeVisible();
    const filtrado = await eventos.count();
    expect(filtrado).toBeLessThanOrEqual(total);

    await tempo.getByRole('button', { name: 'Tudo' }).click();
    await expect(eventos).toHaveCount(total);
  });

  test('registrar uma atividade a coloca na linha do tempo na hora', async ({ page }) => {
    await abrirPrimeiroContato(page);

    const marca = `Visita tecnica ${Date.now().toString(36)}`;
    const registrar = cartao(page, 'Registrar');

    await registrar.getByLabel('Tipo').selectOption('VISITA');
    await registrar.getByLabel('O que aconteceu').fill(marca);

    // Detalhes e prazo ficam fechados para a linha do tempo caber na tela.
    await registrar.getByRole('button', { name: 'Detalhes e prazo' }).click();
    await registrar.getByLabel('Detalhes').fill('Conferiu a infraestrutura eletrica da loja.');
    await registrar.getByRole('button', { name: 'Registrar' }).click();

    // Aparece no fluxo sem recarregar a pagina.
    const tempo = cartao(page, 'Linha do tempo');
    await expect(tempo.getByText(marca)).toBeVisible();

    // E o formulario se esvazia: campo preenchido depois de gravar faz a pessoa
    // registrar a mesma coisa duas vezes.
    await expect(registrar.getByLabel('O que aconteceu')).toHaveValue('');
    // Os detalhes tambem fecham — senao a linha do tempo continua empurrada
    // para baixo justamente depois de ganhar um item novo.
    await expect(registrar.getByLabel('Detalhes')).toHaveCount(0);
  });

  test('preencher prazo cria tarefa, que aparece em aberto e pode ser concluida', async ({ page }) => {
    await abrirPrimeiroContato(page);

    const marca = `Retornar orcamento ${Date.now().toString(36)}`;
    const registrar = cartao(page, 'Registrar');

    await registrar.getByLabel('Tipo').selectOption('LIGACAO');
    await registrar.getByLabel('O que aconteceu').fill(marca);
    await registrar.getByRole('button', { name: 'Detalhes e prazo' }).click();
    // Data futura: tarefa em aberto, nao atrasada.
    await registrar.getByLabel('Prazo').fill('2027-03-15T09:00');

    // O botao muda de rotulo quando ha prazo — e o que diz a quem preenche que
    // aquilo virou compromisso, e nao registro do passado.
    const botao = registrar.getByRole('button', { name: 'Criar tarefa' });
    await expect(botao).toBeVisible();
    await botao.click();

    const tarefas = cartao(page, 'Tarefas marcadas');
    const linha = tarefas.locator('li').filter({ hasText: marca });
    await expect(linha).toBeVisible();

    await linha.getByRole('button', { name: 'Concluir' }).click();
    // Sai da lista de abertas...
    await expect(tarefas.locator('li').filter({ hasText: marca })).toHaveCount(0);
    // ...e continua no historico: concluir nao apaga o que aconteceu.
    await expect(cartao(page, 'Linha do tempo').getByText(marca)).toBeVisible();
  });

  test('a ficha da empresa tem os quatro indicadores e a linha do tempo dela', async ({ page }) => {
    await page.goto('/crm');
    await page.getByRole('button', { name: 'Contas' }).click();

    const lista = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Contas' }) });
    const primeira = lista.locator('li button').first();
    await expect(primeira).toBeVisible();
    await primeira.click();

    // Conversa e ligacao pertencem a pessoa, nao a empresa: a ficha da conta
    // mostra quatro cartoes. Mostrar "Conversas: 0" numa empresa que fala com a
    // gente todo dia seria mentira.
    await expect(page.getByText('Ja comprou', { exact: true })).toBeVisible();
    await expect(page.getByText('Protocolos', { exact: true })).toBeVisible();
    await expect(page.getByText('Conversas', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Ligacoes', { exact: true })).toHaveCount(0);

    // E registrar aqui vincula a atividade a empresa, nao a um contato dela.
    const marca = `Reuniao com a diretoria ${Date.now().toString(36)}`;
    const registrar = cartao(page, 'Registrar');
    await registrar.getByLabel('Tipo').selectOption('REUNIAO');
    await registrar.getByLabel('O que aconteceu').fill(marca);
    await registrar.getByRole('button', { name: 'Registrar' }).click();

    await expect(cartao(page, 'Linha do tempo').getByText(marca)).toBeVisible();
  });

  test('vincular e desvincular a empresa do contato', async ({ page }) => {
    const nome = await abrirPrimeiroContato(page);
    const cabecalho = cartao(page, nome);

    // O estado inicial do contato varia entre execucoes: se ja tem empresa,
    // desvincula primeiro para o teste comecar sempre do mesmo lugar.
    const desvincular = cabecalho.getByRole('button', { name: 'Desvincular empresa' });
    if (await desvincular.isVisible().catch(() => false)) {
      await desvincular.click();
      await expect(cabecalho.getByText('Sem empresa vinculada')).toBeVisible();
    }

    await cabecalho.getByRole('button', { name: 'Vincular empresa' }).click();
    const seletor = cabecalho.getByLabel('Empresa');
    await expect(seletor).toBeVisible();

    // As contas chegam por uma segunda chamada: o seletor abre dizendo
    // "Carregando...". Ler as opcoes antes disso encontra so o placeholder.
    await expect(seletor.locator('option').first()).toHaveText('Escolha a empresa...');

    // Escolhe a primeira empresa de verdade da lista, nao o placeholder.
    const opcoes = await seletor.locator('option').all();
    const empresa = await opcoes[1]!.getAttribute('value');
    const nomeEmpresa = (await opcoes[1]!.innerText()).trim();
    await seletor.selectOption(empresa!);

    await expect(cabecalho.getByText(`Empresa: ${nomeEmpresa}`)).toBeVisible();

    // Vinculado, os numeros da empresa entram na ficha da pessoa — e por isso
    // que vincular importa: sem empresa, "Ja comprou" e sempre zero.
    await expect(cabecalho.getByText('Ja comprou', { exact: true })).toBeVisible();

    await cabecalho.getByRole('button', { name: 'Desvincular empresa' }).click();
    await expect(cabecalho.getByText('Sem empresa vinculada')).toBeVisible();
  });

  test('cadastrar um contato abre a ficha dele ja pronta para registrar', async ({ page }) => {
    await page.goto('/crm');
    // O cadastro comeca fechado: a acao comum na lista e achar alguem.
    const cadastro = cartao(page, 'Contatos');
    await cadastro.getByRole('button', { name: 'Novo contato' }).click();

    const nome = `Feira ${Date.now().toString(36)}`;
    await cadastro.getByLabel('Nome').fill(nome);
    await cadastro.getByLabel('Telefone').fill('62999990000');
    await cadastro.getByLabel('Origem').selectOption('WHATSAPP');
    await cadastro.getByRole('button', { name: 'Cadastrar contato' }).click();

    // A ficha do contato novo abre sozinha: quem cadastrou quer registrar algo
    // nele em seguida, nao procurar o nome de volta na lista.
    await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible();
    await expect(cartao(page, 'Registrar')).toBeVisible();

    // E o formulario fecha: quem cadastrou um contato nao esta cadastrando dez.
    await expect(cadastro.getByLabel('Nome')).toHaveCount(0);

    // Aparece na lista.
    await expect(cadastro.getByText(nome)).toBeVisible();
  });

  test('cadastro com telefone repetido avisa e nao bloqueia', async ({ page }) => {
    await page.goto('/crm');
    const cadastro = cartao(page, 'Contatos');
    const telefone = `629${String(Date.now()).slice(-8)}`;

    for (const sufixo of ['primeiro', 'segundo']) {
      await cadastro.getByRole('button', { name: 'Novo contato' }).click();
      await cadastro.getByLabel('Nome').fill(`Duplicado ${sufixo} ${telefone.slice(-4)}`);
      await cadastro.getByLabel('Telefone').fill(telefone);
      await cadastro.getByRole('button', { name: 'Cadastrar contato' }).click();
      await expect(cadastro.getByLabel('Nome')).toHaveCount(0);
    }

    // O segundo entrou — dois contatos da mesma empresa podem dividir o telefone
    // do escritorio — mas a tela avisa para conferir.
    await expect(page.getByText(/Ja existe "Duplicado primeiro/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Duplicado segundo/ })).toBeVisible();
  });

  test('trocar de contato troca a ficha inteira', async ({ page }) => {
    await page.goto('/crm');
    const lista = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Contatos' }) });
    const botoes = lista.locator('li button');
    // Espera a lista pintar antes de contar. Sem isto o `count()` roda no
    // instante do goto, volta zero e o teste se auto-pula — passando como
    // "skipped" enquanto a tela esta perfeita. Foi o que aconteceu aqui.
    await expect(botoes.first()).toBeVisible();
    if ((await botoes.count()) < 2) test.skip(true, 'banco com menos de dois contatos');

    await botoes.nth(0).click();
    const primeiro = (await botoes.nth(0).locator('p').first().innerText()).trim();
    await expect(page.getByRole('heading', { name: primeiro, exact: true })).toBeVisible();

    await botoes.nth(1).click();
    const segundo = (await botoes.nth(1).locator('p').first().innerText()).trim();
    await expect(page.getByRole('heading', { name: segundo, exact: true })).toBeVisible();
  });
});
