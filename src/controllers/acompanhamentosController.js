const db = require('../config/db');

/**
 * GET /acompanhamentos
 * Filtros: ?paciente_id=&consulta_id=
 * Médico só vê os próprios registros. Admin vê tudo.
 */
async function listar(req, res) {
  const { paciente_id, consulta_id } = req.query;
  let { medico_id } = req.query;

  if (req.usuario.role === 'medico') {
    medico_id = req.usuario.id;
  }

  const condicoes = [];
  const valores = [];

  if (medico_id) {
    valores.push(medico_id);
    condicoes.push(`a.medico_id = $${valores.length}`);
  }
  if (paciente_id) {
    valores.push(paciente_id);
    condicoes.push(`a.paciente_id = $${valores.length}`);
  }
  if (consulta_id) {
    valores.push(consulta_id);
    condicoes.push(`a.consulta_id = $${valores.length}`);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  try {
    const resultado = await db.query(
      `SELECT a.*, p.nome AS paciente_nome, m.nome AS medico_nome
       FROM acompanhamentos a
       JOIN pacientes p ON p.id = a.paciente_id
       JOIN usuarios m ON m.id = a.medico_id
       ${where}
       ORDER BY a.data_atendimento DESC`,
      valores
    );
    return res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao listar acompanhamentos:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar acompanhamentos.' });
  }
}

/**
 * GET /acompanhamentos/:id
 */
async function buscarPorId(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query(
      `SELECT a.*, p.nome AS paciente_nome, m.nome AS medico_nome
       FROM acompanhamentos a
       JOIN pacientes p ON p.id = a.paciente_id
       JOIN usuarios m ON m.id = a.medico_id
       WHERE a.id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }

    const registro = resultado.rows[0];
    if (req.usuario.role === 'medico' && registro.medico_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você não tem acesso a este registro.' });
    }

    return res.json(registro);
  } catch (err) {
    console.error('Erro ao buscar acompanhamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar registro.' });
  }
}

/**
 * POST /acompanhamentos
 * Médico sempre cria em seu próprio nome (ignora medico_id do body).
 * Admin pode registrar em nome de um médico específico, passando medico_id.
 */
async function criar(req, res) {
  const { paciente_id, consulta_id, queixa_principal, historia_clinica, exame_fisico, diagnostico, conduta, observacoes } = req.body;
  let { medico_id } = req.body;

  if (!paciente_id) {
    return res.status(400).json({ erro: 'paciente_id é obrigatório.' });
  }

  if (req.usuario.role === 'medico') {
    medico_id = req.usuario.id;
  } else if (!medico_id) {
    return res.status(400).json({ erro: 'medico_id é obrigatório quando criado pelo admin.' });
  }

  try {
    const resultado = await db.query(
      `INSERT INTO acompanhamentos
         (paciente_id, medico_id, consulta_id, queixa_principal, historia_clinica, exame_fisico, diagnostico, conduta, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        paciente_id,
        medico_id,
        consulta_id || null,
        queixa_principal || null,
        historia_clinica || null,
        exame_fisico || null,
        diagnostico || null,
        conduta || null,
        observacoes || null,
      ]
    );
    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Paciente, médico ou consulta informados não existem.' });
    }
    console.error('Erro ao criar acompanhamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar registro.' });
  }
}

/**
 * PUT /acompanhamentos/:id
 * Só o médico autor do registro (ou admin) pode editar.
 */
async function atualizar(req, res) {
  const { id } = req.params;
  const { queixa_principal, historia_clinica, exame_fisico, diagnostico, conduta, observacoes } = req.body;

  try {
    const atual = await db.query('SELECT medico_id FROM acompanhamentos WHERE id = $1', [id]);
    if (atual.rows.length === 0) {
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }
    if (req.usuario.role === 'medico' && atual.rows[0].medico_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você só pode editar registros que você mesmo criou.' });
    }

    const resultado = await db.query(
      `UPDATE acompanhamentos
       SET queixa_principal = COALESCE($1, queixa_principal),
           historia_clinica = COALESCE($2, historia_clinica),
           exame_fisico = COALESCE($3, exame_fisico),
           diagnostico = COALESCE($4, diagnostico),
           conduta = COALESCE($5, conduta),
           observacoes = COALESCE($6, observacoes)
       WHERE id = $7
       RETURNING *`,
      [queixa_principal, historia_clinica, exame_fisico, diagnostico, conduta, observacoes, id]
    );
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar acompanhamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar registro.' });
  }
}

/**
 * DELETE /acompanhamentos/:id
 * Só admin.
 */
async function deletar(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('DELETE FROM acompanhamentos WHERE id = $1 RETURNING id', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar acompanhamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao deletar registro.' });
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
