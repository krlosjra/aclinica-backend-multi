const db = require('../config/db');
const caixaSessaoService = require('../services/caixaSessaoService');

const TIPOS_VALIDOS = ['entrada', 'saida'];
const FORMAS_PAGAMENTO_VALIDAS = ['dinheiro', 'cartao', 'pix'];

/**
 * GET /caixa/status
 * Diz se o caixa está aberto agora e, se sim, quem abriu e quando.
 * Antes de responder, fecha automaticamente qualquer sessão "esquecida
 * aberta" de um dia anterior — então esse endpoint também serve como
 * gatilho pra detectar isso assim que alguém abre a tela do caixa.
 */
async function status(req, res) {
  try {
    await caixaSessaoService.garantirSessaoAtualizada();
    const sessao = await caixaSessaoService.buscarSessaoAberta();

    let ultimaSessaoFechada = null;
    if (!sessao) {
      const resultado = await db.query(
        `SELECT * FROM caixa_sessoes WHERE status = 'fechado' ORDER BY fechado_em DESC LIMIT 1`
      );
      ultimaSessaoFechada = resultado.rows[0] || null;
    }

    return res.json({ aberto: !!sessao, sessao, ultima_sessao_fechada: ultimaSessaoFechada });
  } catch (err) {
    console.error('Erro ao consultar status do caixa:', err);
    return res.status(500).json({ erro: 'Erro interno ao consultar status do caixa.' });
  }
}

/**
 * POST /caixa/abrir
 * Abre o caixa do dia. Só é permitido se não houver outro caixa aberto.
 * Body: { valor_abertura?: number, observacoes?: string }
 */
async function abrir(req, res) {
  const valorAbertura = Number(req.body.valor_abertura) || 0;
  const { observacoes } = req.body;

  if (valorAbertura < 0) {
    return res.status(400).json({ erro: 'valor_abertura não pode ser negativo.' });
  }

  try {
    await caixaSessaoService.garantirSessaoAtualizada();
    const jaAberto = await caixaSessaoService.buscarSessaoAberta();
    if (jaAberto) {
      return res.status(409).json({ erro: 'O caixa já está aberto.' });
    }

    const resultado = await db.query(
      `INSERT INTO caixa_sessoes (aberto_por, valor_abertura, observacoes_abertura)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.usuario.id, valorAbertura, observacoes || null]
    );
    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao abrir caixa:', err);
    return res.status(500).json({ erro: 'Erro interno ao abrir o caixa.' });
  }
}

/**
 * POST /caixa/fechar
 * Fecha o caixa aberto no momento e devolve o resumo dos lançamentos
 * daquela sessão (útil pra recepção conferir o dinheiro na gaveta).
 * Body: { observacoes?: string }
 */
async function fechar(req, res) {
  const { observacoes } = req.body;

  try {
    await caixaSessaoService.garantirSessaoAtualizada();
    const sessao = await caixaSessaoService.buscarSessaoAberta();
    if (!sessao) {
      return res.status(404).json({ erro: 'Não há caixa aberto no momento.' });
    }

    const totais = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS total_entradas,
         COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) AS total_saidas,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS saldo_movimentado,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' AND forma_pagamento = 'dinheiro' THEN valor ELSE 0 END), 0) AS total_dinheiro,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' AND forma_pagamento = 'cartao' THEN valor ELSE 0 END), 0) AS total_cartao,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' AND forma_pagamento = 'pix' THEN valor ELSE 0 END), 0) AS total_pix
       FROM caixa
       WHERE caixa_sessao_id = $1`,
      [sessao.id]
    );

    const resultado = await db.query(
      `UPDATE caixa_sessoes
          SET status = 'fechado', fechado_em = NOW(), fechado_por = $1, observacoes_fechamento = $2
        WHERE id = $3
        RETURNING *`,
      [req.usuario.id, observacoes || null, sessao.id]
    );

    return res.json({ ...resultado.rows[0], resumo: totais.rows[0] });
  } catch (err) {
    console.error('Erro ao fechar caixa:', err);
    return res.status(500).json({ erro: 'Erro interno ao fechar o caixa.' });
  }
}

/**
 * GET /caixa
 * Lista lançamentos. Filtros opcionais:
 *   ?tipo=entrada&forma_pagamento=pix&consulta_id=5&data_inicio=2026-08-01&data_fim=2026-08-31
 */
async function listar(req, res) {
  const { tipo, forma_pagamento, consulta_id, data_inicio, data_fim, caixa_sessao_id } = req.query;

  const condicoes = [];
  const valores = [];

  if (caixa_sessao_id) {
    valores.push(caixa_sessao_id);
    condicoes.push(`caixa_sessao_id = $${valores.length}`);
  }
  if (tipo) {
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ erro: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` });
    }
    valores.push(tipo);
    condicoes.push(`tipo = $${valores.length}`);
  }
  if (forma_pagamento) {
    if (!FORMAS_PAGAMENTO_VALIDAS.includes(forma_pagamento)) {
      return res
        .status(400)
        .json({ erro: `forma_pagamento deve ser um de: ${FORMAS_PAGAMENTO_VALIDAS.join(', ')}` });
    }
    valores.push(forma_pagamento);
    condicoes.push(`forma_pagamento = $${valores.length}`);
  }
  if (consulta_id) {
    valores.push(consulta_id);
    condicoes.push(`consulta_id = $${valores.length}`);
  }
  if (data_inicio) {
    valores.push(data_inicio);
    condicoes.push(`data_lancamento >= $${valores.length}`);
  }
  if (data_fim) {
    valores.push(data_fim);
    condicoes.push(`data_lancamento <= $${valores.length}`);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  try {
    const resultado = await db.query(
      `SELECT * FROM caixa ${where} ORDER BY data_lancamento DESC`,
      valores
    );
    return res.json(resultado.rows);
  } catch (err) {
    console.error('Erro ao listar lançamentos:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar lançamentos.' });
  }
}

/**
 * GET /caixa/resumo
 * Totais de entrada, saída e saldo num período — já separado por
 * forma de pagamento, pra facilitar relatórios (dinheiro/cartão/pix).
 *   ?data_inicio=2026-08-01&data_fim=2026-08-31
 */
async function resumo(req, res) {
  const { data_inicio, data_fim } = req.query;

  const condicoes = [];
  const valores = [];

  if (data_inicio) {
    valores.push(data_inicio);
    condicoes.push(`data_lancamento >= $${valores.length}`);
  }
  if (data_fim) {
    valores.push(data_fim);
    condicoes.push(`data_lancamento <= $${valores.length}`);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  try {
    const resultado = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS total_entradas,
         COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) AS total_saidas,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS saldo,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' AND forma_pagamento = 'dinheiro' THEN valor ELSE 0 END), 0) AS total_dinheiro,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' AND forma_pagamento = 'cartao' THEN valor ELSE 0 END), 0) AS total_cartao,
         COALESCE(SUM(CASE WHEN tipo = 'entrada' AND forma_pagamento = 'pix' THEN valor ELSE 0 END), 0) AS total_pix
       FROM caixa ${where}`,
      valores
    );
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao gerar resumo do caixa:', err);
    return res.status(500).json({ erro: 'Erro interno ao gerar resumo.' });
  }
}

/**
 * GET /caixa/relatorio
 * Relatório consolidado de caixa nos 4 recortes de período (diário,
 * semanal, mensal e anual), todos calculados em torno da mesma data
 * de referência. Cada período traz entradas, saídas, saldo e, no
 * final, as entradas separadas por forma de pagamento — pra fechar
 * a gaveta sabendo quanto entrou em dinheiro/cartão/pix.
 *   ?data=2026-08-14   (opcional; padrão: hoje)
 *
 * Semana = segunda a domingo da semana que contém a data de referência.
 * Mês e ano seguem o calendário (1º ao último dia do mês/ano).
 */
async function relatorio(req, res) {
  const { data } = req.query;

  try {
    const resultado = await db.query(
      `WITH ref AS (
         SELECT COALESCE($1::date, CURRENT_DATE) AS d
       ),
       periodos AS (
         SELECT 'diario' AS periodo, 1 AS ordem, d AS inicio, d AS fim FROM ref
         UNION ALL
         SELECT 'semanal', 2, date_trunc('week', d)::date, (date_trunc('week', d) + INTERVAL '6 days')::date FROM ref
         UNION ALL
         SELECT 'mensal', 3, date_trunc('month', d)::date, (date_trunc('month', d) + INTERVAL '1 month - 1 day')::date FROM ref
         UNION ALL
         SELECT 'anual', 4, date_trunc('year', d)::date, (date_trunc('year', d) + INTERVAL '1 year - 1 day')::date FROM ref
       )
       SELECT
         p.periodo,
         p.inicio,
         p.fim,
         COALESCE(SUM(CASE WHEN c.tipo = 'entrada' THEN c.valor ELSE 0 END), 0) AS total_entradas,
         COALESCE(SUM(CASE WHEN c.tipo = 'saida' THEN c.valor ELSE 0 END), 0) AS total_saidas,
         COALESCE(SUM(CASE WHEN c.tipo = 'entrada' THEN c.valor ELSE -c.valor END), 0) AS saldo,
         COALESCE(SUM(CASE WHEN c.tipo = 'entrada' AND c.forma_pagamento = 'dinheiro' THEN c.valor ELSE 0 END), 0) AS total_dinheiro,
         COALESCE(SUM(CASE WHEN c.tipo = 'entrada' AND c.forma_pagamento = 'cartao' THEN c.valor ELSE 0 END), 0) AS total_cartao,
         COALESCE(SUM(CASE WHEN c.tipo = 'entrada' AND c.forma_pagamento = 'pix' THEN c.valor ELSE 0 END), 0) AS total_pix
       FROM periodos p
       LEFT JOIN caixa c
         ON c.data_lancamento >= p.inicio
        AND c.data_lancamento < (p.fim + INTERVAL '1 day')
       GROUP BY p.periodo, p.ordem, p.inicio, p.fim
       ORDER BY p.ordem`,
      [data || null]
    );

    const periodos = {};
    for (const linha of resultado.rows) {
      periodos[linha.periodo] = { ...linha, lancamentos: [] };
    }

    // Além dos totais, o relatório lista cada lançamento (com descrição)
    // dentro do período correspondente — uma consulta por período, já
    // que os intervalos de data são diferentes para cada um.
    const listas = await Promise.all(
      resultado.rows.map((p) =>
        db.query(
          `SELECT id, data_lancamento, tipo, descricao, valor, forma_pagamento
             FROM caixa
            WHERE data_lancamento >= $1
              AND data_lancamento < ($2::date + INTERVAL '1 day')
            ORDER BY data_lancamento ASC`,
          [p.inicio, p.fim]
        )
      )
    );
    resultado.rows.forEach((p, i) => {
      periodos[p.periodo].lancamentos = listas[i].rows;
    });

    return res.json({ data_referencia: data || null, periodos });
  } catch (err) {
    console.error('Erro ao gerar relatório de caixa:', err);
    return res.status(500).json({ erro: 'Erro interno ao gerar relatório de caixa.' });
  }
}

/**
 * POST /caixa
 * Lançamento manual (ex: saída pra pagar aluguel, compra de material,
 * ou entrada avulsa que não veio de uma consulta/exame).
 * forma_pagamento é obrigatório apenas para lançamentos de entrada.
 * Exige o caixa aberto — todo lançamento pertence à sessão do dia.
 */
async function criar(req, res) {
  const { tipo, descricao, valor, consulta_id, forma_pagamento } = req.body;

  if (!tipo || !descricao || valor === undefined) {
    return res.status(400).json({ erro: 'tipo, descricao e valor são obrigatórios.' });
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ erro: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` });
  }
  if (Number(valor) <= 0) {
    return res.status(400).json({ erro: 'valor deve ser maior que zero.' });
  }
  if (tipo === 'entrada' && !FORMAS_PAGAMENTO_VALIDAS.includes(forma_pagamento)) {
    return res
      .status(400)
      .json({ erro: `Para entradas, informe forma_pagamento (${FORMAS_PAGAMENTO_VALIDAS.join(', ')}).` });
  }

  try {
    await caixaSessaoService.garantirSessaoAtualizada();
    const sessaoAberta = await caixaSessaoService.buscarSessaoAberta();
    if (!sessaoAberta) {
      return res.status(400).json({ erro: 'O caixa está fechado. Abra o caixa antes de lançar.' });
    }

    const resultado = await db.query(
      `INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, consulta_id, usuario_id, caixa_sessao_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tipo,
        descricao,
        valor,
        tipo === 'entrada' ? forma_pagamento : null,
        consulta_id || null,
        req.usuario.id,
        sessaoAberta.id,
      ]
    );
    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao criar lançamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar lançamento.' });
  }
}

/**
 * DELETE /caixa/:id
 * Só admin — estorno de um lançamento incorreto.
 */
async function deletar(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('DELETE FROM caixa WHERE id = $1 RETURNING id', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Lançamento não encontrado.' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar lançamento:', err);
    return res.status(500).json({ erro: 'Erro interno ao deletar lançamento.' });
  }
}

module.exports = { listar, resumo, relatorio, criar, deletar, status, abrir, fechar };
