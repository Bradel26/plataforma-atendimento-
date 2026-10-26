const NOME_GRAVACAO_WEBJS = /^sessao-(?<sessao>[A-Za-z0-9_-]{1,60})-chamada-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z(?:-(?:audio-completo|audio-remoto|microfone-atendente)\.wav)?$/;

/** Confirma que o arquivo de gravação pertence exatamente à sessão pedida. */
export function gravacaoPertenceASessao(nome: string, sessaoEsperada: string): boolean {
  const sessao = NOME_GRAVACAO_WEBJS.exec(nome)?.groups?.sessao;
  return typeof sessao === 'string' && sessao === sessaoEsperada;
}
