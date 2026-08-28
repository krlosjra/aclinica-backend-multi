-- ============================================
-- Migração: médico solicitante opcional para exames
-- Rode depois das migrações anteriores.
--
-- Uma consulta (tipo='consulta') continua exigindo médico.
-- Um exame (tipo='exame') agora pode ser marcado sem médico
-- solicitante selecionado.
-- ============================================

ALTER TABLE consultas ALTER COLUMN medico_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultas_medico_obrigatorio_check'
  ) THEN
    ALTER TABLE consultas ADD CONSTRAINT consultas_medico_obrigatorio_check
      CHECK (tipo = 'exame' OR medico_id IS NOT NULL);
  END IF;
END $$;
