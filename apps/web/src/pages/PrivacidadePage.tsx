import { Link } from 'react-router-dom';

const CONTATO_PRIVACIDADE = 'kaua.tavares@bradel.com.br';

function EstruturaPublica({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold text-blue-700">Bradel · Plataforma de Atendimento</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{titulo}</h1>
        <div className="mt-8 space-y-7 leading-relaxed">{children}</div>
        <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-6 text-sm text-blue-700" aria-label="Informações públicas">
          <Link to="/privacidade" className="hover:underline">Privacidade</Link>
          <Link to="/exclusao-de-dados" className="hover:underline">Exclusão de dados</Link>
          <Link to="/login" className="hover:underline">Acessar a plataforma</Link>
        </nav>
      </div>
    </main>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 text-lg font-semibold text-slate-950">{titulo}</h2><div className="space-y-2 text-sm sm:text-base">{children}</div></section>;
}

/** Informação pública sobre os dados tratados no atendimento da Bradel. */
export function PrivacidadePage() {
  return (
    <EstruturaPublica titulo="Aviso de privacidade">
      <p className="text-sm sm:text-base">Este aviso explica como a Bradel trata dados pessoais nas conversas e nos atendimentos feitos pela Plataforma de Atendimento Bradel.</p>
      <Secao titulo="Dados tratados">
        <p>Podemos registrar nome, telefone, dados informados pelo cliente, mensagens, arquivos enviados, histórico de atendimento e registros necessários para acompanhar solicitações. Quando a funcionalidade estiver habilitada e a chamada ocorrer pela plataforma, o registro também pode incluir áudio, transcrição e resumo da ligação.</p>
      </Secao>
      <Secao titulo="Para que usamos os dados">
        <p>Usamos essas informações para receber e responder contatos, acompanhar solicitações, organizar o trabalho das equipes, manter o histórico do relacionamento e proteger a operação da plataforma.</p>
      </Secao>
      <Secao titulo="Acesso e serviços envolvidos">
        <p>O acesso é limitado aos profissionais autorizados para o atendimento e a gestão. A operação pode envolver fornecedores de comunicação, como a Meta para mensagens do WhatsApp, e fornecedores de infraestrutura utilizados pela plataforma.</p>
      </Secao>
      <Secao titulo="Conservação e pedidos do titular">
        <p>Os registros são conservados de acordo com a necessidade do atendimento, as regras de retenção aplicadas pela Bradel e as obrigações pertinentes. Você pode solicitar informações sobre seus dados, correção ou exclusão. Cada pedido será analisado, inclusive quanto a eventuais obrigações de conservação.</p>
        <p>Veja <Link to="/exclusao-de-dados" className="font-medium text-blue-700 underline">como pedir a exclusão de dados</Link>.</p>
      </Secao>
      <Secao titulo="Contato">
        <p>Para assuntos de privacidade relacionados à plataforma, escreva para <a className="font-medium text-blue-700 underline" href={`mailto:${CONTATO_PRIVACIDADE}`}>{CONTATO_PRIVACIDADE}</a>.</p>
      </Secao>
    </EstruturaPublica>
  );
}

/** Página pública solicitada no cadastro do aplicativo na Meta. */
export function ExclusaoDeDadosPage() {
  return (
    <EstruturaPublica titulo="Como solicitar a exclusão de dados">
      <p className="text-sm sm:text-base">Se você conversou com a Bradel ou utilizou um canal conectado à Plataforma de Atendimento Bradel, pode solicitar a exclusão dos seus dados pessoais.</p>
      <Secao titulo="Envie sua solicitação">
        <p>Escreva para <a className="font-medium text-blue-700 underline" href={`mailto:${CONTATO_PRIVACIDADE}?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20dados`}>{CONTATO_PRIVACIDADE}</a> com o assunto “Solicitação de exclusão de dados”. Informe seu nome e o telefone ou e-mail usado no atendimento para que possamos localizar os registros.</p>
        <p>Não envie senha, código de acesso nem documento pessoal no primeiro contato. Se for necessário confirmar sua identidade, a Bradel explicará como fazê-lo.</p>
      </Secao>
      <Secao titulo="Análise do pedido">
        <p>A Bradel localizará os dados relacionados ao pedido, verificará a identidade do solicitante quando necessário e informará o resultado pelo canal de contato. Alguns registros podem precisar ser conservados quando houver obrigação aplicável; nesse caso, a justificativa será comunicada.</p>
      </Secao>
      <Secao titulo="Outros pedidos de privacidade">
        <p>O mesmo contato pode ser usado para pedir acesso ou correção dos seus dados. Consulte também o <Link to="/privacidade" className="font-medium text-blue-700 underline">aviso de privacidade</Link>.</p>
      </Secao>
    </EstruturaPublica>
  );
}
