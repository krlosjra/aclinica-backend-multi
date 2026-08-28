const express = require('express');
const router = express.Router();
const pacientesController = require('../controllers/pacientesController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Só staff (admin/recepção/médico) vê a lista de pacientes — um
// paciente logado não pode listar dados de outros pacientes.
router.get('/', permitir('admin', 'recepcao', 'medico'), pacientesController.listar);
router.get('/:id', permitir('admin', 'recepcao', 'medico'), pacientesController.buscarPorId);

// Só admin e recepção cadastram/editam pacientes
router.post('/', permitir('admin', 'recepcao'), pacientesController.criar);
router.put('/:id', permitir('admin', 'recepcao'), pacientesController.atualizar);

// Só admin exclui
router.delete('/:id', permitir('admin'), pacientesController.deletar);

module.exports = router;
