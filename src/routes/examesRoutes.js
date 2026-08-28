const express = require('express');
const router = express.Router();
const examesController = require('../controllers/examesController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Staff (e paciente, pra ver o que pode ser agendado) pode listar/ver
router.get('/', permitir('admin', 'recepcao', 'medico', 'paciente'), examesController.listar);
router.get('/:id', permitir('admin', 'recepcao', 'medico', 'paciente'), examesController.buscarPorId);

// Só admin e recepção gerenciam o catálogo
router.post('/', permitir('admin', 'recepcao'), examesController.criar);
router.put('/:id', permitir('admin', 'recepcao'), examesController.atualizar);
router.delete('/:id', permitir('admin'), examesController.deletar);

module.exports = router;
