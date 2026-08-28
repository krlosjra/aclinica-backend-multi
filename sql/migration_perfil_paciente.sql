-- ============================================
-- Migração: Perfil de Paciente (login próprio)
-- Rode depois das migrações anteriores.
--
-- IMPORTANTE: rode este arquivo sozinho (psql -f), sem agrupar com
-- outros comandos numa mesma transação — o Postgres não permite usar
-- um valor de enum recém-criado (ADD VALUE) na mesma transação em que
-- ele foi adicionado.
-- ============================================

-- Novo valor de perfil
ALTER TYPE role_usuario ADD VALUE IF NOT EXISTS 'paciente';

-- Liga a conta de login (usuarios) ao cadastro clínico (pacientes).
-- Só é preenchido quando role = 'paciente'. UNIQUE garante que cada
-- paciente tenha no máximo 1 conta de acesso.
ALTER TABLE usuarios ADD COLUMN paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_paciente_id_unique UNIQUE (paciente_id);
CREATE INDEX idx_usuarios_paciente ON usuarios(paciente_id);
