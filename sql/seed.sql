-- ============================================
-- Dados de teste (opcional, só pra facilitar o desenvolvimento)
-- Rode DEPOIS do schema.sql
--
-- OBS: as senhas abaixo (123456) já vêm com hash bcrypt pronto.
-- Se quiser trocar, gere um novo usuário via POST /auth/registrar.
-- ============================================

-- senha para os dois usuários abaixo: 123456
-- (hash gerado e conferido com bcryptjs antes de entrar aqui)
INSERT INTO usuarios (nome, email, senha_hash, role, crm, especialidade) VALUES
('Dra. Ana Souza', 'ana.souza@clinica.com', '$2a$10$rAn3lNB4uqgwiOUoXtRp/eSL4ePd6SO/aGsUu6N9z6wqbWqGLHroG', 'medico', 'CRM-PA 12345', 'Clínico Geral'),
('Recepção Maria', 'maria@clinica.com', '$2a$10$rAn3lNB4uqgwiOUoXtRp/eSL4ePd6SO/aGsUu6N9z6wqbWqGLHroG', 'recepcao', NULL, NULL);

INSERT INTO pacientes (nome, cpf, telefone, email, data_nascimento) VALUES
('João Pereira', '123.456.789-00', '(91) 99999-1111', 'joao@email.com', '1985-03-15'),
('Fernanda Lima', '987.654.321-00', '(91) 99999-2222', 'fernanda@email.com', '1990-07-22');
