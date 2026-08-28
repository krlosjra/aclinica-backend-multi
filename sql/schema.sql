-- ============================================
-- Schema inicial: clinica (marcação de consultas + caixa)
-- ============================================

CREATE TYPE role_usuario AS ENUM ('admin', 'medico', 'recepcao');
CREATE TYPE status_consulta AS ENUM ('agendada', 'confirmada', 'realizada', 'cancelada');
CREATE TYPE tipo_lancamento AS ENUM ('entrada', 'saida');

-- ============================================
-- USUARIOS (quem loga no sistema: admin, medico, recepcao)
-- ============================================
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    role role_usuario NOT NULL DEFAULT 'recepcao',
    crm VARCHAR(20),              -- só preenchido quando role = 'medico'
    especialidade VARCHAR(100),   -- só preenchido quando role = 'medico'
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- PACIENTES
-- ============================================
CREATE TABLE pacientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    telefone VARCHAR(20),
    email VARCHAR(150),
    data_nascimento DATE,
    observacoes TEXT,
    cep VARCHAR(9),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- CONSULTAS
-- ============================================
CREATE TABLE consultas (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    medico_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
    criado_por INTEGER REFERENCES usuarios(id),
    data_hora TIMESTAMP NOT NULL,
    status status_consulta NOT NULL DEFAULT 'agendada',
    valor NUMERIC(10, 2) NOT NULL DEFAULT 0,
    observacoes TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Evita 2 consultas no mesmo horário exato para o mesmo médico
    CONSTRAINT unico_medico_horario UNIQUE (medico_id, data_hora)
);

CREATE INDEX idx_consultas_data ON consultas(data_hora);
CREATE INDEX idx_consultas_medico ON consultas(medico_id);
CREATE INDEX idx_consultas_paciente ON consultas(paciente_id);

-- ============================================
-- CAIXA (fluxo de caixa: entradas e saídas)
-- ============================================
CREATE TABLE caixa (
    id SERIAL PRIMARY KEY,
    tipo tipo_lancamento NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    consulta_id INTEGER REFERENCES consultas(id) ON DELETE SET NULL,
    usuario_id INTEGER REFERENCES usuarios(id),
    data_lancamento TIMESTAMP NOT NULL DEFAULT NOW(),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_caixa_data ON caixa(data_lancamento);
CREATE INDEX idx_caixa_tipo ON caixa(tipo);

-- ============================================
-- Migração: Abertura/Fechamento de Caixa (sessões)
-- Cria o conceito de "sessão de caixa": o período entre a recepção
-- abrir o caixa (início do expediente) e fechar o caixa (fim do
-- expediente). Cada lançamento passa a pertencer a uma sessão.
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
-- ============================================
-- Migração: Configuração da Clínica (dados usados nas impressões)
-- Rode depois das migrações anteriores.
-- ============================================

-- Tabela de linha única (singleton): sempre id = 1. Guarda tanto os
-- dados de configuração da clínica (usados nas impressões) quanto o
-- status da licença comercial — as duas coisas são "1 linha só por
-- clínica", então ficam juntas em vez de 2 tabelas separadas.
CREATE TABLE configuracao_clinica (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

    -- Dados da clínica (usados nas impressões: receitas, laudos, termos)
    nome VARCHAR(150) NOT NULL DEFAULT '',
    cnpj VARCHAR(20),
    endereco VARCHAR(255),
    telefone VARCHAR(20),
    email VARCHAR(150),
    site VARCHAR(150),

    -- Licença comercial (assinatura do sistema)
    licenca_chave TEXT,
    licenca_cliente VARCHAR(150),
    licenca_tipo VARCHAR(10) CHECK (licenca_tipo IN ('mensal', 'anual')),
    licenca_emitida_em TIMESTAMP,
    licenca_expira_em TIMESTAMP,
    licenca_ativada_em TIMESTAMP,

    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
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

-- Um exame pode ser marcado sem médico solicitante; uma consulta
-- continua exigindo médico.
ALTER TABLE consultas ADD CONSTRAINT consultas_medico_obrigatorio_check
    CHECK (tipo = 'exame' OR medico_id IS NOT NULL);

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

-- (Licença comercial: campos licenca_* já incluídos em
-- configuracao_clinica, lá em cima — não é mais uma tabela separada.)

-- ============================================
-- Migração: Laudos de exames
--
-- Um laudo por exame realizado — consulta_id é UNIQUE, então laudar
-- de novo (PUT) atualiza o mesmo registro em vez de duplicar. A regra
-- "só laudo exame com status realizada" depende de outra tabela
-- (consultas), então não dá pra expressar como CHECK; é validada no
-- controller.
-- ============================================
CREATE TABLE laudos (
    id SERIAL PRIMARY KEY,
    consulta_id INTEGER NOT NULL UNIQUE REFERENCES consultas(id) ON DELETE CASCADE,
    medico_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    conteudo TEXT NOT NULL,
    data_emissao TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_laudos_consulta ON laudos(consulta_id);

-- ============================================
-- Migração: Termo de consentimento por exame
--
-- termo_consentimento guarda o texto específico daquele tipo de exame
-- (pode ficar vazio pra exames que não exigem termo). A digitalização
-- do termo assinado fica em disco (uploads/termos-consentimento/) —
-- só o caminho e os metadados vão pro banco. Um termo assinado por
-- consulta (consulta_id é UNIQUE); enviar de novo substitui o anterior.
-- ============================================
ALTER TABLE exames ADD COLUMN termo_consentimento TEXT;

CREATE TABLE termos_consentimento_assinados (
    id SERIAL PRIMARY KEY,
    consulta_id INTEGER NOT NULL UNIQUE REFERENCES consultas(id) ON DELETE CASCADE,
    nome_arquivo TEXT NOT NULL,
    caminho_arquivo TEXT NOT NULL,
    tipo_mime VARCHAR(50) NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    enviado_por INTEGER REFERENCES usuarios(id),
    enviado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_termos_consulta ON termos_consentimento_assinados(consulta_id);

-- ============================================
-- Migração: Preparação para IBS/CBS (Reforma Tributária)
--
-- As alíquotas oficiais ainda não existem (dependem de resolução do
-- Senado) — os campos ficam em 0%/desativado até a clínica configurar
-- valores de verdade. valor_ibs/valor_cbs em consultas guardam o que
-- foi efetivamente calculado E cobrado no momento da confirmação de
-- pagamento (não recalculam depois se a alíquota mudar), pra o recibo
-- sempre mostrar o que o paciente realmente pagou naquele dia.
-- ============================================
ALTER TABLE configuracao_clinica ADD COLUMN impostos_ativos BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE configuracao_clinica ADD COLUMN aliquota_ibs NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE configuracao_clinica ADD COLUMN aliquota_cbs NUMERIC(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE consultas ADD COLUMN valor_ibs NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE consultas ADD COLUMN valor_cbs NUMERIC(10, 2) NOT NULL DEFAULT 0;
