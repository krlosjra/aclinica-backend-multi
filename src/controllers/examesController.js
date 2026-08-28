const db = require('../config/db');

/**
 * GET /exames
 * Lista o catálogo de exames da clínica. Por padrão só os ativos;
 * ?incluir_inativos=true traz todos (útil na tela de gestão do admin).
 */
async function listar(req, res) {
  const { incluir_inativos } = req.query;
  try {
    const resultado = await db.query(
      incluir_inativos === 'true'
        ? 'SELECT * FROM exames ORDER BY nome'
        : 'SELECT * FROM exames WHERE ativo = TRUE ORDER BY nome'
    );
    return res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao listar exames:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar exames.' });
  }
}

/**
 * GET /exames/:id
 */
async function buscarPorId(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('SELECT * FROM exames WHERE id = $1', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Exame não encontrado.' });
    }
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar exame:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar exame.' });
  }
}

/**
 * POST /exames
 */
async function criar(req, res) {
  const { nome, descricao, preparo, valor_padrao, termo_consentimento } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'nome é obrigatório.' });
  }

  try {
    const resultado = await db.query(
      `INSERT INTO exames (nome, descricao, preparo, valor_padrao, termo_consentimento)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nome.trim(), descricao || null, preparo || null, valor_padrao || 0, termo_consentimento || null]
    );
    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao criar exame:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar exame.' });
  }
}

/**
 * PUT /exames/:id
 */
async function atualizar(req, res) {
  const { id } = req.params;
  const { nome, descricao, preparo, valor_padrao, ativo, termo_consentimento } = req.body;

  try {
    const resultado = await db.query(
      `UPDATE exames
       SET nome = COALESCE($1, nome),
           descricao = COALESCE($2, descricao),
           preparo = COALESCE($3, preparo),
           valor_padrao = COALESCE($4, valor_padrao),
           ativo = COALESCE($5, ativo),
           termo_consentimento = COALESCE($6, termo_consentimento)
       WHERE id = $7
       RETURNING *`,
      [
        nome ?? null,
        descricao ?? null,
        preparo ?? null,
        valor_padrao ?? null,
        ativo ?? null,
        termo_consentimento ?? null,
        id,
      ]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Exame não encontrado.' });
    }
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar exame:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar exame.' });
  }
}

/**
 * DELETE /exames/:id
 * Só admin. Se já tiver agendamentos vinculados, o banco recusa
 * (ON DELETE RESTRICT) — nesse caso sugerimos desativar em vez de excluir.
 */
async function deletar(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('DELETE FROM exames WHERE id = $1 RETURNING id', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Exame não encontrado.' });
    }
    return res.status(204).send();
  } catch (err) {
    if (err.code === '23503' || err.code === '23001') {
      return res.status(409).json({
        erro: 'Este exame já tem agendamentos vinculados. Desative-o em vez de excluir.',
      });
    }
    console.error('Erro ao deletar exame:', err);
    return res.status(500).json({ erro: 'Erro interno ao deletar exame.' });
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
