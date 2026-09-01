const masterDb = require('../config/masterDb');

// Páginas contáveis: lista fechada, pra ninguém conseguir criar linhas
// arbitrárias na tabela mandando um `pagina` qualquer na URL.
const PAGINAS_VALIDAS = new Set(['inicio']);

/**
 * POST /acessos/:pagina
 * Incrementa o contador de acesso de uma página do site institucional.
 * Rota pública (sem tenant, sem login) — o site não pertence a
 * nenhuma clínica, por isso usa o banco mestre em vez do banco por
 * tenant.
 */
async function registrar(req, res) {
  const { pagina } = req.params;

  if (!PAGINAS_VALIDAS.has(pagina)) {
    return res.status(404).json({ erro: 'Página inválida.' });
  }

  try {
    const resultado = await masterDb.query(
      `UPDATE acessos_site
       SET total_acessos = total_acessos + 1, atualizado_em = NOW()
       WHERE pagina = $1
       RETURNING total_acessos`,
      [pagina]
    );
    return res.json({ total: Number(resultado.rows[0].total_acessos) });
  } catch (err) {
    console.error('Erro ao registrar acesso do site:', err);
    return res.status(500).json({ erro: 'Erro ao registrar acesso.' });
  }
}

/**
 * GET /acessos/:pagina
 * Consulta o total atual, sem incrementar.
 */
async function consultar(req, res) {
  const { pagina } = req.params;

  if (!PAGINAS_VALIDAS.has(pagina)) {
    return res.status(404).json({ erro: 'Página inválida.' });
  }

  try {
    const resultado = await masterDb.query(
      `SELECT total_acessos FROM acessos_site WHERE pagina = $1`,
      [pagina]
    );
    return res.json({ total: Number(resultado.rows[0]?.total_acessos || 0) });
  } catch (err) {
    console.error('Erro ao consultar acessos do site:', err);
    return res.status(500).json({ erro: 'Erro ao consultar acessos.' });
  }
}

module.exports = { registrar, consultar };
