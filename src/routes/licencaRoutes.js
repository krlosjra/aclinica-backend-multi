const express = require('express');
const router = express.Router();
const licencaController = require('../controllers/licencaController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Qualquer usuário logado pode ver o status (alimenta o aviso de
// vencimento e a tela de bloqueio em qualquer perfil).
router.get('/status', licencaController.status);

// Só admin ativa uma licença nova.
router.post('/ativar', permitir('admin'), licencaController.ativar);

module.exports = router;
