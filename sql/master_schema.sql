-- ============================================
-- BANCO "clinicas_web" (compartilhado entre todas as instalações)
-- Existe UMA vez no servidor — não é o banco de nenhuma clínica
-- específica. O nome do banco é "clinicas_web"; dentro dele mora a
-- TABELA "clinicas" (mesmo nome, propósito diferente — não confundir
-- um com o outro). Guarda duas coisas bem diferentes que fazem
-- sentido ficarem juntas por serem "globais" (iguais pra todo mundo):
--
--   1. clinicas     — o registro de quais clínicas existem, o domínio
--                      de email que identifica cada uma no login, e
--                      em qual banco os dados clínicos dela ficam.
--   2. medicamentos — a base ANVISA usada como sugestão/autocomplete
--                      nas prescrições. É a mesma lista pra qualquer
--                      clínica (não é dado específico de cliente
--                      nenhum), então fica uma vez só aqui em vez de
--                      duplicada em cada banco de clínica.
--
-- Numa instalação LOCAL de um cliente único (sem internet confiável,
-- rodando só na própria clínica), esse banco também existe — só que
-- com uma única linha na tabela `clinicas`. É o mesmo mecanismo,
-- simplesmente usado com 1 tenant em vez de vários.
--
-- Rodar uma vez, ao preparar o servidor (ou o PC da clínica, no caso
-- da instalação local) — embora normalmente nem seja preciso rodar
-- isso à mão, já que src/scripts/provisionarClinica.js cria e aplica
-- esse schema sozinho, na primeira vez que roda:
--   createdb -U seu_usuario clinicas_web
--   psql -U seu_usuario -d clinicas_web -f sql/master_schema.sql
-- ============================================

CREATE TABLE clinicas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,

    -- Parte depois do "@" no email dos usuários dessa clínica.
    -- Ex: se os usuários logam como "ana@clinica1.com", dominio =
    -- 'clinica1.com'. É isso que identifica a clínica no login —
    -- por isso TEM que ser único, e todo usuário (staff e paciente)
    -- daquela clínica precisa usar email com esse domínio.
    dominio VARCHAR(255) NOT NULL UNIQUE,

    -- Nome do banco de dados Postgres dessa clínica (ex: clinica_1).
    -- Assume-se o mesmo host/porta/usuário/senha do banco "clinicas"
    -- (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD do .env) — só o nome do
    -- banco muda de clínica pra clínica.
    db_name VARCHAR(63) NOT NULL UNIQUE,

    -- Clínica suspensa (inadimplente, cancelada etc.) não consegue
    -- logar, independente do status da licença interna dela.
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    plano VARCHAR(30),
    observacoes TEXT,

    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinicas_dominio ON clinicas(dominio);

-- ============================================
-- MEDICAMENTOS (base ANVISA) — compartilhada por TODAS as clínicas.
-- Importada por src/scripts/importarMedicamentos.js, que agora roda
-- uma vez só aqui (não mais uma vez por clínica).
-- ============================================
CREATE TABLE medicamentos (
    id SERIAL PRIMARY KEY,
    registro_anvisa VARCHAR(50),
    nome_produto TEXT,
    principio_ativo TEXT,
    empresa_detentora TEXT,
    categoria_regulatoria TEXT,
    numero_processo VARCHAR(100),
    situacao_registro TEXT,
    data_registro DATE,
    data_vencimento DATE,
    forma_farmaceutica TEXT,
    concentracao TEXT,
    via_administracao TEXT,
    unidade TEXT,
    quantidade TEXT,
    arquivo_origem TEXT,
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_medicamentos_nome ON medicamentos USING gin (to_tsvector('portuguese', nome_produto));
CREATE INDEX idx_medicamentos_principio ON medicamentos USING gin (to_tsvector('portuguese', principio_ativo));
