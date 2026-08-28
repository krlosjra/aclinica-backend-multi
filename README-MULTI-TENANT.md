# Multi-tenant — como funciona

Este sistema roda de **duas formas**, com o mesmo código:

| | Online (seu servidor) | Local (dentro da clínica) |
|---|---|---|
| Quantas clínicas por instalação | Várias (multi-tenant) | Uma só |
| Onde fica o Postgres | No seu servidor | No PC/servidor da própria clínica |
| Por que usar | Clínicas normais | Clínicas com internet instável — não dá pra depender de nuvem |
| Como provisiona | `provisionarClinica.js` uma vez por cliente novo | `provisionarClinica.js` uma vez, na instalação |

É o **mesmo mecanismo** nos dois casos: sempre existe um banco `clinicas_web`
(registro de quem são as clínicas) e um banco por clínica (dados
clínicos). Na instalação local, o banco `clinicas_web` simplesmente tem
uma linha só.

## Como a clínica é identificada no login

Pelo **domínio do email**: `ana@clinica1.com` → clínica com
`dominio = 'clinica1.com'`. O login continua sendo só email + senha —
nada muda no frontend. Por causa disso:

- **Todo usuário de uma clínica (staff e paciente) precisa ter email
  com o mesmo domínio dela.** Um médico com email `@gmail.com` numa
  clínica cadastrada como `@clinica1.com` nunca vai conseguir logar —
  o sistema já bloqueia isso ao tentar cadastrar (`POST /auth/registrar`).
- Numa instalação local (1 clínica só), isso não trava nada na prática
  — a clínica escolhe um domínio (real ou só um identificador, tipo
  `clinicasaude.local`) e todo mundo usa email nesse formato.

## Banco `clinicas_web` (compartilhado)

Duas tabelas, sem relação entre si:

- **`clinicas`** — registro de quais clínicas existem, domínio, nome
  do banco de dados de cada uma, se está ativa.
- **`medicamentos`** — base ANVISA usada nas prescrições. É a mesma
  lista pra qualquer clínica, então fica uma vez só aqui (não é
  duplicada em cada banco de clínica).

## Banco de cada clínica

Schema completo em `sql/schema.sql` — dados clínicos (pacientes,
consultas, caixa, prontuário, exames, laudos) e a tabela
**`configuracao_clinica`**, que guarta tanto os dados de identificação
da clínica (nome, CNPJ, endereço — usados nas impressões) quanto o
status da licença comercial daquela clínica especificamente. As duas
coisas são "1 linha só por clínica", por isso ficam juntas.

## Provisionando uma clínica nova

```bash
node src/scripts/provisionarClinica.js \
  --nome "Clínica Exemplo" \
  --dominio clinica1.com \
  --admin-nome "Ana Souza" \
  --admin-email ana@clinica1.com \
  --admin-senha "umaSenhaForte123"
```

Funciona tanto pra adicionar um cliente novo no servidor online quanto
pra fazer a instalação local do zero — se o banco `clinicas_web` ainda não
existir nesse Postgres, o próprio script cria e prepara antes de
provisionar a clínica.

## Importando a base de medicamentos (ANVISA)

```bash
npm run atualizar-medicamentos
```

Roda **uma vez só** (não mais uma vez por clínica) — grava direto no
banco `clinicas_web`, compartilhado. **Precisa de internet** pra baixar o
CSV da ANVISA. Numa instalação local com internet instável: rode isso
uma vez, num momento em que a conexão estiver boa (ex: na instalação,
ou de tempos em tempos pra atualizar a lista) — depois disso o sistema
funciona 100% offline; essa importação é a única parte que depende de
internet.

## Variáveis de ambiente novas (`.env`)

```
MASTER_DB_NAME=clinicas_web   # nome do banco compartilhado
```

O antigo `DB_NAME` não é mais usado — o banco de cada clínica fica
registrado dentro do próprio banco `clinicas_web` (tabela `clinicas`,
coluna `db_name`) e é resolvido automaticamente a cada login.

## Pendências que ainda dependem de uma decisão sua

- **`backup_completo.dump` está versionado no git do backend.** Se
  tem dado real de paciente (mesmo que de teste), é dado de saúde
  indo pro histórico do repositório — já ficou fora do `.gitignore`
  daqui pra frente, mas o arquivo que já foi commitado continua no
  histórico até alguém reescrever isso (`git filter-repo` ou recriar
  o repositório) — decisão sua quando/se fizer isso.
- **Chave de licença assinada** (`gerarLicenca.js` / `licenca-chave-privada.pem`):
  continua funcionando igual, agora por clínica (`POST /licenca/ativar`
  grava em `configuracao_clinica` daquela clínica). Se um dia quiser
  trocar por um controle mais simples (status/vencimento direto na
  tabela `clinicas` do banco compartilhado, sem chave assinada), dá
  pra migrar — não fiz isso porque muda o fluxo comercial que você já
  tem hoje.
