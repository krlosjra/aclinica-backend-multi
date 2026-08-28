const db = require('../config/db');
const tenantContext = require('../config/tenantContext');
const { validarAssinatura } = require('../utils/licenca');

const DIAS_AVISO = 10;
const CACHE_MS = 60 * 1000; // 1 minuto — evita bater no banco a cada request,
// já que o middleware chama isso em toda requisição.

// Multi-tenant: cada clínica tem sua própria licença, então o cache
// precisa ser por clínica — não uma única variável global (senão o
// status de uma clínica vazava/"contaminava" as outras por até
// CACHE_MS). Chave = domínio da clínica no contexto atual.
const cachePorClinica = new Map(); // dominio -> { status, expiraEm }

function chaveCacheAtual() {
  const clinica = tenantContext.getClinica();
  // Fora de um tenant resolvido não deveria nem chegar aqui (db.query
  // já teria lançado antes), mas por segurança nunca compartilha cache
  // entre "sem clínica" e uma clínica real.
  return clinica ? clinica.dominio : null;
}

function diasEntre(dataFutura, dataBase) {
  const ms = new Date(dataFutura).getTime() - dataBase.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function calcularStatus(linha) {
  // licenca_expira_em nulo = nunca foi ativada (a linha pode existir
  // só por causa da configuração da clínica, sem licença nenhuma).
  if (!linha || !linha.licenca_expira_em) {
    return {
      ativada: false,
      expirada: true,
      aviso: false,
      dias_restantes: null,
    };
  }

  const diasRestantes = diasEntre(linha.licenca_expira_em, new Date());
  const expirada = diasRestantes < 0;

  return {
    ativada: true,
    cliente: linha.licenca_cliente,
    tipo: linha.licenca_tipo,
    emitida_em: linha.licenca_emitida_em,
    expira_em: linha.licenca_expira_em,
    ativada_em: linha.licenca_ativada_em,
    dias_restantes: diasRestantes,
    expirada,
    aviso: !expirada && diasRestantes <= DIAS_AVISO,
  };
}

/**
 * Devolve o status atual da licença: se está ativa, quantos dias faltam
 * pra vencer, e se já deve mostrar aviso (10 dias antes) ou bloqueio
 * (já venceu). Cacheado por CACHE_MS pra não consultar o banco a cada
 * requisição.
 */
async function obterStatus({ ignorarCache = false } = {}) {
  const agora = Date.now();
  const chave = chaveCacheAtual();
  const emCache = chave ? cachePorClinica.get(chave) : null;

  if (!ignorarCache && emCache && agora < emCache.expiraEm) {
    return emCache.status;
  }

  const resultado = await db.query(
    'SELECT licenca_chave, licenca_cliente, licenca_tipo, licenca_emitida_em, licenca_expira_em, licenca_ativada_em ' +
      'FROM configuracao_clinica WHERE id = 1'
  );
  const status = calcularStatus(resultado.rows[0] || null);

  if (chave) {
    cachePorClinica.set(chave, { status, expiraEm: agora + CACHE_MS });
  }
  return status;
}

/**
 * Ativa uma nova chave de licença: confere a assinatura e, se for
 * válida, substitui a licença ativa (linha única, id = 1).
 */
async function ativar(chave) {
  const resultado = validarAssinatura(chave);
  if (!resultado.valida) {
    const erro = new Error(resultado.motivo);
    erro.codigo = 'CHAVE_INVALIDA';
    throw erro;
  }

  const { cliente, tipo, emitida_em, expira_em } = resultado.payload;

  await db.query(
    `INSERT INTO configuracao_clinica (id, licenca_chave, licenca_cliente, licenca_tipo, licenca_emitida_em, licenca_expira_em, licenca_ativada_em)
     VALUES (1, $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET
       licenca_chave = EXCLUDED.licenca_chave,
       licenca_cliente = EXCLUDED.licenca_cliente,
       licenca_tipo = EXCLUDED.licenca_tipo,
       licenca_emitida_em = EXCLUDED.licenca_emitida_em,
       licenca_expira_em = EXCLUDED.licenca_expira_em,
       licenca_ativada_em = NOW()`,
    [chave, cliente, tipo, emitida_em, expira_em]
  );

  return obterStatus({ ignorarCache: true });
}

module.exports = { obterStatus, ativar, DIAS_AVISO };
