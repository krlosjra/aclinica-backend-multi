const express = require('express');
const router = express.Router();
const configuracaoController = require('../controllers/configuracaoController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Qualquer usuário logado pode ler (usado nas telas de impressão)
router.get('/', configuracaoController.obter);

// Só admin edita
router.put('/', permitir('admin'), configuracaoController.atualizar);

module.exports = router;
