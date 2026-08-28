const { Pool } = require('pg');
const masterDb = require('./masterDb');

// Cache de linhas da tabela `clinicas` (banco mestre), por domínio —
// evita bater no banco mestre a cada requisição. Clínica muda de
// status raramente (ativar/desativar), então um cache curto já ajuda
// bastante sem atrasar uma suspensão por muito tempo.
const CACHE_CLINICA_MS = 30 * 1000;
const cacheClinicaPorDominio = new Map(); // dominio -> { clinica, expiraEm }

// Cache dos pools de conexão de cada clínica — um Pool do `pg` já é,
// por si só, uma pool reaproveitável de conexões, então basta manter
// UM Pool por clínica (nunca recriar a cada requisição) e reutilizar
// enquanto o processo do servidor estiver de pé.
const poolsPorDbName = new Map(); // db_name -> Pool

function extrairDominio(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;
  return email.split('@')[1].trim().toLowerCase();
}

async function buscarClinicaPorDominio(dominio) {
  const agora = Date.now();
  const emCache = cacheClinicaPorDominio.get(dominio);
  if (emCache && agora < emCache.expiraEm) {
    return emCache.clinica;
  }

  const resultado = await masterDb.query(
    'SELECT id, nome, dominio, db_name, ativo FROM clinicas WHERE dominio = $1',
    [dominio]
  );
  const clinica = resultado.rows[0] || null;

  cacheClinicaPorDominio.set(dominio, { clinica, expiraEm: agora + CACHE_CLINICA_MS });
  return clinica;
}

function obterPool(clinica) {
  let pool = poolsPorDbName.get(clinica.db_name);
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: clinica.db_name,
      max: 10, // menor que o padrão de um app single-tenant: aqui o total de conexões é dividido entre várias clínicas
    });
    pool.on('error', (err) => {
      console.error(`Erro inesperado no pool da clínica "${clinica.dominio}" (${clinica.db_name}):`, err);
    });
    poolsPorDbName.set(clinica.db_name, pool);
  }
  return pool;
}

/**
 * Resolve a clínica + pool de conexão a partir do domínio de email.
 * Lança erro (com `.status` já preenchido) se a clínica não existe ou
 * está inativa — quem chama decide a mensagem exata pro usuário final
 * (login não deve revelar se o domínio existe ou não; outras rotas
 * podem ser mais explícitas).
 */
async function resolverPorDominio(dominio) {
  if (!dominio) {
    const err = new Error('Domínio de email não informado.');
    err.status = 400;
    throw err;
  }

  const clinica = await buscarClinicaPorDominio(dominio);
  if (!clinica || !clinica.ativo) {
    const err = new Error('Clínica não encontrada ou inativa.');
    err.status = 404;
    throw err;
  }

  return { clinica, pool: obterPool(clinica) };
}

async function listarClinicasAtivas() {
  const resultado = await masterDb.query(
    'SELECT id, nome, dominio, db_name, ativo FROM clinicas WHERE ativo = TRUE'
  );
  return resultado.rows;
}

/** Limpa o cache de uma clínica (usar depois de ativar/desativar uma clínica). */
function invalidarCache(dominio) {
  cacheClinicaPorDominio.delete(dominio);
}

module.exports = {
  extrairDominio,
  resolverPorDominio,
  obterPool,
  listarClinicasAtivas,
  invalidarCache,
};
