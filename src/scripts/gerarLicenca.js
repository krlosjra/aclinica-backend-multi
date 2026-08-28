#!/usr/bin/env node
// Ferramenta pra VOCÊ (quem vende o sistema) gerar uma chave de licença
// pra um cliente. Roda na sua máquina, com a chave privada — nunca no
// servidor do cliente.
//
// Uso:
//   node src/scripts/gerarLicenca.js "Nome do Cliente" mensal
//   node src/scripts/gerarLicenca.js "Nome do Cliente" anual
//   node src/scripts/gerarLicenca.js "Nome do Cliente" anual 2027-03-01   (expiração customizada)
//
// A chave impressa no final é o que você envia pro cliente colar em
// Configurações > Licença (ou na tela de bloqueio, se já tiver vencido).

const fs = require('fs');
const path = require('path');
const { sign, createPrivateKey } = require('crypto');

const DURACAO_DIAS = { mensal: 30, anual: 365 };

function main() {
  const [, , cliente, tipo, expiraCustomizada] = process.argv;

  if (!cliente || !tipo) {
    console.error(
      'Uso: node src/scripts/gerarLicenca.js "Nome do Cliente" <mensal|anual> [data-expiracao AAAA-MM-DD]'
    );
    process.exit(1);
  }
  if (!DURACAO_DIAS[tipo]) {
    console.error('Tipo inválido. Use "mensal" ou "anual".');
    process.exit(1);
  }

  const privPath = path.join(__dirname, '..', '..', 'licenca-chave-privada.pem');
  if (!fs.existsSync(privPath)) {
    console.error(
      `Chave privada não encontrada em ${privPath}.\n` +
        'Rode primeiro: node src/scripts/gerarChavesLicenca.js'
    );
    process.exit(1);
  }
  const privateKey = createPrivateKey(fs.readFileSync(privPath, 'utf8'));

  const emitidaEm = new Date();
  const expiraEm = expiraCustomizada
    ? new Date(`${expiraCustomizada}T23:59:59`)
    : new Date(emitidaEm.getTime() + DURACAO_DIAS[tipo] * 24 * 60 * 60 * 1000);

  if (Number.isNaN(expiraEm.getTime())) {
    console.error('Data de expiração inválida. Use o formato AAAA-MM-DD.');
    process.exit(1);
  }

  const payload = {
    cliente,
    tipo,
    emitida_em: emitidaEm.toISOString(),
    expira_em: expiraEm.toISOString(),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = sign(null, Buffer.from(payloadBase64), privateKey).toString('base64url');
  const chave = `${payloadBase64}.${assinatura}`;

  console.log('\nLicença gerada com sucesso:\n');
  console.log(`Cliente: ${cliente}`);
  console.log(`Tipo: ${tipo}`);
  console.log(`Expira em: ${expiraEm.toLocaleDateString('pt-BR')}`);
  console.log('\nChave (envie essa string pro cliente colar em Configurações > Licença):\n');
  console.log(chave);
  console.log('');
}

main();
