-- ============================================
-- Migração: CEP no cadastro de paciente
-- Rode depois das migrações anteriores.
-- ============================================

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cep VARCHAR(9);
