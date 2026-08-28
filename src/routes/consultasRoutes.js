const express = require('express');
const router = express.Router();
const consultasController = require('../controllers/consultasController');
const termosController = require('../controllers/termosController');
const { verificarToken, permitir } = require('../middlewares/auth');

router.use(verificarToken);

// Todos os perfis podem listar/ver (médico só enxerga as próprias, ver controller)
router.get('/', consultasController.listar);
router.get('/:id', consultasController.buscarPorId);

// Marcar consulta: admin, recepção, e o próprio paciente (só pra si mesmo)
router.post('/', permitir('admin', 'recepcao', 'paciente'), consultasController.criar);
router.put('/:id', permitir('admin', 'recepcao'), consultasController.atualizar);

// Mudar status: admin, recepção, o próprio médico e o próprio paciente
// (paciente só pode cancelar — regra validada no controller)
router.patch(
  '/:id/status',
  permitir('admin', 'recepcao', 'medico', 'paciente'),
  consultasController.atualizarStatus
);

// Termo de consentimento assinado (digitalizado) — parte do fluxo de
// recebimento de pagamento de exame. Envio é só quem recebe o
// pagamento (admin/recepção); leitura é liberada a quem já tem acesso
// à consulta (checado no próprio controller).
router.post('/:id/termo-assinado', permitir('admin', 'recepcao'), termosController.enviar);
router.get('/:id/termo-assinado', termosController.buscarPorConsulta);
router.get('/:id/termo-assinado/arquivo', termosController.baixarArquivo);

// Exclusão definitiva: só admin
router.delete('/:id', permitir('admin'), consultasController.deletar);

module.exports = router;
