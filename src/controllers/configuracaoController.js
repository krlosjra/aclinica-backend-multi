const db = require('../config/db');

// A tabela configuracao_clinica também guarda a licença comercial
// (licenca_*) — nunca usar SELECT */RETURNING * aqui, senão qualquer
// usuário autenticado (esta rota é liberada pra todo mundo, não só
// admin) conseguiria ver a chave de licença da clínica.
const COLUNAS_CONFIG = 'nome, cnpj, endereco, telefone, email, site, impostos_ativos, aliquota_ibs, aliquota_cbs';

/**
 * GET /configuracao
 * Qualquer usuário autenticado pode ler (precisa pra montar impressões).
 * Se ainda não foi configurado, devolve um objeto vazio (não é erro).
 */
async function obter(req, res) {
  try {
    const resultado = await db.query(`SELECT ${COLUNAS_CONFIG} FROM configuracao_clinica WHERE id = 1`);
    if (resultado.rows.length === 0) {
      return res.json({
        nome: '',
        cnpj: '',
        endereco: '',
        telefone: '',
        email: '',
        site: '',
        impostos_ativos: false,
        aliquota_ibs: 0,
        aliquota_cbs: 0,
      });
    }
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao obter configuração da clínica:', err);
    return res.status(500).json({ erro: 'Erro interno ao obter configuração.' });
  }
}

/**
 * PUT /configuracao
 * Só admin. Faz upsert na linha única (id = 1) — só nas colunas de
 * configuração; as colunas de licença (licenca_*) nunca são tocadas
 * aqui (quem mexe nelas é licencaService).
 */
async function atualizar(req, res) {
  const { nome, cnpj, endereco, telefone, email, site } = req.body;
  const impostos_ativos = !!req.body.impostos_ativos;
  const aliquota_ibs = Number(req.body.aliquota_ibs) || 0;
  const aliquota_cbs = Number(req.body.aliquota_cbs) || 0;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'nome é obrigatório.' });
  }
  if (aliquota_ibs < 0 || aliquota_ibs > 100 || aliquota_cbs < 0 || aliquota_cbs > 100) {
    return res.status(400).json({ erro: 'As alíquotas devem estar entre 0 e 100.' });
  }

  try {
    const resultado = await db.query(
      `INSERT INTO configuracao_clinica
         (id, nome, cnpj, endereco, telefone, email, site, impostos_ativos, aliquota_ibs, aliquota_cbs, atualizado_em)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         nome = EXCLUDED.nome,
         cnpj = EXCLUDED.cnpj,
         endereco = EXCLUDED.endereco,
         telefone = EXCLUDED.telefone,
         email = EXCLUDED.email,
         site = EXCLUDED.site,
         impostos_ativos = EXCLUDED.impostos_ativos,
         aliquota_ibs = EXCLUDED.aliquota_ibs,
         aliquota_cbs = EXCLUDED.aliquota_cbs,
         atualizado_em = NOW()
       RETURNING ${COLUNAS_CONFIG}`,
      [
        nome,
        cnpj || null,
        endereco || null,
        telefone || null,
        email || null,
        site || null,
        impostos_ativos,
        aliquota_ibs,
        aliquota_cbs,
      ]
    );
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar configuração da clínica:', err);
    return res.status(500).json({ erro: 'Erro interno ao atualizar configuração.' });
  }
}

module.exports = { obter, atualizar };
