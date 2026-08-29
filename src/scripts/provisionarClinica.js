#!/usr/bin/env node
// Ferramenta pra cadastrar uma clínica nova. Funciona tanto pra:
//   - INSTALAÇÃO ONLINE (seu servidor, multi-tenant): roda esse script
//     de novo pra cada cliente novo, todos compartilhando o mesmo
//     banco "clinicas_web".
//   - INSTALAÇÃO LOCAL (dentro da própria clínica, 1 cliente só): roda
//     esse script UMA vez, na primeira instalação — se o banco
//     "clinicas_web" ainda não existir nesse Postgres, ele mesmo cria e
//     prepara tudo (não precisa rodar master_schema.sql à mão antes).
//
// O que ela faz, em ordem:
//   0. Se o banco "clinicas_web" (MASTER_DB_NAME) ainda não existe nesse
//      Postgres, cria e aplica sql/master_schema.sql (só acontece na
//      primeira vez — seja a 1ª clínica de um servidor online, seja a
//      única clínica de uma instalação local);
//   1. Cria um banco de dados Postgres novo pra essa clínica;
//   2. Aplica sql/schema.sql nesse banco novo (estrutura completa);
//   3. Registra a clínica no banco "clinicas_web" (tabela clinicas);
//   4. Cria o primeiro usuário admin dessa clínica, pra ela conseguir
//      logar e cadastrar o resto da equipe por dentro do sistema.
//
// Uso:
//   node src/scripts/provisionarClinica.js \
//     --nome "Clínica Exemplo" \
//     --dominio clinica1.com \
//     --admin-nome "Ana Souza" \
//     --admin-email ana@clinica1.com \
//     --admin-senha "umaSenhaForte123"
//
// O banco de dados criado se chama automaticamente "clinica_<dominio
// sem pontos>" (ex: clinica1.com -> clinica_clinica1_com), a não ser
// que você passe --db-name explicitamente.
//
// IMPORTANTE (instalação local, sem internet confiável): a tabela de
// medicamentos (base ANVISA) é compartilhada dentro do banco
// "clinicas_web" e só é populada rodando, PELO MENOS UMA VEZ, com
// internet disponível:
//   npm run atualizar-medicamentos
// Depois disso o sistema funciona 100% offline — essa importação é a
// única parte que depende de internet.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
// path explícito (não o padrão "./.env") — assim funciona não importa de
// qual pasta você rode o script (ex: de dentro de src/scripts/, o dotenv
// padrão procuraria ".env" ali dentro e não acharia nada).
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const chave = argv[i];
    if (chave.startsWith('--')) {
      const nomeChave = chave.slice(2);
      const valor = argv[i + 1];
      args[nomeChave] = valor;
      i += 1;
    }
  }
  return args;
}

function dbNameSugerido(dominio) {
  const limpo = dominio.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return `clinica_${limpo}`.slice(0, 63);
}

function conexaoBase(database) {
  return new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  });
}

/**
 * Garante que o banco "clinicas_web" existe e já tem o schema aplicado —
 * criando e aplicando na hora se for a primeira vez nesse Postgres
 * (1ª clínica de um servidor online, ou a instalação local única).
 */
async function garantirBancoClinicas() {
  const masterDbName = process.env.MASTER_DB_NAME;
  // "postgres" é o banco de manutenção padrão em quase toda instalação
  // — mas nem sempre existe (ex: foi removido, ou a instalação nunca
  // criou um). "template1" é o banco molde que SEMPRE existe em
  // qualquer Postgres, por isso é mais seguro pra só rodar um
  // CREATE DATABASE por ele.
  const admin = conexaoBase('template1');
  await admin.connect();
  let precisaCriar;
  try {
    const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [masterDbName]);
    precisaCriar = existe.rows.length === 0;
    if (precisaCriar) {
      console.log(`Banco "${masterDbName}" não existe ainda — criando (primeira instalação neste Postgres)...`);
      await admin.query(`CREATE DATABASE ${masterDbName}`);
    }
  } finally {
    await admin.end();
  }

  if (precisaCriar) {
    console.log(`Aplicando master_schema.sql em "${masterDbName}"...`);
    const masterSql = fs.readFileSync(path.join(__dirname, '../../sql/master_schema.sql'), 'utf8');
    const master = conexaoBase(masterDbName);
    await master.connect();
    try {
      await master.query(masterSql);
    } finally {
      await master.end();
    }
  }
}

async function main() {
  const args = parseArgs();
  const obrigatorios = ['nome', 'dominio', 'admin-nome', 'admin-email', 'admin-senha'];
  const faltando = obrigatorios.filter((c) => !args[c]);
  if (faltando.length > 0) {
    console.error(`\n❌ Faltam argumentos obrigatórios: ${faltando.map((c) => `--${c}`).join(', ')}\n`);
    console.error(
      'Exemplo:\n  node src/scripts/provisionarClinica.js --nome "Clínica Exemplo" --dominio clinica1.com ' +
        '--admin-nome "Ana Souza" --admin-email ana@clinica1.com --admin-senha "umaSenhaForte123"\n'
    );
    process.exit(1);
  }

  const nome = args.nome;
  const dominio = args.dominio.toLowerCase().trim();
  const dbName = args['db-name'] || dbNameSugerido(dominio);
  const adminNome = args['admin-nome'];
  const adminEmail = args['admin-email'].toLowerCase().trim();
  const adminSenha = args['admin-senha'];

  if (!adminEmail.endsWith(`@${dominio}`)) {
    console.error(
      `\n❌ O email do admin (${adminEmail}) precisa terminar em @${dominio} — é esse domínio que identifica ` +
        'a clínica no login.\n'
    );
    process.exit(1);
  }
  if (adminSenha.length < 6) {
    console.error('\n❌ A senha do admin precisa ter no mínimo 6 caracteres.\n');
    process.exit(1);
  }

  await garantirBancoClinicas();

  // 1) Confere no banco "clinicas_web" se domínio/db_name já existem, ANTES
  // de criar qualquer coisa, pra não deixar banco órfão pra trás.
  const master = conexaoBase(process.env.MASTER_DB_NAME);
  await master.connect();
  try {
    const existente = await master.query('SELECT id FROM clinicas WHERE dominio = $1 OR db_name = $2', [
      dominio,
      dbName,
    ]);
    if (existente.rows.length > 0) {
      console.error(`\n❌ Já existe uma clínica cadastrada com esse domínio ou nome de banco.\n`);
      process.exit(1);
    }

    // 2) Cria o banco físico. CREATE DATABASE não roda dentro de
    // transação nem aceita parâmetro bindado — dbName já passou por
    // dbNameSugerido/validação acima, mas ainda assim validamos o
    // formato aqui como segunda camada de proteção contra SQL
    // injection via --db-name.
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(dbName)) {
      console.error(`\n❌ Nome de banco inválido: "${dbName}". Use só letras minúsculas, números e "_".\n`);
      process.exit(1);
    }
    console.log(`Criando banco "${dbName}"...`);
    await master.query(`CREATE DATABASE ${dbName}`);

    // 3) Aplica o schema completo no banco novo.
    console.log('Aplicando schema.sql...');
    const schemaSql = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8');
    const clinicaDb = conexaoBase(dbName);
    await clinicaDb.connect();
    try {
      await clinicaDb.query(schemaSql);

      // 4) Cria o admin já dentro do banco da clínica nova.
      console.log('Criando usuário admin...');
      const senhaHash = await bcrypt.hash(adminSenha, 10);
      await clinicaDb.query(
        `INSERT INTO usuarios (nome, email, senha_hash, role) VALUES ($1, $2, $3, 'admin')`,
        [adminNome, adminEmail, senhaHash]
      );
    } finally {
      await clinicaDb.end();
    }

    // 5) Só registra no banco mestre depois de tudo funcionar — é o
    // que faz a clínica "existir" pro sistema (resolverTenant).
    await master.query(
      `INSERT INTO clinicas (nome, dominio, db_name, ativo) VALUES ($1, $2, $3, TRUE)`,
      [nome, dominio, dbName]
    );

    console.log(`\n✅ Clínica "${nome}" provisionada com sucesso.`);
    console.log(`   Domínio de login: @${dominio}`);
    console.log(`   Banco de dados:   ${dbName}`);
    console.log(`   Admin:            ${adminEmail}\n`);
  } catch (err) {
    console.error('\n❌ Erro ao provisionar clínica:', err.message);
    console.error(
      'Se o banco físico chegou a ser criado mas algo falhou depois, pode ser preciso removê-lo manualmente ' +
        `(DROP DATABASE ${dbName}) antes de tentar de novo.\n`
    );
    process.exit(1);
  } finally {
    await master.end();
  }
}

main();
