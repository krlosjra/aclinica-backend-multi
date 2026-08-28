const db = require('../config/db');

/**
 * GET /usuarios/medicos
 * Lista médicos ativos — usado pela recepção pra escolher o médico
 * na hora de marcar uma consulta. Qualquer usuário autenticado pode ver.
 */
async function listarMedicos(req, res) {
  try {
    const resultado = await db.query(
      `SELECT id, nome, crm, especialidade
       FROM usuarios
       WHERE role = 'medico' AND ativo = TRUE
       ORDER BY nome`
    );
    return res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao listar médicos:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar médicos.' });
  }
}

/**
 * GET /usuarios
 * Lista todos os usuários do sistema. Só admin.
 */
async function listar(req, res) {
  try {
    const resultado = await db.query(
      `SELECT id, nome, email, role, crm, especialidade, paciente_id, ativo, criado_em
       FROM usuarios
       ORDER BY nome`
    );
    return res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar usuários.' });
  }
}

/**
 * PATCH /usuarios/:id/status
 * Ativa ou desativa um usuário (em vez de deletar — mantém histórico
 * de consultas/caixa vinculado). Só admin.
 */
async function alterarStatus(req, res) {
  const { id } = req.params;
  const { ativo } = req.body;

  if (typeof ativo !== 'boolean') {
    return res.status(400).json({ erro: 'Campo "ativo" deve ser true ou false.' });
  }

  try {
    const resultado = await db.query(
      `UPDATE usuarios SET ativo = $1 WHERE id = $2
       RETURNING id, nome, email, role, ativo`,
      [ativo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao alterar status do usuário:', err);
    return res.status(500).json({ erro: 'Erro interno ao alterar status.' });
  }
}

module.exports = { listarMedicos, listar, alterarStatus };
