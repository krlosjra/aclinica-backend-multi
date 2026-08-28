const express = require('express');
const router = express.Router();
const acompanhamentosController = require('../controllers/acompanhamentosController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Dados clínicos: só médico e admin têm acesso (recepção fica de fora)
router.use(permitir('admin', 'medico'));

router.get('/', acompanhamentosController.listar);
router.get('/:id', acompanhamentosController.buscarPorId);
router.post('/', acompanhamentosController.criar);
router.put('/:id', acompanhamentosController.atualizar);
router.delete('/:id', permitir('admin'), acompanhamentosController.deletar);

module.exports = router;
