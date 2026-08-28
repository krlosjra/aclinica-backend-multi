const db = require('../config/db');

/**
 * GET /laudos
 * Filtros: ?paciente_id=&consulta_id=&medico_id=
 * Médico só vê os próprios (medico_id forçado a partir do token).
 * Admin vê tudo.
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
    condicoes.push(`l.medico_id = $${valores.length}`);
  }
  if (paciente_id) {
    valores.push(paciente_id);
    condicoes.push(`c.paciente_id = $${valores.length}`);
  }
  if (consulta_id) {
    valores.push(consulta_id);
    condicoes.push(`l.consulta_id = $${valores.length}`);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  try {
    const resultado = await db.query(
      `SELECT l.*, c.data_hora AS consulta_data_hora, c.paciente_id,
              p.nome AS paciente_nome, e.nome AS exame_nome, m.nome AS medico_nome
       FROM laudos l
       JOIN consultas c ON c.id = l.consulta_id
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN exames e ON e.id = c.exame_id
       JOIN usuarios m ON m.id = l.medico_id
       ${where}
       ORDER BY l.data_emissao DESC`,
      valores
    );
    return res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao listar laudos:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar laudos.' });
  }
}

/**
 * GET /laudos/:id
 */
async function buscarPorId(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query(
      `SELECT l.*, c.data_hora AS consulta_data_hora, c.paciente_id,
              p.nome AS paciente_nome, p.cpf AS paciente_cpf,
              e.nome AS exame_nome, m.nome AS medico_nome
       FROM laudos l
       JOIN consultas c ON c.id = l.consulta_id
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN exames e ON e.id = c.exame_id
       JOIN usuarios m ON m.id = l.medico_id
       WHERE l.id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Laudo não encontrado.' });
    }

    const laudo = resultado.rows[0];
    if (req.usuario.role === 'medico' && laudo.medico_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você não tem acesso a este laudo.' });
    }

    return res.json(laudo);
  } catch (err) {
    console.error('Erro ao buscar laudo:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar laudo.' });
  }
}

/**
 * POST /laudos
 * body: { consulta_id, conteudo, medico_id? }
 * - Só é possível laudar uma consulta do tipo "exame" com status "realizada".
 * - Um exame só pode ter um laudo (consulta_id é UNIQUE) — se já existe,
 *   devolve 409 orientando a usar PUT /laudos/:id pra editar.
 * - medico: medico_id sempre é o próprio; admin: precisa informar
 *   medico_id no body (mesma regra já usada em prescrições).
 */
async function criar(req, res) {
  const { consulta_id, conteudo } = req.body;
  let { medico_id } = req.body;

  if (!consulta_id || !conteudo || !conteudo.trim()) {
    return res.status(400).json({ erro: 'consulta_id e conteudo são obrigatórios.' });
  }

  if (req.usuario.role === 'medico') {
    medico_id = req.usuario.id;
  } else if (!medico_id) {
    return res.status(400).json({ erro: 'medico_id é obrigatório quando criado pelo admin.' });
  }

  try {
    const consulta = await db.query('SELECT id, tipo, status FROM consultas WHERE id = $1', [
      consulta_id,
    ]);
    if (consulta.rows.length === 0) {
      return res.status(404).json({ erro: 'Consulta/exame não encontrado.' });
    }
    if (consulta.rows[0].tipo !== 'exame') {
      return res.status(400).json({ erro: 'Só é possível laudar agendamentos do tipo exame.' });
    }
    if (consulta.rows[0].status !== 'realizada') {
      return res.status(400).json({ erro: 'Este exame ainda não foi realizado.' });
    }

    const resultado = await db.query(
      `INSERT INTO laudos (consulta_id, medico_id, conteudo)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [consulta_id, medico_id, conteudo.trim()]
    );
    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        erro: 'Este exame já tem um laudo. Edite o laudo existente em vez de criar um novo.',
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Consulta ou médico informados não existem.' });
    }
    console.error('Erro ao criar laudo:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar laudo.' });
  }
}

/**
 * PUT /laudos/:id
 * Só o médico que assinou o laudo, ou admin.
 */
async function atualizar(req, res) {
  const { id } = req.params;
  const { conteudo } = req.body;

  if (!conteudo || !conteudo.trim()) {
    return res.status(400).json({ erro: 'conteudo é obrigatório.' });
  }

  try {
    const atual = await db.query('SELECT medico_id FROM laudos WHERE id = $1', [id]);
    if (atual.rows.length === 0) {
      return res.status(404).json({ erro: 'Laudo não encontrado.' });
    }
    if (req.usuario.role === 'medico' && atual.rows[0].medico_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você não tem acesso a este laudo.' });
    }

    const resultado = await db.query(
      `UPDATE laudos
       SET conteudo = $1, atualizado_em = NOW()
       WHERE id = $2
       RETURNING *`,
      [conteudo.trim(), id]
    );
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar laudo:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar laudo.' });
  }
}

/**
 * DELETE /laudos/:id
 * Só admin.
 */
async function deletar(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('DELETE FROM laudos WHERE id = $1 RETURNING id', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Laudo não encontrado.' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar laudo:', err);
    return res.status(500).json({ erro: 'Erro interno ao deletar laudo.' });
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
