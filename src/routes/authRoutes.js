const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verificarToken, permitir } = require('../middlewares/auth');

// Cadastro de novos usuários de STAFF agora é restrito a admins já logados
router.post('/registrar', verificarToken, permitir('admin'), authController.registrar);

// Auto-cadastro de paciente: rota pública, feita pela própria tela de login
router.post('/registrar-paciente', authController.registrarPaciente);

router.post('/login', authController.login);

module.exports = router;
