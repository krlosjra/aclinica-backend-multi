const db = require('../config/db');

/**
 * GET /pacientes
 * Aceita ?busca=texto pra filtrar por nome ou CPF.
 *
 * Sem ?pagina: devolve a lista inteira (array), como sempre — mantém
 * as outras telas funcionando (Consultas, Prontuário, Usuários usam
 * a lista completa pra buscar/selecionar paciente digitando).
 *
 * Com ?pagina=N (e opcionalmente &limite=N, padrão 50, máx 200):
 * devolve paginado — usado pela tela de listagem de Pacientes, que
 * pode ter milhares de registros e não deve carregar tudo de uma vez.
 */
async function listar(req, res) {
  const { busca, pagina, limite } = req.query;

  try {
    if (!pagina) {
      let resultado;
      if (busca) {
        resultado = await db.query(
          `SELECT * FROM pacientes
           WHERE nome ILIKE $1 OR cpf ILIKE $1
           ORDER BY nome`,
          [`%${busca}%`]
        );
      } else {
        resultado = await db.query('SELECT * FROM pacientes ORDER BY nome');
      }
      return res.json(resultado.rows);
    }

    const paginaNum = Math.max(1, parseInt(pagina, 10) || 1);
    const limiteNum = Math.min(200, Math.max(1, parseInt(limite, 10) || 50));
    const offset = (paginaNum - 1) * limiteNum;

    const condicaoBusca = busca ? 'WHERE nome ILIKE $1 OR cpf ILIKE $1' : '';
    const valoresBase = busca ? [`%${busca}%`] : [];

    const [resultado, contagem] = await Promise.all([
      db.query(
        `SELECT * FROM pacientes ${condicaoBusca}
         ORDER BY nome
         LIMIT $${valoresBase.length + 1} OFFSET $${valoresBase.length + 2}`,
        [...valoresBase, limiteNum, offset]
      ),
      db.query(`SELECT COUNT(*) FROM pacientes ${condicaoBusca}`, valoresBase),
    ]);

    const total = parseInt(contagem.rows[0].count, 10);

    return res.json({
      pacientes: resultado.rows,
      total,
      pagina: paginaNum,
      limite: limiteNum,
      totalPaginas: Math.max(1, Math.ceil(total / limiteNum)),
    });
  } catch (err) {
    console.error('Erro ao listar pacientes:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar pacientes.' });
  }
}

/**
 * GET /pacientes/:id
 */
async function buscarPorId(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('SELECT * FROM pacientes WHERE id = $1', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Paciente não encontrado.' });
    }
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar paciente:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar paciente.' });
  }
}

/**
 * POST /pacientes
 */
async function criar(req, res) {
  const { nome, cpf, telefone, email, data_nascimento, observacoes, cep } = req.body;

  if (!nome) {
    return res.status(400).json({ erro: 'nome é obrigatório.' });
  }

  try {
    const resultado = await db.query(
      `INSERT INTO pacientes (nome, cpf, telefone, email, data_nascimento, observacoes, cep)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nome, cpf || null, telefone || null, email || null, data_nascimento || null, observacoes || null, cep || null]
    );
    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // violação de unique (cpf duplicado)
      return res.status(409).json({ erro: 'Já existe um paciente com esse CPF.' });
    }
    console.error('Erro ao criar paciente:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar paciente.' });
  }
}

/**
 * PUT /pacientes/:id
 */
async function atualizar(req, res) {
  const { id } = req.params;
  const { nome, cpf, telefone, email, data_nascimento, observacoes, cep } = req.body;

  try {
    const resultado = await db.query(
      `UPDATE pacientes
       SET nome = COALESCE($1, nome),
           cpf = COALESCE($2, cpf),
           telefone = COALESCE($3, telefone),
           email = COALESCE($4, email),
           data_nascimento = COALESCE($5, data_nascimento),
           observacoes = COALESCE($6, observacoes),
           cep = COALESCE($7, cep)
       WHERE id = $8
       RETURNING *`,
      [nome, cpf, telefone, email, data_nascimento, observacoes, cep, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Paciente não encontrado.' });
    }
    return res.json(resultado.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe um paciente com esse CPF.' });
    }
    console.error('Erro ao atualizar paciente:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar paciente.' });
  }
}

/**
 * DELETE /pacientes/:id
 * Só admin. Se o paciente tiver consultas vinculadas, o banco vai
 * recusar (ON DELETE RESTRICT) — nesse caso devolvemos 409.
 */
async function deletar(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('DELETE FROM pacientes WHERE id = $1 RETURNING id', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Paciente não encontrado.' });
    }
    return res.status(204).send();
  } catch (err) {
    if (err.code === '23503') { // violação de foreign key
      return res.status(409).json({
        erro: 'Não é possível excluir: este paciente possui consultas registradas.',
      });
    }
    console.error('Erro ao deletar paciente:', err);
    return res.status(500).json({ erro: 'Erro interno ao deletar paciente.' });
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
