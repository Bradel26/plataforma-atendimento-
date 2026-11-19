# Permissões e Papéis — NectarCRM

Fonte: categoria **Configurações**, seção **Configurações de usuário** (7/7 artigos lidos integralmente, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/28891056648467-Configura%C3%A7%C3%B5es-de-usu%C3%A1rio`).

## CONFIRMADO POR DOCUMENTAÇÃO

### Modelo geral

Permissões podem ser definidas por **Cargo** (grupo reutilizável) ou individualmente no perfil de um usuário (override do cargo). Fonte: `8004390570259`, `5602676778643`.

- Por padrão, o Nectar cria 3 cargos: **Vendedor, Diretor, Gestor de Vendas** — mas cabe ao administrador atribuir usuários a eles.
- Um usuário com permissões alteradas individualmente diverge do seu Cargo; o botão "Aplicar alterações para todos" restaura as permissões do Cargo para esse usuário específico (ação em massa ou individual).
- **Regra de segurança**: sempre deve existir pelo menos 1 usuário Administrador ativo na base; o sistema bloqueia a remoção da última atribuição de Administrador.

### 4 grupos de permissão (catálogo completo)

Fonte: `8004390570259` (artigo central) + `5602619413011` (resumo no cadastro de usuário).

#### 1. Administrador
Acesso total e exclusivo a:
- Configurações de Parâmetros Gerais (funil de vendas, contatos, notificações, avançados etc.);
- Criar/editar Usuários, Cargos (com permissões/restrições/participantes), Equipes (participantes/responsável/líder), Filas;
- Quebrar restrições/obrigatoriedades em funis e Leadboard (ex.: avançar/retornar etapa sem cumprir tarefas obrigatórias);
- Excluir tarefas obrigatórias de workflow e tarefas de automação (em massa ou individualmente);
- Visualizar/consultar estatísticas de todos os usuários e equipes; controle de Metas de Empresa;
- **Não é afetado pelo parâmetro "Restrição de base por equipes"** — acesso irrestrito a todas as equipes.

#### 2. Básicas (usuário operacional — vendedor, SDR)
- **Contatos** — "Inserir e editar cadastros de contatos": cria contatos e edita os sob sua responsabilidade. Recomenda-se não desabilitar (ao menos uma opção deve ficar habilitada para salvar edições). Se o parâmetro avançado "Compartilhar base de contatos" estiver ligado, mesmo usuários básicos veem a carteira geral (sobrepõe a restrição padrão).
- **Oportunidades** — "Criar e editar oportunidades para este perfil" (desativada = sem acesso ao módulo de Oportunidades nem a gráficos de Estatísticas) e "Visualizar oportunidades criadas para este perfil" (visualização only). O parâmetro avançado "Compartilhar base de oportunidades" só tem efeito para quem já tem a permissão "Comercial" habilitada.
- **Leadboard** — "Criar e acompanhar as próprias qualificações" (desativada = sem visualização de qualificações).
- Exclusão de tarefas: só tarefas avulsas criadas pelo próprio usuário; **não pode excluir tarefas obrigatórias de workflow nem tarefas geradas por automação**.

#### 3. Gestão (Gestor)
- **Supervisor**: acesso de edição a quase tudo (oportunidades, qualificações, contatos, tarefas, importações/exportações, estatísticas, BI, metas, Easyforms, Field Sales, propostas), exceto edição de usuários/cargos/equipes/configurações comerciais/administrativas. Pode excluir em massa ou individualmente tarefas obrigatórias de workflow de todos os usuários.
- **Contatos**: Gestão total de Contatos (ver/editar/excluir/unir/importar/exportar todos), Excluir/Importar/Exportar/Unir contatos da base (sub-permissões próprias).
- **Leadboard**: "Controlar funis de leadboard (gestor)" — **depende de "Gestão total dos Contatos" estar habilitada**; "Descartar as qualificações" — depende de "Controlar funis de leadboard" estar habilitada.
- **Oportunidades** (todas dependem de "Comercial" das Básicas estar habilitada): Descartar oportunidades; Visualizar e editar oportunidades e valores (depende também de "Gestão total dos contatos"); Permitir sempre transferência de oportunidade para outro funil (das equipes a que tem acesso); Permitir retornar de etapa mesmo com funil bloqueado; Prorrogar oportunidades; Exportar oportunidades; Reabrir oportunidades; Editar data de conclusão (só a data, de oportunidades já finalizadas); Editar oportunidades finalizadas (edição geral). Nota: só Administrador ou quem tem a permissão especial "Comerciais" vê todos os funis da base.
- **Atividades** (dependem de "Restrição de base por equipes" desabilitada para alcançar toda a base): Visualizar agenda de todos (compromissos); Visualizar tarefas de todos; Visualizar todos os fluxos (Procedimentos).
- **Relatórios**: Criar e visualizar metas de toda a equipe; Visualizar estatísticas de toda a equipe; Acessar o BI (**só plano Enterprise**).

#### 4. Especiais
- **Administrativas**: edição de Campos personalizados, Categoria de contato, Checklist, Tags, Origem, Segmento, Tipo de Tarefas, Tipo de Compromisso, Tipo de Ligação.
- **Comerciais**: edição de Funis de vendas, Motivos de ganho/perda, Motivos de descarte, Funis de Leadboard, Modelos de Formulários, Moedas, Modelos de Proposta, Produtos (categorias/subcategorias/formação de preço), Tabelas de Preço. Garante visualização de **todos** os funis da base, independentemente de "Restrição de base por equipe" ou vínculo a funil exclusivo de outra equipe.

### Restrições de acesso (IP/Horário)

Fonte: `5602676778643`, `5602619413011`. Configuráveis por Cargo (aba Restrições) ou individualmente por usuário. Fora da faixa de IP ou horário permitido, o login é bloqueado no momento da tentativa. É possível configurar se a restrição individual do usuário sobrepõe a do Cargo.

### Equipes

Fonte: `5602714229651`. Hierárquicas (equipe superior opcional, organograma arrastável em "Gerenciar equipes"). Parâmetro de restrição de base por equipe impede visualização/alteração cruzada entre equipes (exceto gestores de funcionalidades, que veem o que gerenciam dos usuários de sua equipe); responsáveis de uma equipe veem todos os dados dela e dos demais responsáveis da mesma equipe. Opção "Históricos compartilhados": torna feedbacks da equipe visíveis a todos os membros que também enxergam o contato/oportunidade em questão.

### Ciclo de vida do usuário (ativo/desativado/excluído)

Fonte: `18308008699283`, `26793137035795`.

- **Desativar**: usuário perde acesso de login e deixa de aparecer como opção de responsável em listagens/filtros por padrão; nenhuma responsabilidade é transferida; **ainda ocupa uma licença ativa da base**. Filtro "Bloqueado = Sim" localiza usuários desativados; desabilitar "Usuários ativos" no filtro de responsáveis mostra os itens dele.
- **Excluir**: exige transferir os itens em aberto/andamento (oportunidades, Leadboards, contatos, tarefas etc.) para outro usuário — **nada é perdido**, só o que já estava finalizado permanece no "histórico" do usuário excluído (consultável desabilitando "Usuários ativos"). Só libera a licença de usuário após a exclusão (diferente da desativação, que não libera). Exclusão é individual, **sem opção de exclusão em massa**. Dados de usuários excluídos continuam extraíveis via relatórios de Big Data (**só Enterprise**). A exclusão da base inteira do Nectar só pode ser feita internamente pela própria equipe da Nectar (não pelo cliente).

### Log de acessos

Fonte: `27435287124499`. Em Configurações > Integrações > Acessos: lista de logins recentes por usuário, data/hora, IP, com detalhe de localização via ícone de lupa.

## INFERIDO

- A observação de `18308008699283` de que a desativação "ainda contará como uma licença ativa" sugere que o modelo de cobrança do Nectar é por licença de usuário contratada, não por usuário logado/ativo no período — inferência razoável, mas não afirmada de forma explícita e isolada em nenhum artigo (é dedução cruzando com `26793137035795`, que diz que a licença só é liberada na exclusão).

## NÃO VERIFICADO

- Lista de permissões específicas do módulo Leadboard além do que foi citado de passagem (o módulo em si está fora do escopo desta Fase 2 CRM/Módulos-Configurações).
- Se existe algum limite máximo de cargos ou de usuários por cargo.
- Detalhes de como o parâmetro "Restrição de base por equipes" interage exatamente com permissões especiais "Comerciais" em casos de equipes multi-funil (o artigo afirma a regra mas não dá exemplo prático).

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
