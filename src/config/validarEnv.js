// Confere se as variáveis de ambiente essenciais existem ANTES do
// servidor subir. Sem isso, uma variável faltando (ex: JWT_SECRET vazio)
// só ia aparecer como um erro confuso na primeira requisição — ou pior,
// um bug silencioso (como o CORS que antes liberava geral quando
// FRONTEND_URL não existia). Falhar rápido e com mensagem clara aqui é
// bem melhor do que descobrir isso em produção.

const OBRIGATORIAS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  // Banco MESTRE (registro de clínicas) — não confundir com o banco de
  // cada clínica, que fica registrado dentro do próprio banco mestre
  // (tabela `clinicas`, coluna db_name) e é resolvido em tempo de
  // requisição por tenantManager.js.
  'MASTER_DB_NAME',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
];

function validarEnv() {
  const faltando = OBRIGATORIAS.filter((chave) => !process.env[chave] || !process.env[chave].trim());

  if (faltando.length > 0) {
    console.error('\n❌ Configuração incompleta — variáveis faltando no .env:\n');
    faltando.forEach((chave) => console.error(`   - ${chave}`));
    console.error(
      '\nConfira o arquivo .env na pasta clinica-backend. O servidor não vai subir até isso ser corrigido.\n'
    );
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 16) {
    console.error(
      '\n❌ JWT_SECRET está curto demais (menos de 16 caracteres) — troque por um valor ' +
        'longo e aleatório antes de subir o servidor. Um JWT_SECRET fraco permite forjar tokens de login.\n'
    );
    process.exit(1);
  }
}

module.exports = validarEnv;
