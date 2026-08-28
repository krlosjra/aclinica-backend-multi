const licencaService = require('../services/licencaService');

// Rotas que continuam funcionando mesmo com a licença vencida — sem
// essa exceção ninguém conseguiria nem logar pra colar uma chave nova.
const CAMINHOS_LIBERADOS = new Set(['/', '/auth/login', '/licenca/status', '/licenca/ativar']);

/**
 * Bloqueia o uso do sistema quando a licença está vencida (ou nunca foi
 * ativada). Registrado globalmente em server.js, antes das rotas.
 */
async function verificarLicenca(req, res, next) {
  if (CAMINHOS_LIBERADOS.has(req.path)) {
    return next();
  }

  try {
    const status = await licencaService.obterStatus();
    if (status.expirada) {
      return res.status(403).json({
        erro: status.ativada
          ? 'A licença deste sistema venceu. Contate o administrador para renovar.'
          : 'Este sistema ainda não tem uma licença ativada. Contate o administrador.',
        licenca_expirada: true,
      });
    }
    return next();
  } catch (err) {
    // Se der erro ao consultar a licença (ex: banco fora do ar), deixa
    // passar — não é razoável travar a clínica inteira por causa disso,
    // e o banco fora do ar já vai quebrar as rotas normais de qualquer
    // forma.
    console.error('Erro ao verificar licença:', err);
    return next();
  }
}

module.exports = verificarLicenca;
