const express = require('express');
const router = express.Router();
const laudosController = require('../controllers/laudosController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Dados clínicos: só médico e admin têm acesso (mesma regra de prescrições)
router.use(permitir('admin', 'medico'));

router.get('/', laudosController.listar);
router.get('/:id', laudosController.buscarPorId);
router.post('/', laudosController.criar);
router.put('/:id', laudosController.atualizar);
router.delete('/:id', permitir('admin'), laudosController.deletar);

module.exports = router;
