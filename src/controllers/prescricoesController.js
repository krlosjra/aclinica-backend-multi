const db = require('../config/db');

/**
 * Valida e normaliza a lista de itens (medicamentos) de uma prescrição.
 * A lista pode vir vazia (ex: prescrição só com exames solicitados),
 * mas se vier algum item, ele precisa ter ao menos o nome do medicamento.
 */
function validarItens(itens) {
  if (itens === undefined) return { erro: null };
  if (!Array.isArray(itens)) {
    return { erro: '"itens" precisa ser uma lista.' };
  }
  for (const item of itens) {
    if (!item.medicamento || !item.medicamento.trim()) {
      return { erro: 'Todo item precisa ter o campo "medicamento" preenchido.' };
    }
  }
  return { erro: null };
}

/**
 * GET /prescricoes
 * Filtros: ?paciente_id=&acompanhamento_id=
 * Médico só vê as próprias. Admin vê tudo.
 */
async function listar(req, res) {
  const { paciente_id, acompanhamento_id } = req.query;
  let { medico_id } = req.query;

  if (req.usuario.role === 'medico') {
    medico_id = req.usuario.id;
  }

  const condicoes = [];
  const valores = [];

  if (medico_id) {
    valores.push(medico_id);
    condicoes.push(`pr.medico_id = $${valores.length}`);
  }
  if (paciente_id) {
    valores.push(paciente_id);
    condicoes.push(`pr.paciente_id = $${valores.length}`);
  }
  if (acompanhamento_id) {
    valores.push(acompanhamento_id);
    condicoes.push(`pr.acompanhamento_id = $${valores.length}`);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  try {
    const resultado = await db.query(
      `SELECT pr.*, p.nome AS paciente_nome, m.nome AS medico_nome
       FROM prescricoes pr
       JOIN pacientes p ON p.id = pr.paciente_id
       JOIN usuarios m ON m.id = pr.medico_id
       ${where}
       ORDER BY pr.data_emissao DESC`,
      valores
    );
    return res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao listar prescrições:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar prescrições.' });
  }
}

/**
 * GET /prescricoes/:id
 * Retorna a prescrição junto com seus itens (medicamentos).
 */
async function buscarPorId(req, res) {
  const { id } = req.params;
  try {
    const cabecalho = await db.query(
      `SELECT pr.*, p.nome AS paciente_nome, m.nome AS medico_nome
       FROM prescricoes pr
       JOIN pacientes p ON p.id = pr.paciente_id
       JOIN usuarios m ON m.id = pr.medico_id
       WHERE pr.id = $1`,
      [id]
    );

    if (cabecalho.rows.length === 0) {
      return res.status(404).json({ erro: 'Prescrição não encontrada.' });
    }

    const prescricao = cabecalho.rows[0];
    if (req.usuario.role === 'medico' && prescricao.medico_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você não tem acesso a esta prescrição.' });
    }

    const itens = await db.query(
      'SELECT * FROM prescricao_itens WHERE prescricao_id = $1 ORDER BY id',
      [id]
    );

    return res.json({ ...prescricao, itens: itens.rows });
  } catch (err) {
    console.error('Erro ao buscar prescrição:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar prescrição.' });
  }
}

/**
 * POST /prescricoes
 * Body: { paciente_id, acompanhamento_id?, observacoes?, exames_solicitados?, itens: [{ medicamento, dosagem, via_administracao, frequencia, duracao, quantidade, observacoes }] }
 * "itens" (medicamentos) continua obrigatório ter pelo menos 1; já
 * "exames_solicitados" é um texto livre opcional (o médico digita à
 * mão, sem precisar de itens estruturados) — pode vir sozinho ou junto.
 */
async function criar(req, res) {
  const { paciente_id, acompanhamento_id, observacoes, exames_solicitados, itens } = req.body;
  let { medico_id } = req.body;

  if (!paciente_id) {
    return res.status(400).json({ erro: 'paciente_id é obrigatório.' });
  }

  if (req.usuario.role === 'medico') {
    medico_id = req.usuario.id;
  } else if (!medico_id) {
    return res.status(400).json({ erro: 'medico_id é obrigatório quando criado pelo admin.' });
  }

  const { erro: erroItens } = validarItens(itens);
  if (erroItens) {
    return res.status(400).json({ erro: erroItens });
  }

  const temMedicamentos = Array.isArray(itens) && itens.length > 0;
  const temExames = exames_solicitados && exames_solicitados.trim();
  if (!temMedicamentos && !temExames) {
    return res.status(400).json({
      erro: 'Informe ao menos um medicamento ou uma solicitação de exame.',
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const prescricao = await client.query(
      `INSERT INTO prescricoes (paciente_id, medico_id, acompanhamento_id, observacoes, exames_solicitados)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [paciente_id, medico_id, acompanhamento_id || null, observacoes || null, exames_solicitados || null]
    );
    const prescricaoId = prescricao.rows[0].id;

    const itensInseridos = [];
    for (const item of itens || []) {
      const resultadoItem = await client.query(
        `INSERT INTO prescricao_itens
           (prescricao_id, medicamento, dosagem, via_administracao, frequencia, duracao, quantidade, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          prescricaoId,
          item.medicamento.trim(),
          item.dosagem || null,
          item.via_administracao || null,
          item.frequencia || null,
          item.duracao || null,
          item.quantidade || null,
          item.observacoes || null,
        ]
      );
      itensInseridos.push(resultadoItem.rows[0]);
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...prescricao.rows[0], itens: itensInseridos });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Paciente, médico ou acompanhamento informados não existem.' });
    }
    console.error('Erro ao criar prescrição:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar prescrição.' });
  } finally {
    client.release();
  }
}

/**
 * PUT /prescricoes/:id
 * Substitui observações e a lista inteira de itens (mais simples e seguro
 * do que tentar mesclar edições item a item). Só o médico autor ou admin.
 */
async function atualizar(req, res) {
  const { id } = req.params;
  const { observacoes, exames_solicitados, itens } = req.body;

  if (itens !== undefined) {
    const { erro: erroItens } = validarItens(itens);
    if (erroItens) {
      return res.status(400).json({ erro: erroItens });
    }
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const atual = await client.query('SELECT medico_id FROM prescricoes WHERE id = $1', [id]);
    if (atual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Prescrição não encontrada.' });
    }
    if (req.usuario.role === 'medico' && atual.rows[0].medico_id !== req.usuario.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ erro: 'Você só pode editar prescrições que você mesmo criou.' });
    }

    const prescricao = await client.query(
      `UPDATE prescricoes
       SET observacoes = COALESCE($1, observacoes),
           exames_solicitados = COALESCE($2, exames_solicitados)
       WHERE id = $3
       RETURNING *`,
      [observacoes ?? null, exames_solicitados ?? null, id]
    );

    let itensFinais = [];
    if (itens !== undefined) {
      await client.query('DELETE FROM prescricao_itens WHERE prescricao_id = $1', [id]);
      for (const item of itens) {
        const resultadoItem = await client.query(
          `INSERT INTO prescricao_itens
             (prescricao_id, medicamento, dosagem, via_administracao, frequencia, duracao, quantidade, observacoes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            id,
            item.medicamento.trim(),
            item.dosagem || null,
            item.via_administracao || null,
            item.frequencia || null,
            item.duracao || null,
            item.quantidade || null,
            item.observacoes || null,
          ]
        );
        itensFinais.push(resultadoItem.rows[0]);
      }
    } else {
      const existentes = await client.query(
        'SELECT * FROM prescricao_itens WHERE prescricao_id = $1 ORDER BY id',
        [id]
      );
      itensFinais = existentes.rows;
    }

    await client.query('COMMIT');
    return res.json({ ...prescricao.rows[0], itens: itensFinais });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar prescrição:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar prescrição.' });
  } finally {
    client.release();
  }
}

/**
 * DELETE /prescricoes/:id
 * Só admin. Os itens são apagados em cascata (ON DELETE CASCADE).
 */
async function deletar(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('DELETE FROM prescricoes WHERE id = $1 RETURNING id', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Prescrição não encontrada.' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar prescrição:', err);
    return res.status(500).json({ erro: 'Erro interno ao deletar prescrição.' });
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
