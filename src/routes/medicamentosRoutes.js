const express = require('express');

const router = express.Router();

const {
    verificarToken
} = require('../middlewares/auth');

const medicamentosController =
    require('../controllers/medicamentosController');

router.get(
    '/',
    verificarToken,
    medicamentosController.buscar
);

module.exports = router;