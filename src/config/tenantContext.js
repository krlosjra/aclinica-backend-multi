const { AsyncLocalStorage } = require('async_hooks');

// Guarda, por requisição (ou por tarefa em background), qual pool de
// conexão Postgres deve ser usado — o da clínica resolvida no login.
// Isso permite que TODOS os controllers continuem fazendo
// `require('../config/db').query(...)` sem saber nada sobre qual
// clínica está sendo atendida: o db.js consulta este contexto por
// baixo dos panos.
const als = new AsyncLocalStorage();

/**
 * Executa `fn` (síncrona ou assíncrona) com `pool` disponível como o
 * banco "ambiente" pra qualquer código que rodar dentro dela — direto
 * ou em chamadas assíncronas encadeadas (await, Promise, setTimeout,
 * etc., que o AsyncLocalStorage do Node acompanha automaticamente).
 */
function run(pool, clinica, fn) {
  return als.run({ pool, clinica }, fn);
}

function getPool() {
  const store = als.getStore();
  if (!store || !store.pool) {
    throw new Error(
      'Nenhuma clínica (tenant) resolvida para esta operação. ' +
        'Verifique se a rota passou pelo middleware resolverTenant, ou se o ' +
        'script chamou tenantContext.run(pool, clinica, fn) antes de acessar o banco.'
    );
  }
  return store.pool;
}

function getClinica() {
  const store = als.getStore();
  return store ? store.clinica : null;
}

module.exports = { run, getPool, getClinica };
