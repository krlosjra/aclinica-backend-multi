-- ============================================
-- Migração: corrige um banco que já tinha uma versão antiga da
-- tabela "exames" (sem preparo/valor_padrao/ativo) e/ou da tabela
-- "agendamentos_exames" (versão antiga de agendamento de exame,
-- que o sistema não usa mais — hoje o agendamento de exame
-- reaproveita a tabela "consultas").
--
-- Idempotente: pode rodar mesmo que parte disso já exista no seu
-- banco. Não apaga nenhum dado.
-- ============================================

-- Tabela exames: garante que existe com todas as colunas atuais
CREATE TABLE IF NOT EXISTS exames (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE exames ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE exames ADD COLUMN IF NOT EXISTS preparo TEXT;
ALTER TABLE exames ADD COLUMN IF NOT EXISTS valor_padrao NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE exames ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

-- Consultas: suporte a agendamento de exame (reaproveita a agenda)
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'consulta';
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS exame_id INTEGER REFERENCES exames(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultas_tipo_check') THEN
    ALTER TABLE consultas ADD CONSTRAINT consultas_tipo_check CHECK (tipo IN ('consulta', 'exame'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consultas_exame ON consultas(exame_id);
CREATE INDEX IF NOT EXISTS idx_consultas_tipo ON consultas(tipo);

-- Prescrições: campo livre de exames solicitados (pode já existir)
ALTER TABLE prescricoes ADD COLUMN IF NOT EXISTS exames_solicitados TEXT;

-- Caixa: forma de pagamento
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(10);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caixa_forma_pagamento_check') THEN
    ALTER TABLE caixa ADD CONSTRAINT caixa_forma_pagamento_check CHECK (forma_pagamento IN ('dinheiro', 'cartao', 'pix'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_caixa_forma_pagamento ON caixa(forma_pagamento);

-- Tabela antiga "agendamentos_exames": o sistema não usa mais essa
-- tabela (nenhum código do backend ou frontend faz referência a
-- ela hoje). Só removemos a foreign key dela para "exames", que é
-- o que impede excluir um exame do catálogo. Os dados que já
-- estiverem nessa tabela continuam intactos, só deixam de travar
-- a exclusão de exames.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agendamentos_exames') THEN
    ALTER TABLE agendamentos_exames DROP CONSTRAINT IF EXISTS agendamentos_exames_exame_id_fkey;
  END IF;
END $$;
