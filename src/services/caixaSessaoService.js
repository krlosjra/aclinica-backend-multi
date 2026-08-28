const db = require('../config/db');

/**
 * Retorna a sessão de caixa aberta no momento (ou null se o caixa
 * estiver fechado). Aceita opcionalmente um client de transação
 * (pool.connect()) — se não vier, usa o pool direto.
 */
async function buscarSessaoAberta(executor = db) {
  const resultado = await executor.query(
    `SELECT * FROM caixa_sessoes WHERE status = 'aberto' LIMIT 1`
  );
  return resultado.rows[0] || null;
}

/**
 * Fecha automaticamente qualquer sessão de caixa que tenha ficado
 * aberta de um dia anterior (a recepção esqueceu de fechar). Isso
 * evita que lançamentos de hoje se misturem com o caixa de ontem.
 *
 * O fechamento é registrado como se tivesse ocorrido às 23:59:59 do
 * dia em que o caixa foi aberto — mesmo que o sistema só "perceba"
 * isso mais tarde (ex: ninguém acessou o sistema à noite) — assim o
 * relatório daquele dia fica correto.
 *
 * Retorna a lista de sessões que foram fechadas (pode ser vazia).
 */
async function fecharSessoesVencidas(executor = db) {
  const resultado = await executor.query(
    `UPDATE caixa_sessoes
        SET status = 'fechado',
            fechado_em = date_trunc('day', aberto_em) + INTERVAL '23:59:59',
            fechamento_automatico = TRUE,
            observacoes_fechamento = TRIM(
              COALESCE(observacoes_fechamento, '') ||
              CASE WHEN observacoes_fechamento IS NULL OR observacoes_fechamento = '' THEN '' ELSE ' ' END ||
              '[Fechado automaticamente pelo sistema: a recepção não fechou o caixa no dia.]'
            )
      WHERE status = 'aberto'
        AND aberto_em::date < CURRENT_DATE
      RETURNING *`
  );
  return resultado.rows;
}

/**
 * Deve ser chamada no início de toda rota de /caixa (e antes de
 * confirmar pagamento de consulta): garante que não existe um caixa
 * "esquecido aberto" de um dia anterior antes de qualquer operação.
 */
async function garantirSessaoAtualizada(executor = db) {
  return fecharSessoesVencidas(executor);
}

module.exports = { buscarSessaoAberta, fecharSessoesVencidas, garantirSessaoAtualizada };
