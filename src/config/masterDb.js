const { Pool } = require('pg');
require('dotenv').config();

// Conexão com o banco MESTRE (registro de clínicas) — sempre o mesmo
// banco, diferente dos bancos de cada clínica (que são resolvidos
// dinamicamente por tenantManager.js). Usa o mesmo host/usuário/senha
// do .env, só o nome do banco é outro.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.MASTER_DB_NAME,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do banco mestre:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
