-- ============================================
-- Migração: Abertura/Fechamento de Caixa
-- Rode depois das migrações anteriores.
--
-- Cria o conceito de "sessão de caixa": o período entre a recepção
-- abrir o caixa (início do expediente) e fechar o caixa (fim do
-- expediente). Cada lançamento passa a pertencer a uma sessão, o que
-- permite:
--   - impedir lançamentos sem o caixa aberto;
--   - fechar automaticamente, no fim do dia, um caixa que a recepção
--     esqueceu de fechar — pra não misturar com os lançamentos do
--     dia seguinte.
-- ============================================

CREATE TABLE caixa_sessoes (
    id SERIAL PRIMARY KEY,
    status VARCHAR(10) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),

    aberto_em TIMESTAMP NOT NULL DEFAULT NOW(),
    aberto_por INTEGER NOT NULL REFERENCES usuarios(id),
    valor_abertura NUMERIC(10, 2) NOT NULL DEFAULT 0,
    observacoes_abertura TEXT,

    fechado_em TIMESTAMP,
    fechado_por INTEGER REFERENCES usuarios(id),
    observacoes_fechamento TEXT,
    -- TRUE quando o sistema fechou sozinho porque a recepção esqueceu
    -- de fechar o caixa manualmente no dia.
    fechamento_automatico BOOLEAN NOT NULL DEFAULT FALSE,

    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Garante que só existe 1 sessão aberta por vez (index único parcial:
-- só considera as linhas com status = 'aberto').
CREATE UNIQUE INDEX idx_caixa_sessao_unica_aberta ON caixa_sessoes ((1)) WHERE status = 'aberto';

CREATE INDEX idx_caixa_sessoes_status ON caixa_sessoes(status);
CREATE INDEX idx_caixa_sessoes_aberto_em ON caixa_sessoes(aberto_em);

-- Cada lançamento passa a pertencer à sessão em que foi feito.
ALTER TABLE caixa ADD COLUMN caixa_sessao_id INTEGER REFERENCES caixa_sessoes(id) ON DELETE SET NULL;
CREATE INDEX idx_caixa_sessao ON caixa(caixa_sessao_id);
