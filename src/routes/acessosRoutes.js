const express = require('express');
const router = express.Router();
const acessosController = require('../controllers/acessosController');

// Rota pública do site institucional (sem tenant, sem login) — por
// isso é montada em server.js ANTES do resolverTenant/verificarLicenca,
// junto com a rota de teste `/`.
router.post('/:pagina', acessosController.registrar);
router.get('/:pagina', acessosController.consultar);

module.exports = router;
