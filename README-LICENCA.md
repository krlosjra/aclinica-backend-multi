# Sistema de Licença

Controla por quanto tempo o sistema pode ser usado (mensal ou anual), com
aviso automático 10 dias antes de vencer e bloqueio de todas as rotas
(exceto login) quando vencer.

## Como funciona

A licença é uma chave de texto assinada digitalmente (Ed25519). O par de
chaves já foi gerado nesta entrega:

- **Chave privada** (`clinica-backend/licenca-chave-privada.pem`) — é ela
  que **assina** novas licenças. Fica só com você. **Nunca** entregue esse
  arquivo a um cliente, nem suba pra um repositório que ele vai acessar.
- **Chave pública** — já está embutida em `src/utils/licenca.js`. Serve só
  pra **conferir** se uma chave foi mesmo assinada por você. Pode ficar no
  código que vai pro cliente sem problema: mesmo com acesso total à fonte,
  ninguém consegue gerar uma licença válida sem a chave privada.

⚠️ **Recomendação:** como este par de chaves foi gerado num ambiente de
desenvolvimento assistido, o ideal é você gerar o seu próprio antes de usar
em produção — é rápido e garante que só você jamais teve acesso à chave
privada:

```bash
cd clinica-backend
rm licenca-chave-privada.pem
node src/scripts/gerarChavesLicenca.js
```

Isso imprime uma nova chave pública — cole ela em `src/utils/licenca.js`,
na constante `CHAVE_PUBLICA` (substitua o conteúdo atual).

## Rodar a migração

Antes de tudo, aplique a migração no banco (cria a tabela
`licenca_ativacao` — está no final de `sql/schema.sql`):

```bash
psql -U seu_usuario -d seu_banco -f sql/schema.sql
```

Se preferir, rode só o trecho novo (procure por "Migração: Licença do
sistema" no arquivo).

## Gerar uma licença pra um cliente

Na sua máquina (nunca no servidor do cliente):

```bash
cd clinica-backend
node src/scripts/gerarLicenca.js "Nome da Clínica" mensal
node src/scripts/gerarLicenca.js "Nome da Clínica" anual
```

O script imprime a chave — é essa string que você envia pro cliente.

## Ativar no sistema do cliente

1. Login como admin.
2. Menu **Licença** (ou a própria tela de bloqueio, se já tiver vencido).
3. Colar a chave e clicar em **Ativar licença**.

## O que o usuário vê

- **Mais de 10 dias pra vencer:** nada, uso normal.
- **10 dias ou menos:** um aviso amarelo no topo, visível a qualquer perfil
  logado ("A licença deste sistema vence em X dias").
- **Vencida:** todas as telas ficam bloqueadas com uma mensagem. Se for
  admin, aparece o campo pra colar uma chave nova ali mesmo, sem precisar
  navegar pra outro lugar. Login continua funcionando normalmente.

## Renovando antes de vencer

Gerar e ativar uma chave nova a qualquer momento substitui a anterior —
não precisa esperar vencer.
