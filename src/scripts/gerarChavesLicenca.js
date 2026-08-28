#!/usr/bin/env node
// Gera o par de chaves usado para assinar licenças. RODE UMA ÚNICA VEZ,
// na sua máquina (não no servidor do cliente).
//
//   node src/scripts/gerarChavesLicenca.js
//
// A chave PRIVADA (licenca-chave-privada.pem) é o que assina cada
// licença vendida — ela fica só com você. NUNCA entregue esse arquivo
// a um cliente, nem suba pro repositório que vai pra eles. Se vazar,
// qualquer pessoa passa a conseguir gerar licenças válidas.
//
// A chave PÚBLICA vai embutida no código que roda na máquina do
// cliente (src/utils/licenca.js) — serve só pra CONFERIR a assinatura
// de uma chave já pronta, não pra criar uma nova. Por isso pode ficar
// junto do código sem problema, mesmo que o cliente tenha acesso à
// fonte.

const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const privPath = path.join(__dirname, '..', '..', 'licenca-chave-privada.pem');

if (fs.existsSync(privPath)) {
  console.error(
    `Já existe uma chave privada em ${privPath}.\n` +
      'Gerar uma nova agora invalidaria todas as licenças já vendidas com a atual.\n' +
      'Se é isso mesmo que você quer, apague o arquivo antes e rode de novo.'
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

fs.writeFileSync(privPath, privPem, { mode: 0o600 });

console.log('Chave privada salva em:', privPath);
console.log('Guarde esse arquivo em local seguro (fora do git) — é ele que gera licenças válidas.\n');
console.log('Agora cole a chave pública abaixo em src/utils/licenca.js,');
console.log('substituindo o conteúdo da constante CHAVE_PUBLICA:\n');
console.log(pubPem);
