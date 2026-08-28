-- ============================================
-- Migração: Acompanhamentos (prontuário) e Prescrições
-- Rode este script DEPOIS do schema.sql original
-- ============================================

-- ============================================
-- ACOMPANHAMENTOS (evolução clínica / prontuário)
-- ============================================
CREATE TABLE acompanhamentos (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    medico_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    consulta_id INTEGER REFERENCES consultas(id) ON DELETE SET NULL,
    data_atendimento TIMESTAMP NOT NULL DEFAULT NOW(),
    queixa_principal TEXT,
    historia_clinica TEXT,
    exame_fisico TEXT,
    diagnostico TEXT,
    conduta TEXT,
    observacoes TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_acompanhamentos_paciente ON acompanhamentos(paciente_id);
CREATE INDEX idx_acompanhamentos_medico ON acompanhamentos(medico_id);
CREATE INDEX idx_acompanhamentos_data ON acompanhamentos(data_atendimento);

-- ============================================
-- PRESCRICOES (cabeçalho da receita)
-- ============================================
CREATE TABLE prescricoes (
    id SERIAL PRIMARY KEY,
    acompanhamento_id INTEGER REFERENCES acompanhamentos(id) ON DELETE SET NULL,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    medico_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    data_emissao TIMESTAMP NOT NULL DEFAULT NOW(),
    observacoes TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prescricoes_paciente ON prescricoes(paciente_id);
CREATE INDEX idx_prescricoes_medico ON prescricoes(medico_id);
CREATE INDEX idx_prescricoes_acompanhamento ON prescricoes(acompanhamento_id);

-- ============================================
-- PRESCRICAO_ITENS (cada medicamento dentro da receita)
-- ============================================
CREATE TABLE prescricao_itens (
    id SERIAL PRIMARY KEY,
    prescricao_id INTEGER NOT NULL REFERENCES prescricoes(id) ON DELETE CASCADE,
    medicamento VARCHAR(150) NOT NULL,
    dosagem VARCHAR(50),
    via_administracao VARCHAR(50),
    frequencia VARCHAR(100),
    duracao VARCHAR(50),
    quantidade VARCHAR(50),
    observacoes TEXT
);

CREATE INDEX idx_prescricao_itens_prescricao ON prescricao_itens(prescricao_id);
