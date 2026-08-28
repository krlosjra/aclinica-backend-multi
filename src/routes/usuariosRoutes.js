const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { verificarToken, permitir } = require('../middlewares/auth');

// Todas as rotas de usuários exigem estar logado
router.use(verificarToken);

router.get('/medicos', usuariosController.listarMedicos);
router.get('/', permitir('admin'), usuariosController.listar);
router.patch('/:id/status', permitir('admin'), usuariosController.alterarStatus);

module.exports = router;
