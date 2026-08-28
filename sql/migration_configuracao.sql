-- ============================================
-- Migração: Configuração da Clínica (dados usados nas impressões)
-- Rode depois das migrações anteriores.
-- ============================================

-- Tabela de linha única (singleton): sempre id = 1
CREATE TABLE clinica_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    nome VARCHAR(150) NOT NULL DEFAULT '',
    cnpj VARCHAR(20),
    endereco VARCHAR(255),
    telefone VARCHAR(20),
    email VARCHAR(150),
    site VARCHAR(150),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
