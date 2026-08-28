const { getPool } = require('./tenantContext');

// IMPORTANTE: este módulo não guarda mais um Pool fixo. Cada clínica
// (tenant) tem seu próprio banco/Pool (ver tenantManager.js); qual
// deles usar é decidido por requisição pelo middleware
// `resolverTenant` (middlewares/tenant.js) e guardado em
// tenantContext. Isso é o que permite que TODOS os controllers
// continuem chamando `db.query(...)` sem precisar saber nada sobre
// multi-tenant.
//
// Se algo chamar db.query/db.pool fora de uma requisição (ou fora de
// um tenantContext.run(...) explícito, como nas tarefas em background
// de server.js), isso lança um erro claro em vez de silenciosamente
// usar o banco errado.
module.exports = {
  query: (text, params) => getPool().query(text, params),
  get pool() {
    return getPool();
  },
};
