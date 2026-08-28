// Validação de licença do sistema.
//
// A chave PÚBLICA abaixo só serve pra CONFERIR se uma chave de licença
// foi mesmo assinada por quem vende o sistema — ela não permite gerar
// novas licenças, então pode ficar aqui no código sem problema, mesmo
// que o cliente tenha acesso à fonte.
//
// Quem gera licença é o script src/scripts/gerarLicenca.js, rodado com
// a chave PRIVADA correspondente (licenca-chave-privada.pem), que fica
// só com o vendedor e nunca é entregue ao cliente.
const { verify, createPublicKey } = require('crypto');

const CHAVE_PUBLICA = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAIiBBUzoSBqeat7hCT+lgQY6djonwNh5dr0NSP2I01ec=
-----END PUBLIC KEY-----`;

let chavePublicaCarregada = null;
function obterChavePublica() {
  if (!chavePublicaCarregada) {
    chavePublicaCarregada = createPublicKey(CHAVE_PUBLICA);
  }
  return chavePublicaCarregada;
}

/**
 * Confere a assinatura e a estrutura de uma chave de licença.
 * Retorna { valida: true, payload } ou { valida: false, motivo }.
 *
 * Não decide se a licença já venceu — isso é responsabilidade de quem
 * chama (licencaService), porque "assinatura inválida" e "venceu"
 * merecem mensagens diferentes pro usuário.
 */
function validarAssinatura(chave) {
  if (!chave || typeof chave !== 'string' || !chave.includes('.')) {
    return { valida: false, motivo: 'Chave de licença em formato inválido.' };
  }

  const [payloadBase64, assinaturaBase64] = chave.split('.');
  if (!payloadBase64 || !assinaturaBase64) {
    return { valida: false, motivo: 'Chave de licença em formato inválido.' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch {
    return { valida: false, motivo: 'Chave de licença corrompida.' };
  }

  if (!payload.cliente || !payload.tipo || !payload.emitida_em || !payload.expira_em) {
    return { valida: false, motivo: 'Chave de licença com dados incompletos.' };
  }

  let assinaturaValida = false;
  try {
    assinaturaValida = verify(
      null,
      Buffer.from(payloadBase64),
      obterChavePublica(),
      Buffer.from(assinaturaBase64, 'base64url')
    );
  } catch {
    return { valida: false, motivo: 'Não foi possível verificar a assinatura da licença.' };
  }

  if (!assinaturaValida) {
    return { valida: false, motivo: 'Assinatura da licença não confere.' };
  }

  return { valida: true, payload };
}

module.exports = { validarAssinatura };
