-- ============================================
-- Cria o banco "clinicas_web" DO ZERO (banco + tabelas) — arquivo
-- único, pensado pra rodar numa instalação nova (seja o servidor
-- online, seja o PC de uma instalação local).
--
-- IMPORTANTE: precisa rodar com `psql` (não com um cliente SQL
-- genérico), por causa do comando `\c` abaixo — é ele que troca a
-- conexão pro banco recém-criado no meio do mesmo arquivo. Também por
-- isso, `CREATE DATABASE` não pode ficar dentro de uma transação, e
-- este arquivo não usa nenhuma (tá tudo bem, é `psql -f`, não uma app
-- rodando isso).
--
-- Uso:
--   psql -U seu_usuario -h localhost -f sql/criar_banco_clinicas_web.sql
--
-- Se o banco já existir, o CREATE DATABASE abaixo dá erro e para —
-- nesse caso, ou já está tudo pronto (não precisa rodar de novo), ou
-- você quer recriar do zero (aí primeiro: DROP DATABASE clinicas_web;)
--
-- Na prática, você não costuma precisar rodar este arquivo à mão:
-- src/scripts/provisionarClinica.js já faz isso sozinho, na primeira
-- vez que roda em um Postgres novo. Este arquivo existe pra quem
-- prefere preparar o banco manualmente antes, ou só quer ver/conferir
-- exatamente o que é criado.
-- ============================================

CREATE DATABASE clinicas_web;

\c clinicas_web

-- ============================================
-- TABELA clinicas — registro de quais clínicas existem, o domínio de
-- email que identifica cada uma no login, e em qual banco os dados
-- clínicos dela ficam. (Mesmo nome da tabela, propósito diferente do
-- nome do banco "clinicas_web" — não confundir um com o outro.)
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
    -- Assume-se o mesmo host/porta/usuário/senha do banco
    -- "clinicas_web" (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD do .env) —
    -- só o nome do banco muda de clínica pra clínica.
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
-- TABELA medicamentos (base ANVISA) — compartilhada por TODAS as
-- clínicas (não é duplicada por clínica). Populada por
-- src/scripts/importarMedicamentos.js (precisa de internet — rodar
-- pelo menos uma vez).
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
