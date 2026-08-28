const express = require('express');
const router = express.Router();
const prescricoesController = require('../controllers/prescricoesController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Dados clínicos: só médico e admin têm acesso
router.use(permitir('admin', 'medico'));

router.get('/', prescricoesController.listar);
router.get('/:id', prescricoesController.buscarPorId);
router.post('/', prescricoesController.criar);
router.put('/:id', prescricoesController.atualizar);
router.delete('/:id', permitir('admin'), prescricoesController.deletar);

module.exports = router;
