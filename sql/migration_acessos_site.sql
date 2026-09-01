-- Contador de acessos do site institucional (aclinika.com.br).
-- Roda no banco MESTRE (não é por clínica) — é uma métrica do site
-- público, não do sistema de uma clínica específica.
-- Rodar manualmente contra o banco definido em MASTER_DB_NAME.

CREATE TABLE IF NOT EXISTS acessos_site (
    id SERIAL PRIMARY KEY,
    pagina VARCHAR(50) NOT NULL UNIQUE,
    total_acessos BIGINT NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMP DEFAULT NOW()
);

INSERT INTO acessos_site (pagina, total_acessos)
VALUES ('inicio', 0)
ON CONFLICT (pagina) DO NOTHING;
