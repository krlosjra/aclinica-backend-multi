const express = require('express');
const router = express.Router();
const caixaController = require('../controllers/caixaController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Só admin e recepção mexem no financeiro (médico não tem acesso ao caixa)
router.use(permitir('admin', 'recepcao'));

router.get('/', caixaController.listar);
router.get('/resumo', caixaController.resumo);
router.get('/relatorio', caixaController.relatorio);
router.get('/status', caixaController.status);
router.post('/abrir', caixaController.abrir);
router.post('/fechar', caixaController.fechar);
router.post('/', caixaController.criar);
router.delete('/:id', permitir('admin'), caixaController.deletar);

module.exports = router;
