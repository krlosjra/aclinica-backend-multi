const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// Sem multer disponível neste ambiente — o arquivo chega como
// data URL (base64) dentro do JSON normal, decodificado aqui na mão.
// Funciona com o express.json() já configurado (só precisou de um
// limite de body maior, ver server.js).
const TIPOS_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const TAMANHO_MAXIMO_BYTES = 8 * 1024 * 1024; // 8MB

const PASTA_UPLOADS = path.join(__dirname, '..', '..', 'uploads', 'termos-consentimento');

function garantirPastaUploads() {
  fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
}

/**
 * Busca a consulta e confere se quem está pedindo tem acesso a ela —
 * mesma regra usada em consultasController (admin/recepção veem tudo,
 * médico só as próprias, paciente só as próprias). Devolve null (e já
 * responde o erro) se não encontrar ou não tiver acesso.
 */
async function buscarConsultaComAcesso(req, res) {
  const { id } = req.params;
  const resultado = await db.query(
    'SELECT id, tipo, medico_id, paciente_id FROM consultas WHERE id = $1',
    [id]
  );
  if (resultado.rows.length === 0) {
    res.status(404).json({ erro: 'Consulta/exame não encontrado.' });
    return null;
  }
  const consulta = resultado.rows[0];

  if (req.usuario.role === 'medico' && consulta.medico_id !== req.usuario.id) {
    res.status(403).json({ erro: 'Você não tem acesso a esta consulta.' });
    return null;
  }
  if (req.usuario.role === 'paciente' && consulta.paciente_id !== req.usuario.paciente_id) {
    res.status(403).json({ erro: 'Você não tem acesso a esta consulta.' });
    return null;
  }

  return consulta;
}

/**
 * POST /consultas/:id/termo-assinado
 * body: { arquivo_base64: "data:image/jpeg;base64,...." }
 * Salva a digitalização do termo assinado. Enviar de novo pra mesma
 * consulta substitui o arquivo anterior (apaga o antigo do disco).
 */
async function enviar(req, res) {
  const { id } = req.params;
  const { arquivo_base64 } = req.body;

  if (!arquivo_base64 || typeof arquivo_base64 !== 'string') {
    return res.status(400).json({ erro: 'Envie o arquivo digitalizado (arquivo_base64).' });
  }

  const casamento = arquivo_base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!casamento) {
    return res.status(400).json({ erro: 'Arquivo em formato inválido.' });
  }
  const [, tipoMime, conteudoBase64] = casamento;
  if (!TIPOS_PERMITIDOS[tipoMime]) {
    return res.status(400).json({
      erro: `Formato não aceito (${tipoMime}). Envie uma imagem JPEG, PNG ou WEBP.`,
    });
  }

  let buffer;
  try {
    buffer = Buffer.from(conteudoBase64, 'base64');
  } catch {
    return res.status(400).json({ erro: 'Não foi possível decodificar o arquivo enviado.' });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ erro: 'Arquivo vazio.' });
  }
  if (buffer.length > TAMANHO_MAXIMO_BYTES) {
    return res.status(400).json({ erro: 'Arquivo maior que 8MB. Envie uma imagem menor.' });
  }

  try {
    const consulta = await buscarConsultaComAcesso(req, res);
    if (!consulta) return; // resposta de erro já enviada

    if (consulta.tipo !== 'exame') {
      return res.status(400).json({ erro: 'Termo de consentimento só se aplica a exames.' });
    }

    garantirPastaUploads();
    const extensao = TIPOS_PERMITIDOS[tipoMime];
    const nomeArquivo = `consulta-${id}-${Date.now()}.${extensao}`;
    const caminhoCompleto = path.join(PASTA_UPLOADS, nomeArquivo);

    const existente = await db.query(
      'SELECT caminho_arquivo FROM termos_consentimento_assinados WHERE consulta_id = $1',
      [id]
    );

    fs.writeFileSync(caminhoCompleto, buffer);

    // Só apaga o arquivo antigo DEPOIS de gravar o novo com sucesso —
    // se a escrita falhar, o termo anterior continua íntegro no disco.
    if (existente.rows.length > 0 && existente.rows[0].caminho_arquivo !== caminhoCompleto) {
      fs.unlink(existente.rows[0].caminho_arquivo, () => {}); // best-effort
    }

    const resultado = await db.query(
      `INSERT INTO termos_consentimento_assinados
         (consulta_id, nome_arquivo, caminho_arquivo, tipo_mime, tamanho_bytes, enviado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (consulta_id) DO UPDATE SET
         nome_arquivo = EXCLUDED.nome_arquivo,
         caminho_arquivo = EXCLUDED.caminho_arquivo,
         tipo_mime = EXCLUDED.tipo_mime,
         tamanho_bytes = EXCLUDED.tamanho_bytes,
         enviado_por = EXCLUDED.enviado_por,
         enviado_em = NOW()
       RETURNING id, consulta_id, nome_arquivo, tipo_mime, tamanho_bytes, enviado_em`,
      [id, nomeArquivo, caminhoCompleto, tipoMime, buffer.length, req.usuario.id]
    );

    return res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao salvar termo de consentimento assinado:', err);
    return res.status(500).json({ erro: 'Erro interno ao salvar o termo assinado.' });
  }
}

/**
 * GET /consultas/:id/termo-assinado
 * Só metadados (sem o binário) — usado pra saber se já foi enviado.
 */
async function buscarPorConsulta(req, res) {
  const { id } = req.params;
  try {
    const consulta = await buscarConsultaComAcesso(req, res);
    if (!consulta) return;

    const resultado = await db.query(
      `SELECT id, consulta_id, nome_arquivo, tipo_mime, tamanho_bytes, enviado_em
       FROM termos_consentimento_assinados WHERE consulta_id = $1`,
      [id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Nenhum termo assinado enviado para esta consulta.' });
    }
    return res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar termo assinado:', err);
    return res.status(500).json({ erro: 'Erro interno ao buscar o termo assinado.' });
  }
}

/**
 * GET /consultas/:id/termo-assinado/arquivo
 * Devolve o binário da imagem. Rota autenticada (não é servida como
 * arquivo estático público) — é documento de paciente.
 */
async function baixarArquivo(req, res) {
  const { id } = req.params;
  try {
    const consulta = await buscarConsultaComAcesso(req, res);
    if (!consulta) return;

    const resultado = await db.query(
      'SELECT caminho_arquivo, tipo_mime, nome_arquivo FROM termos_consentimento_assinados WHERE consulta_id = $1',
      [id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Nenhum termo assinado encontrado.' });
    }
    const { caminho_arquivo, tipo_mime, nome_arquivo } = resultado.rows[0];
    if (!fs.existsSync(caminho_arquivo)) {
      return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
    }
    res.setHeader('Content-Type', tipo_mime);
    res.setHeader('Content-Disposition', `inline; filename="${nome_arquivo}"`);
    return res.sendFile(caminho_arquivo);
  } catch (err) {
    console.error('Erro ao baixar termo assinado:', err);
    return res.status(500).json({ erro: 'Erro interno ao baixar o termo assinado.' });
  }
}

module.exports = { enviar, buscarPorConsulta, baixarArquivo };
