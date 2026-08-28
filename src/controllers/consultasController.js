const db = require('../config/db');
const caixaSessaoService = require('../services/caixaSessaoService');

const STATUS_VALIDOS = ['agendada', 'confirmada', 'realizada', 'cancelada'];
const TIPOS_VALIDOS = ['consulta', 'exame'];
const HORAS_MINIMAS_PARA_CANCELAMENTO_PACIENTE = 24;

/**
 * GET /consultas
 * Lista consultas/exames com filtros opcionais via query string:
 *   ?medico_id=1&paciente_id=2&status=agendada&tipo=exame&data_inicio=...&data_fim=...&laudado=true|false
 *
 * Sem ?pagina: devolve a lista inteira (array), como sempre — usado
 * pela agenda (calendário) e por telas que já filtram por período.
 *
 * Com ?pagina=N (e opcionalmente &limite=N, padrão 50, máx 200):
 * devolve paginado — usado por listas que não têm um recorte de data
 * natural (ex: histórico de exames já laudados), que senão cresceriam
 * pra sempre.
 */
async function listar(req, res) {
  const { status, data_inicio, data_fim, tipo, pagina, limite, laudado } = req.query;
  let { medico_id, paciente_id } = req.query;

  if (req.usuario.role === 'medico') {
    medico_id = req.usuario.id;
  }
  if (req.usuario.role === 'paciente') {
    paciente_id = req.usuario.paciente_id;
  }

  const condicoes = [];
  const valores = [];

  if (medico_id) {
    valores.push(medico_id);
    condicoes.push(`c.medico_id = $${valores.length}`);
  }
  if (paciente_id) {
    valores.push(paciente_id);
    condicoes.push(`c.paciente_id = $${valores.length}`);
  }
  if (status) {
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` });
    }
    valores.push(status);
    condicoes.push(`c.status = $${valores.length}`);
  }
  if (tipo) {
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ erro: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` });
    }
    valores.push(tipo);
    condicoes.push(`c.tipo = $${valores.length}`);
  }
  if (data_inicio) {
    valores.push(data_inicio);
    condicoes.push(`c.data_hora >= $${valores.length}`);
  }
  if (data_fim) {
    // "< dia seguinte" em vez de "<= data_fim": um data_fim="2026-08-20"
    // sem hora vira meia-noite pro Postgres, o que excluiria qualquer
    // consulta depois das 00:00 daquele dia. Com "<", o dia inteiro entra.
    valores.push(data_fim);
    condicoes.push(`c.data_hora < ($${valores.length}::date + INTERVAL '1 day')`);
  }
  if (laudado === 'true') {
    condicoes.push('l.id IS NOT NULL');
  } else if (laudado === 'false') {
    condicoes.push('l.id IS NULL');
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  try {
    if (!pagina) {
      const resultado = await db.query(
        `SELECT c.*, p.nome AS paciente_nome, p.cpf AS paciente_cpf, m.nome AS medico_nome, e.nome AS exame_nome, e.termo_consentimento AS exame_termo_consentimento,
                l.id AS laudo_id, t.id AS termo_assinado_id
         FROM consultas c
         JOIN pacientes p ON p.id = c.paciente_id
         LEFT JOIN usuarios m ON m.id = c.medico_id
         LEFT JOIN exames e ON e.id = c.exame_id
         LEFT JOIN laudos l ON l.consulta_id = c.id
         LEFT JOIN termos_consentimento_assinados t ON t.consulta_id = c.id
         ${where}
         ORDER BY c.data_hora`,
        valores
      );
      return res.json(resultado.rows);
    }

    const paginaNum = Math.max(1, parseInt(pagina, 10) || 1);
    const limiteNum = Math.min(200, Math.max(1, parseInt(limite, 10) || 50));
    const offset = (paginaNum - 1) * limiteNum;

    const [resultado, contagem] = await Promise.all([
      db.query(
        `SELECT c.*, p.nome AS paciente_nome, p.cpf AS paciente_cpf, m.nome AS medico_nome, e.nome AS exame_nome, e.termo_consentimento AS exame_termo_consentimento,
                l.id AS laudo_id, t.id AS termo_assinado_id
         FROM consultas c
         JOIN pacientes p ON p.id = c.paciente_id
         LEFT JOIN usuarios m ON m.id = c.medico_id
         LEFT JOIN exames e ON e.id = c.exame_id
         LEFT JOIN laudos l ON l.consulta_id = c.id
         LEFT JOIN termos_consentimento_assinados t ON t.consulta_id = c.id
         ${where}
         ORDER BY c.data_hora DESC
         LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
        [...valores, limiteNum, offset]
      ),
      db.query(`SELECT COUNT(*) FROM consultas c ${where}`, valores),
    ]);

    const total = parseInt(contagem.rows[0].count, 10);

    return res.json({
      consultas: resultado.rows,
      total,
      pagina: paginaNum,
      limite: limiteNum,
      totalPaginas: Math.max(1, Math.ceil(total / limiteNum)),
    });
  } catch (err) {
    console.error('Erro ao listar consultas:', err);
    return res.status(500).json({ erro: 'Erro interno ao listar consultas.' });
  }
}

/**
 * GET /consultas/:id
 */
async function buscarPorId(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query(
      `SELECT c.*, p.nome AS paciente_nome, p.cpf AS paciente_cpf, m.nome AS medico_nome, e.nome AS exame_nome, e.termo_consentimento AS exame_termo_consentimento,
              l.id AS laudo_id, t.id AS termo_assinado_id
       FROM consultas c
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN usuarios m ON m.id = c.medico_id
       LEFT JOIN exames e ON e.id = c.exame_id
       LEFT JOIN laudos l ON l.consulta_id = c.id
         LEFT JOIN termos_consentimento_assinados t ON t.consulta_id = c.id
       WHERE c.id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Consulta não encontrada.' });
    }

    const consulta = resultado.rows[0];

    if (req.usuario.role === 'medico' && consulta.medico_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Você não tem acesso a esta consulta.' });
    }
    if (req.usuario.role === 'paciente' && consulta.paciente_id !== req.usuario.paciente_id) {
      return res.status(403).json({ erro: 'Você não tem acesso a esta consulta.' });
    }

    return res.json(consulta);
  } catch (err) {
    console.error('Erro ao buscar consulta:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar consulta.' });
  }
}

/**
 * POST /consultas
 * Marca uma nova consulta OU exame (campo "tipo").
 * - admin/recepção: podem marcar pra qualquer paciente.
 * - paciente: só pode marcar pra si mesmo (paciente_id forçado a
 *   partir do token, ignorando o que vier no body).
 * - medico_id é obrigatório para "consulta"; para "exame" é opcional
 *   (médico solicitante, quando houver).
 */
async function criar(req, res) {
  const { medico_id, data_hora, observacoes } = req.body;
  let { paciente_id, valor, tipo, exame_id } = req.body;

  tipo = tipo === 'exame' ? 'exame' : 'consulta';

  if (req.usuario.role === 'paciente') {
    if (!req.usuario.paciente_id) {
      return res.status(400).json({
        erro: 'Sua conta não está vinculada a um cadastro de paciente. Procure a recepção.',
      });
    }
    paciente_id = req.usuario.paciente_id;
    valor = 0; // paciente não define o valor
  }

  if (!paciente_id || !data_hora) {
    return res.status(400).json({ erro: 'paciente_id e data_hora são obrigatórios.' });
  }
  if (tipo === 'consulta' && !medico_id) {
    return res.status(400).json({ erro: 'medico_id é obrigatório para consultas.' });
  }
  if (tipo === 'exame' && !exame_id) {
    return res.status(400).json({ erro: 'exame_id é obrigatório quando tipo é "exame".' });
  }

  try {
    if (medico_id) {
      const medico = await db.query(
        `SELECT id FROM usuarios WHERE id = $1 AND role = 'medico' AND ativo = TRUE`,
        [medico_id]
      );
      if (medico.rows.length === 0) {
        return res.status(400).json({ erro: 'Médico não encontrado ou inativo.' });
      }
    }

    // Se for exame e nenhum valor foi enviado, usa o valor padrão do catálogo
    if (tipo === 'exame' && (valor === undefined || valor === null || valor === '')) {
      const exame = await db.query('SELECT valor_padrao FROM exames WHERE id = $1 AND ativo = TRUE', [
        exame_id,
      ]);
      if (exame.rows.length === 0) {
        return res.status(400).json({ erro: 'Exame não encontrado ou inativo.' });
      }
      valor = exame.rows[0].valor_padrao;
    }

    const resultado = await db.query(
      `INSERT INTO consultas (paciente_id, medico_id, criado_por, data_hora, valor, observacoes, tipo, exame_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        paciente_id,
        medico_id || null,
        req.usuario.id,
        data_hora,
        valor || 0,
        observacoes || null,
        tipo,
        tipo === 'exame' ? exame_id : null,
      ]
    );

    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Este médico já tem um agendamento neste horário.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Paciente ou exame não encontrado.' });
    }
    console.error('Erro ao criar consulta:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar consulta.' });
  }
}

/**
 * PUT /consultas/:id
 * Reagendar / editar valor / observações. Admin e recepção.
 */
async function atualizar(req, res) {
  const { id } = req.params;
  const { data_hora, valor, observacoes, medico_id } = req.body;

  try {
    const resultado = await db.query(
      `UPDATE consultas
       SET data_hora = COALESCE($1, data_hora),
           valor = COALESCE($2, valor),
           observacoes = COALESCE($3, observacoes),
           medico_id = COALESCE($4, medico_id)
       WHERE id = $5
       RETURNING *`,
      [data_hora ?? null, valor ?? null, observacoes ?? null, medico_id ?? null, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Consulta não encontrada.' });
    }
    return res.json(resultado.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Este médico já tem um agendamento neste horário.' });
    }
    console.error('Erro ao atualizar consulta:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar consulta.' });
  }
}

/**
 * PATCH /consultas/:id/status
 * Muda o status.
 * - médico: confirma/realiza/cancela as PRÓPRIAS consultas.
 * - admin/recepção: qualquer transição, em qualquer consulta.
 * - paciente: só pode CANCELAR a própria, com no mínimo 24h de antecedência.
 *
 * IMPORTANTE: a entrada no caixa agora acontece na CONFIRMAÇÃO
 * (agendada -> confirmada), não mais quando marca como "realizada".
 * O pagamento pode vir dividido entre os meios (ex: parte em dinheiro,
 * parte no cartão), então o body aceita um valor por meio:
 *   { status: 'confirmada', valor_dinheiro?: number, valor_cartao?: number, valor_pix?: number }
 * Pelo menos um dos três precisa ser maior que zero. Cada meio usado
 * vira uma linha separada no caixa (assim o relatório por forma de
 * pagamento continua exato).
 */
async function atualizarStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const valorDinheiro = Number(req.body.valor_dinheiro) || 0;
  const valorCartao = Number(req.body.valor_cartao) || 0;
  const valorPix = Number(req.body.valor_pix) || 0;

  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const consultaAtual = await client.query(
      `SELECT c.*, p.nome AS paciente_nome, e.nome AS exame_nome, e.termo_consentimento AS exame_termo_consentimento
       FROM consultas c
       JOIN pacientes p ON p.id = c.paciente_id
       LEFT JOIN exames e ON e.id = c.exame_id
       WHERE c.id = $1
       FOR UPDATE OF c`,
      [id]
    );
    if (consultaAtual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Consulta não encontrada.' });
    }
    const consulta = consultaAtual.rows[0];

    if (req.usuario.role === 'medico' && consulta.medico_id !== req.usuario.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ erro: 'Você não tem acesso a esta consulta.' });
    }

    if (req.usuario.role === 'paciente') {
      if (consulta.paciente_id !== req.usuario.paciente_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ erro: 'Você não tem acesso a esta consulta.' });
      }
      if (status !== 'cancelada') {
        await client.query('ROLLBACK');
        return res.status(403).json({ erro: 'Você só pode cancelar a sua consulta.' });
      }
      if (!['agendada', 'confirmada'].includes(consulta.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Esta consulta não pode mais ser cancelada.' });
      }

      const horasAteConsulta = (new Date(consulta.data_hora) - new Date()) / (1000 * 60 * 60);
      if (horasAteConsulta < HORAS_MINIMAS_PARA_CANCELAMENTO_PACIENTE) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          erro: 'Só é possível cancelar com no mínimo 1 dia de antecedência. Entre em contato com a recepção.',
        });
      }
    }

    // Confirmação = momento do pagamento (pode vir dividido entre os meios)
    let sessaoCaixaAberta = null;
    let valorIbs = 0;
    let valorCbs = 0;
    if (status === 'confirmada') {
      // Exame com termo de consentimento cadastrado exige o termo
      // assinado e digitalizado ANTES de confirmar o pagamento — essa é
      // a trava de verdade; o frontend já bloqueia isso antes, mas quem
      // bate direto na API não pode contornar a regra.
      if (
        consulta.tipo === 'exame' &&
        consulta.exame_termo_consentimento &&
        consulta.exame_termo_consentimento.trim()
      ) {
        const termoEnviado = await client.query(
          'SELECT id FROM termos_consentimento_assinados WHERE consulta_id = $1',
          [id]
        );
        if (termoEnviado.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            erro:
              'Este exame exige o termo de consentimento assinado e digitalizado antes de confirmar o pagamento.',
          });
        }
      }

      if (valorDinheiro < 0 || valorCartao < 0 || valorPix < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Os valores de pagamento não podem ser negativos.' });
      }
      if (valorDinheiro + valorCartao + valorPix <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          erro: 'Informe ao menos um valor recebido (dinheiro, cartão ou PIX) para confirmar.',
        });
      }

      // IBS/CBS (preparação pra Reforma Tributária): calculado aqui, no
      // servidor, a partir da alíquota configurada — nunca confiando num
      // valor de imposto que viesse pronto do frontend. Regra de negócio:
      // pagamento em cartão ou PIX SEMPRE inclui o imposto; só quando é
      // 100% dinheiro é que vira opcional (via incluir_imposto no body).
      const config = await client.query(
        'SELECT impostos_ativos, aliquota_ibs, aliquota_cbs FROM clinica_config WHERE id = 1'
      );
      if (config.rows.length > 0 && config.rows[0].impostos_ativos) {
        const pagamentoTemCartaoOuPix = valorCartao > 0 || valorPix > 0;
        const incluirImposto = pagamentoTemCartaoOuPix ? true : req.body.incluir_imposto !== false;

        if (incluirImposto) {
          const baseCalculo = Number(consulta.valor) || 0;
          const aliquotaIbs = Number(config.rows[0].aliquota_ibs) || 0;
          const aliquotaCbs = Number(config.rows[0].aliquota_cbs) || 0;
          valorIbs = Math.round(baseCalculo * (aliquotaIbs / 100) * 100) / 100;
          valorCbs = Math.round(baseCalculo * (aliquotaCbs / 100) * 100) / 100;
        }
      }

      // O pagamento vira um lançamento no caixa, então precisa de uma
      // sessão de caixa aberta (recepção precisa ter aberto o caixa do dia).
      await caixaSessaoService.garantirSessaoAtualizada(client);
      sessaoCaixaAberta = await caixaSessaoService.buscarSessaoAberta(client);
      if (!sessaoCaixaAberta) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          erro: 'O caixa do dia ainda não foi aberto. Peça para a recepção abrir o caixa antes de confirmar o pagamento.',
        });
      }
    }

    // valor_ibs/valor_cbs só são tocados na confirmação — mudanças de
    // status seguintes (realizada, cancelada) preservam o que foi
    // efetivamente cobrado naquele pagamento, não recalculam.
    const atualizada = await client.query(
      `UPDATE consultas
       SET status = $1::status_consulta,
           valor_ibs = CASE WHEN $1::text = 'confirmada' THEN $2 ELSE valor_ibs END,
           valor_cbs = CASE WHEN $1::text = 'confirmada' THEN $3 ELSE valor_cbs END
       WHERE id = $4
       RETURNING *`,
      [status, valorIbs, valorCbs, id]
    );

    if (status === 'confirmada') {
      const jaTemLancamento = await client.query('SELECT id FROM caixa WHERE consulta_id = $1', [id]);
      if (jaTemLancamento.rows.length === 0) {
        const descricao =
          consulta.tipo === 'exame'
            ? `${consulta.exame_nome || 'Exame'}: ${consulta.paciente_nome}`
            : `Consulta: ${consulta.paciente_nome}`;
        const pagamentos = [
          { forma: 'dinheiro', valor: valorDinheiro },
          { forma: 'cartao', valor: valorCartao },
          { forma: 'pix', valor: valorPix },
        ].filter((p) => p.valor > 0);

        for (const pagamento of pagamentos) {
          await client.query(
            `INSERT INTO caixa (tipo, descricao, valor, forma_pagamento, consulta_id, usuario_id, caixa_sessao_id)
             VALUES ('entrada', $1, $2, $3, $4, $5, $6)`,
            [descricao, pagamento.valor, pagamento.forma, id, req.usuario.id, sessaoCaixaAberta.id]
          );
        }
      }
    }

    await client.query('COMMIT');
    return res.json(atualizada.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar status da consulta:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar status.' });
  } finally {
    client.release();
  }
}

/**
 * DELETE /consultas/:id
 * Exclusão definitiva. Só admin.
 */
async function deletar(req, res) {
  const { id } = req.params;
  try {
    const resultado = await db.query('DELETE FROM consultas WHERE id = $1 RETURNING id', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Consulta não encontrada.' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar consulta:', err);
    return res.status(500).json({ erro: 'Erro interno ao deletar consulta.' });
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, atualizarStatus, deletar };
