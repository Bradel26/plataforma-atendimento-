type ErroMeta = { message?: string; code?: number; error_subcode?: number } | undefined;

/**
 * Traduz o erro da Graph API para algo que o vendedor consegue agir em cima.
 * O codigo da Meta decide a orientacao; o texto original so complementa, nunca
 * inclui token (a Meta nao o devolve) nem dados do cliente.
 */
export function mensagemDeErroMeta(erro: ErroMeta, status: number): string {
  switch (erro?.code) {
    case 190:
      return 'A autorização do WhatsApp expirou ou foi revogada. Reconecte o número em Atendimento.';
    case 10:
    case 200:
    case 299:
      return 'A conexão não tem permissão para enviar mensagens. Reconecte o número e aceite todas as permissões.';
    case 131047:
      return 'Passaram mais de 24 horas desde a última mensagem do cliente. Só é possível responder com um modelo de mensagem aprovado.';
    case 131026:
      return 'A mensagem não pôde ser entregue: o número do cliente não tem WhatsApp ou não aceitou os termos.';
    case 131030:
      return 'O número do cliente não está autorizado a receber mensagens desta conta (modo de teste da Meta).';
    case 131042:
      return 'Há um problema de pagamento na conta WhatsApp Business. Verifique a forma de pagamento no Gerenciador da Meta.';
    case 130429:
    case 131056:
    case 80007:
      return 'Muitas mensagens em pouco tempo. Aguarde alguns instantes e tente novamente.';
    case 133010:
      return 'O número não está registrado na API oficial. Reconecte o número em Atendimento.';
    default:
      return `A Meta recusou o envio (${status}): ${erro?.message ?? 'sem detalhe'}`;
  }
}
