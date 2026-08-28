const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const tenantManager = require('../config/tenantManager');
require('dotenv').config();

const ROLES_STAFF = ['admin', 'medico', 'recepcao'];

// `dominio` vai dentro do token: é o que o middleware resolverTenant
// usa, em toda requisição seguinte, pra saber em qual banco (qual
// clínica) rodar as queries — sem precisar consultar o banco mestre
// de novo a cada request autenticado.
function gerarToken(usuario, dominio) {
  return jwt.sign(
    {
      id: usuario.id,
      nome: usuario.nome,
      role: usuario.role,
      paciente_id: usuario.paciente_id || null,
      dominio,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

/**
 * POST /auth/registrar
 * Cria um usuário de STAFF (admin, medico ou recepcao) — restrito a
 * administradores já autenticados (ver authRoutes.js).
 *
 * Também é usado pelo admin pra dar acesso de login a um paciente que
 * já está cadastrado no sistema: nesse caso, envie role="paciente" e
 * paciente_id (o id de um registro em `pacientes` que ainda não tenha
 * conta vinculada).
 */
async function registrar(req, res) {
  const { nome, email, senha, role, crm, especialidade, paciente_id } = req.body;

  if (!nome || !email || !senha || !role) {
    return res.status(400).json({ erro: 'nome, email, senha e role são obrigatórios.' });
  }

  if (![...ROLES_STAFF, 'paciente'].includes(role)) {
    return res.status(400).json({ erro: `role deve ser um de: ${[...ROLES_STAFF, 'paciente'].join(', ')}` });
  }

  if (senha.length < 6) {
    return res.status(400).json({ erro: 'senha deve ter no mínimo 6 caracteres.' });
  }

  if (role === 'paciente' && !paciente_id) {
    return res.status(400).json({ erro: 'paciente_id é obrigatório para criar acesso de paciente.' });
  }

  // O login identifica a clínica pelo domínio do email — um usuário
  // com domínio diferente do da própria clínica nunca conseguiria
  // logar (o roteamento cairia no banco errado, ou em nenhum).
  const dominioEsperado = req.clinica && req.clinica.dominio;
  if (dominioEsperado && tenantManager.extrairDominio(email) !== dominioEsperado) {
    return res.status(400).json({
      erro: `O email precisa terminar em @${dominioEsperado} (mesmo domínio desta clínica) para que o login funcione.`,
    });
  }

  try {
    const existente = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Já existe um usuário com esse email.' });
    }

    if (role === 'paciente') {
      const paciente = await db.query('SELECT id FROM pacientes WHERE id = $1', [paciente_id]);
      if (paciente.rows.length === 0) {
        return res.status(400).json({ erro: 'Paciente não encontrado.' });
      }
      const jaTemAcesso = await db.query('SELECT id FROM usuarios WHERE paciente_id = $1', [paciente_id]);
      if (jaTemAcesso.rows.length > 0) {
        return res.status(409).json({ erro: 'Este paciente já tem uma conta de acesso.' });
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const resultado = await db.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, crm, especialidade, paciente_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nome, email, role, crm, especialidade, paciente_id, criado_em`,
      [
        nome,
        email,
        senhaHash,
        role,
        role === 'medico' ? crm || null : null,
        role === 'medico' ? especialidade || null : null,
        role === 'paciente' ? paciente_id : null,
      ]
    );

    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao registrar usuário:', err);
    return res.status(500).json({ erro: 'Erro interno ao registrar usuário.' });
  }
}

/**
 * POST /auth/registrar-paciente
 * Rota PÚBLICA (sem login) — auto-cadastro de paciente pela tela de login.
 * Cria o registro clínico (pacientes) e a conta de acesso (usuarios) juntos,
 * numa transação, e já devolve um token (login automático).
 */
async function registrarPaciente(req, res) {
  const { nome, email, senha, cpf, telefone, data_nascimento, cep } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ erro: 'senha deve ter no mínimo 6 caracteres.' });
  }

  // O middleware resolverTenant já tentou resolver a clínica pelo
  // domínio deste mesmo email. Se não achou, req.clinica fica null —
  // e sem clínica não tem em qual banco cadastrar o paciente.
  if (!req.clinica) {
    return res.status(404).json({
      erro: 'Não encontramos uma clínica cadastrada para esse domínio de email. Confira o email ou fale com a clínica.',
    });
  }
  const dominio = req.clinica.dominio;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existente = await client.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existente.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Já existe uma conta com esse email.' });
    }

    if (cpf) {
      const cpfExistente = await client.query('SELECT id FROM pacientes WHERE cpf = $1', [cpf]);
      if (cpfExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          erro: 'Já existe um cadastro com esse CPF. Procure a recepção para vincular seu acesso.',
        });
      }
    }

    const paciente = await client.query(
      `INSERT INTO pacientes (nome, cpf, telefone, email, data_nascimento, cep)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [nome, cpf || null, telefone || null, email, data_nascimento || null, cep || null]
    );
    const pacienteId = paciente.rows[0].id;

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, paciente_id)
       VALUES ($1, $2, $3, 'paciente', $4)
       RETURNING id, nome, email, role, paciente_id, ativo`,
      [nome, email, senhaHash, pacienteId]
    );

    await client.query('COMMIT');

    const token = gerarToken(usuario.rows[0], dominio);
    return res.status(201).json({
      token,
      usuario: {
        id: usuario.rows[0].id,
        nome: usuario.rows[0].nome,
        email: usuario.rows[0].email,
        role: usuario.rows[0].role,
        paciente_id: usuario.rows[0].paciente_id,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe um cadastro com esses dados.' });
    }
    console.error('Erro ao cadastrar paciente:', err);
    return res.status(500).json({ erro: 'Erro interno ao cadastrar paciente.' });
  } finally {
    client.release();
  }
}

/**
 * POST /auth/login
 * Valida email/senha e retorna um token JWT.
 */
async function login(req, res) {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: 'email e senha são obrigatórios.' });
  }

  // A clínica é identificada pelo domínio do email (ex: usuario@clinica1.com
  // -> clínica com dominio="clinica1.com"). O middleware resolverTenant já
  // tentou resolver isso; se não achou, req.clinica é null e respondemos com
  // a MESMA mensagem genérica de senha errada — não damos pista de que o
  // domínio em si é que está errado.
  if (!req.clinica) {
    return res.status(401).json({ erro: 'Email ou senha inválidos.' });
  }

  try {
    const resultado = await db.query(
      'SELECT id, nome, email, senha_hash, role, ativo, paciente_id FROM usuarios WHERE email = $1',
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: 'Email ou senha inválidos.' });
    }

    const usuario = resultado.rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({ erro: 'Usuário desativado. Contate o administrador.' });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'Email ou senha inválidos.' });
    }

    const token = gerarToken(usuario, req.clinica.dominio);

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        paciente_id: usuario.paciente_id,
      },
    });
  } catch (err) {
    console.error('Erro ao fazer login:', err);
    return res.status(500).json({ erro: 'Erro interno ao fazer login.' });
  }
}

module.exports = { registrar, registrarPaciente, login };
