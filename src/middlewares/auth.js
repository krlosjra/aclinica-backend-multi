const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Verifica se a requisição tem um token JWT válido no header:
 *   Authorization: Bearer <token>
 *
 * Se válido, injeta os dados do usuário em req.usuario e libera a rota.
 * Se inválido/ausente, retorna 401.
 */
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload contém: { id, role, nome, iat, exp }
    req.usuario = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Token expirado. Faça login novamente.' });
    }
    return res.status(401).json({ erro: 'Token inválido.' });
  }
}

/**
 * Middleware factory: recebe uma lista de roles permitidas e retorna
 * um middleware que só deixa passar se req.usuario.role estiver na lista.
 *
 * Uso: router.delete('/pacientes/:id', verificarToken, permitir('admin'), ...)
 */
function permitir(...rolesPermitidas) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: 'Usuário não autenticado.' });
    }

    if (!rolesPermitidas.includes(req.usuario.role)) {
      return res.status(403).json({
        erro: 'Você não tem permissão para acessar este recurso.',
      });
    }

    next();
  };
}

module.exports = { verificarToken, permitir };
