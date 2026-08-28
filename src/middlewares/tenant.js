const jwt = require('jsonwebtoken');
require('dotenv').config();

const tenantManager = require('../config/tenantManager');
const tenantContext = require('../config/tenantContext');

/**
 * Roda bem no início da cadeia de middlewares (antes de tudo que toca
 * o banco). Descobre qual clínica atende esta requisição e deixa o
 * pool dela disponível pro resto da requisição via tenantContext —
 * assim, o db.js "ambiente" e todos os controllers funcionam sem
 * saber nada sobre multi-tenant.
 *
 * A clínica é identificada pelo DOMÍNIO DO EMAIL do usuário:
 *   - Se já existe um token válido no header Authorization, o domínio
 *     vem de dentro do token (mais seguro — não depende de nada que o
 *     cliente possa forjar no corpo da requisição).
 *   - Senão (login, auto-cadastro de paciente), o domínio vem do
 *     campo `email` do corpo da requisição.
 *
 * Se nenhuma das duas fontes tiver um email, a requisição segue sem
 * tenant resolvido — está tudo bem pra rotas que não tocam o banco
 * (ex: `GET /`). Qualquer tentativa de usar `db.query` sem tenant
 * resolvido lança um erro explícito (ver config/db.js).
 */
async function resolverTenant(req, res, next) {
  let dominio = null;
  let origem = null; // 'token' | 'body'

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      dominio = payload.dominio || null;
      origem = 'token';
    } catch (err) {
      // Token inválido/expirado: não resolve tenant aqui. O
      // middleware verificarToken (rodado depois, por rota) é quem
      // decide se isso é motivo de 401 — aqui só deixamos passar sem
      // contexto de banco.
    }
  }

  if (!dominio && req.body && typeof req.body.email === 'string') {
    dominio = tenantManager.extrairDominio(req.body.email);
    origem = 'body';
  }

  if (!dominio) {
    return next();
  }

  try {
    const { clinica, pool } = await tenantManager.resolverPorDominio(dominio);
    req.clinica = clinica;
    tenantContext.run(pool, clinica, next);
  } catch (err) {
    if (origem === 'token') {
      // Usuário já estava logado e a clínica dele sumiu/foi desativada
      // entre um request e outro — aí sim faz sentido ser explícito.
      return res.status(err.status || 404).json({ erro: 'Clínica não encontrada ou inativa.' });
    }
    // origem === 'body' (login, auto-cadastro de paciente): NÃO
    // revelamos se o domínio existe ou não — segue sem tenant
    // resolvido, e o controller (authController) responde com a
    // mesma mensagem genérica de "email ou senha inválidos" que usaria
    // pra uma senha errada. Evita que alguém descubra, por tentativa e
    // erro, quais domínios de clínica existem no sistema.
    req.clinica = null;
    return next();
  }
}

module.exports = resolverTenant;
