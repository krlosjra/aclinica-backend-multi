-- ============================================
-- Migração: Exames, agendamento de exames, exames na prescrição
-- e forma de pagamento no caixa
-- ============================================

-- ============================================
-- EXAMES (catálogo dos exames realizados na clínica)
-- ============================================
CREATE TABLE exames (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    preparo TEXT,
    valor_padrao NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- CONSULTAS: agora também podem representar agendamento de EXAME
-- (reaproveita toda a agenda, status, permissões e integração com
-- o caixa que já existiam para consultas médicas)
-- ============================================
ALTER TABLE consultas ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'consulta'
    CHECK (tipo IN ('consulta', 'exame'));
ALTER TABLE consultas ADD COLUMN exame_id INTEGER REFERENCES exames(id) ON DELETE RESTRICT;
CREATE INDEX idx_consultas_exame ON consultas(exame_id);
CREATE INDEX idx_consultas_tipo ON consultas(tipo);

-- ============================================
-- PRESCRICOES: campo livre para requisição de exames
-- ============================================
ALTER TABLE prescricoes ADD COLUMN exames_solicitados TEXT;

-- ============================================
-- CAIXA: forma de pagamento (pra diferenciar dinheiro/cartão/pix
-- nos relatórios futuros)
-- ============================================
ALTER TABLE caixa ADD COLUMN forma_pagamento VARCHAR(10)
    CHECK (forma_pagamento IN ('dinheiro', 'cartao', 'pix'));
CREATE INDEX idx_caixa_forma_pagamento ON caixa(forma_pagamento);
