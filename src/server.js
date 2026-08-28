const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const validarEnv = require('./config/validarEnv');
validarEnv();

const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const pacientesRoutes = require('./routes/pacientesRoutes');
const consultasRoutes = require('./routes/consultasRoutes');
const caixaRoutes = require('./routes/caixaRoutes');
const acompanhamentosRoutes = require('./routes/acompanhamentosRoutes');
const prescricoesRoutes = require('./routes/prescricoesRoutes');
const medicamentosRoutes = require('./routes/medicamentosRoutes');
const configuracaoRoutes = require('./routes/configuracaoRoutes');
const examesRoutes = require('./routes/examesRoutes');
const laudosRoutes = require('./routes/laudosRoutes');
const licencaRoutes = require('./routes/licencaRoutes');
const verificarLicenca = require('./middlewares/licenca');
const resolverTenant = require('./middlewares/tenant');
const caixaSessaoService = require('./services/caixaSessaoService');
const tenantManager = require('./config/tenantManager');
const tenantContext = require('./config/tenantContext');

const app = express();

// Cabeçalhos HTTP de segurança (protege contra alguns ataques comuns:
// clickjacking, sniffing de MIME type, etc.)
app.use(helmet());

// Em produção, configure FRONTEND_URL no .env (ex:
// FRONTEND_URL=https://app.suaclinica.com.br) com a origem exata do
// seu frontend. Sem essa variável, liberamos só localhost — nunca
// "qualquer origem": um servidor exposto sem FRONTEND_URL configurado
// deve falhar de forma restritiva, não aberta.
const origensPermitidas = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.0.39:5173'];

if (!process.env.FRONTEND_URL) {
  console.warn(
    'Aviso: FRONTEND_URL não definida no .env — CORS liberado só para localhost:5173. ' +
      'Configure FRONTEND_URL em produção com o endereço real do frontend.'
  );
}

app.use(
  cors({
    origin: origensPermitidas, // Só as origens configuradas em FRONTEND_URL (ou localhost, em dev)
    methods: ['GET', 'POST', 'PUT', 'PATCH','DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
// Limite maior que o padrão (100kb): o termo de consentimento assinado
// é enviado como imagem em base64 dentro do JSON (sem multer disponível
// neste ambiente) — uma foto de celular de ~6-8MB vira uns 8-11MB em
// base64. 12mb cobre isso com folga sem deixar o limite absurdamente alto.
app.use(express.json({ limit: '12mb' }));

// Limita tentativas de login e cadastro de paciente — dificulta força
// bruta de senha e spam de cadastros automatizados.
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/login', limitadorAuth);
app.use('/auth/registrar-paciente', limitadorAuth);

// Rota de teste, só pra confirmar que o servidor está de pé
app.get('/', (req, res) => {
  res.json({ mensagem: 'API da Clínica no ar 🚀' });
});

// Multi-tenant: resolve qual clínica (e portanto qual banco) atende
// esta requisição — pelo token, se já autenticado, ou pelo domínio do
// email no corpo, em rotas públicas de login/cadastro. Precisa rodar
// ANTES de verificarLicenca e de qualquer rota que toque o banco,
// já que db.js depende desse contexto pra saber em qual banco falar.
app.use(resolverTenant);

// Bloqueia o uso do sistema se a licença comercial estiver vencida
// (ou nunca ativada) — libera só login e a própria rota de licença,
// pra sempre dar pra colar uma chave nova. Agora roda por clínica:
// cada uma tem sua própria linha de licença, no seu próprio banco.
app.use(verificarLicenca);

app.use('/auth', authRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/pacientes', pacientesRoutes);
app.use('/consultas', consultasRoutes);
app.use('/caixa', caixaRoutes);
app.use('/acompanhamentos', acompanhamentosRoutes);
app.use('/prescricoes', prescricoesRoutes);
app.use('/medicamentos', medicamentosRoutes);
app.use('/configuracao', configuracaoRoutes);
app.use('/exames', examesRoutes);
app.use('/laudos', laudosRoutes);
app.use('/licenca', licencaRoutes);

// Handler genérico de erro (fallback)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ erro: 'Algo deu errado no servidor.' });
});

// Rede de segurança do caixa: mesmo que ninguém abra o sistema à noite,
// um caixa esquecido aberto de um dia anterior precisa ser fechado antes
// que o próximo dia comece a lançar coisas nele. Isso já acontece de
// forma "preguiçosa" (a cada request em /caixa), mas rodamos também em
// intervalos regulares pra garantir que fique correto mesmo sem acessos.
// Tarefa em background (sem requisição HTTP), então não existe um
// middleware pra resolver o tenant — precisamos varrer as clínicas
// ativas no banco mestre e rodar a verificação em cada uma, dentro do
// contexto (tenantContext.run) daquela clínica.
async function verificarCaixaVencido() {
  let clinicas;
  try {
    clinicas = await tenantManager.listarClinicasAtivas();
  } catch (err) {
    console.error('Erro ao listar clínicas para verificar caixa vencido:', err);
    return;
  }

  for (const clinica of clinicas) {
    const pool = tenantManager.obterPool(clinica);
    await tenantContext.run(pool, clinica, async () => {
      try {
        const fechados = await caixaSessaoService.fecharSessoesVencidas();
        if (fechados.length > 0) {
          console.log(
            `[${clinica.dominio}] Caixa fechado automaticamente (recepção esqueceu de fechar): sessão(ões) ${fechados
              .map((s) => s.id)
              .join(', ')}`
          );
        }
      } catch (err) {
        console.error(`[${clinica.dominio}] Erro ao verificar caixa vencido:`, err);
      }
    });
  }
}
verificarCaixaVencido();
setInterval(verificarCaixaVencido, 15 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
