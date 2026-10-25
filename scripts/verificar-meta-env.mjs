// Valida presença e formato das variáveis da integração Meta, sem imprimir valores.
// Uso: node scripts/verificar-meta-env.mjs [arquivo.env]   (sem argumento usa process.env)
import { readFileSync } from 'node:fs';

const arquivo = process.argv[2];
const env = { ...process.env };
if (arquivo) {
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(linha);
    if (m && !linha.trim().startsWith('#')) env[m[1]] = m[2];
  }
}

const regras = [
  ['META_APP_ID', true, /^\d{10,20}$/, 'numérico (ID do app)'],
  ['META_APP_SECRET', true, /^[a-f0-9]{32}$/i, '32 caracteres hexadecimais'],
  ['META_WEBHOOK_VERIFY_TOKEN', true, /^\S{16,}$/, 'sem espaços, 16+ caracteres'],
  ['META_EMBEDDED_SIGNUP_COEX_CONFIG_ID', true, /^\d{10,25}$/, 'numérico (config_id do Coexistence)'],
  ['META_EMBEDDED_SIGNUP_CONFIG_ID', false, /^\d{10,25}$/, 'numérico (opcional: fluxo padrão sem Coexistence)'],
  ['META_GRAPH_API_VERSION', false, /^v\d+\.0$/, 'formato vNN.0 (padrão v26.0)'],
];

let falhas = 0;
for (const [nome, obrigatoria, formato, dica] of regras) {
  const valor = env[nome];
  let situacao;
  if (!valor) { situacao = obrigatoria ? 'AUSENTE' : 'não definida'; if (obrigatoria) falhas++; }
  else if (!formato.test(valor)) { situacao = `FORMATO INVÁLIDO — esperado: ${dica}`; falhas++; }
  else situacao = 'ok';
  console.log(`${nome.padEnd(38)} ${situacao}`);
}
process.exit(falhas ? 1 : 0);
