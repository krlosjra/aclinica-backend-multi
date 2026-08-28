const licencaService = require('../services/licencaService');

/**
 * GET /licenca/status
 * Qualquer usuário autenticado pode ler — é o que alimenta o aviso de
 * "vence em X dias" e a tela de bloqueio pra todo mundo, não só admin.
 */
async function status(req, res) {
  try {
    const dados = await licencaService.obterStatus();
    return res.json(dados);
  } catch (err) {
    console.error('Erro ao obter status da licença:', err);
    return res.status(500).json({ erro: 'Erro interno ao consultar a licença.' });
  }
}

/**
 * POST /licenca/ativar
 * Só admin. Recebe { chave } e, se a assinatura for válida, ativa essa
 * licença (substituindo a anterior).
 */
async function ativar(req, res) {
  const { chave } = req.body;

  if (!chave || !chave.trim()) {
    return res.status(400).json({ erro: 'Informe a chave de licença.' });
  }

  try {
    const dados = await licencaService.ativar(chave.trim());
    return res.json(dados);
  } catch (err) {
    if (err.codigo === 'CHAVE_INVALIDA') {
      return res.status(400).json({ erro: err.message });
    }
    console.error('Erro ao ativar licença:', err);
    return res.status(500).json({ erro: 'Erro interno ao ativar a licença.' });
  }
}

module.exports = { status, ativar };
