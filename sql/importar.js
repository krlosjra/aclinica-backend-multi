const fs = require('fs');
const readline = require('readline');
const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'clinica',
  password: 'ca240624',
  port: 5432,
});

async function importar() {
  await client.connect();

  const fileStream = fs.createReadStream('RelatorioClientes.txt');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const pattern = /^(.*?)\s+(\d{2}\/\d{2}\/\d{4})\s+\((.*?)\)\s*([\d\s-]*)\s*\/\s*\((.*?)\)\s*([\d\s-]*)/;
  let bufferNome = "";
  let total = 0;

  for await (let line of rl) {
    line = line.replace(/\[source:\s*\d+\]/g, '').replace(/^[,\s]+/, '');

    const match = line.match(pattern);
    if (match) {
      const nomeParte = match[1].trim();
      const nomeCompleto = (bufferNome + " " + nomeParte).trim();
      bufferNome = "";

      const [_, __, dataStr, ddd1, num1, ddd2, num2] = match;

      // Tratar Data
      const [dia, mes, ano] = dataStr.split('/');
      const dataNascimento = `${ano}-${mes}-${dia}`;

      // Tratar Telefone
      let telefone = null;
      const num1Limpo = num1.replace(/\D/g, '');
      const ddd1Limpo = ddd1.replace(/\D/g, '');
      if (num1Limpo) {
        telefone = ddd1Limpo ? `(${ddd1Limpo}) ${num1Limpo}` : num1Limpo;
      }

      await client.query(
        'INSERT INTO public.pacientes (nome, data_nascimento, telefone) VALUES ($1, $2, $3)',
        [nomeCompleto.substring(0, 150), dataNascimento, telefone]
      );
      total++;
    } else {
      const sobra = line.trim();
      if (sobra) {
        bufferNome = (bufferNome + " " + sobra).trim();
      }
    }
  }

  console.log(`✅ Importação concluída! ${total} pacientes importados.`);
  await client.end();
}

importar().catch(console.error);