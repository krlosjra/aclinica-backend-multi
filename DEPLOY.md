# Deploy em produção — Ubuntu Server + Cloudflare Tunnel

Guia completo do zero até o sistema no ar em `www.aclinika.com.br`, sem abrir
nenhuma porta pro público (o Cloudflare Tunnel cuida disso).

## Arquitetura escolhida

Um único servidor Ubuntu rodando dois processos Node (gerenciados pelo PM2) +
Postgres local. Dois hostnames apontando pro mesmo servidor via túnel:

| Hostname | Serve | Porta local |
|---|---|---|
| `www.aclinika.com.br` | Frontend (arquivos estáticos do build) | `8080` |
| `api.aclinika.com.br` | Backend (API multi-tenant) | `3000` |

> Usar um subdomínio (`api.`) separado pra API é a forma mais simples de
> configurar isso com Cloudflare Tunnel — não precisa comprar nada, subdomínio
> é grátis dentro do seu próprio domínio, só precisa cadastrar no painel do
> Cloudflare (passo 6).

O Postgres não precisa ficar acessível de fora — só o próprio Node local
conversa com ele.

---

## 0. Correção que já apliquei no código

Encontrei e corrigi um bug no `server.js`: o CORS estava fixo em `origin: '*'`
(liberado geral), ignorando a variável `FRONTEND_URL` que o próprio código já
calculava. Antes de expor isso à internet de verdade, isso precisava ser
corrigido — agora o CORS respeita `FRONTEND_URL` de fato. Use o zip atualizado
que anexei nesta resposta.

---

## 1. Pacotes de sistema

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 24.x (LTS atual em 2026) via repositório oficial NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Utilitários
sudo apt install -y git build-essential ufw

node -v   # confirme v24.x
npm -v
```

## 2. PostgreSQL

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'DEFINA_UMA_SENHA_FORTE_AQUI';"
```

> Troque por uma senha forte de verdade — **não reaproveite** a senha de
> desenvolvimento (`ca240624`) que está no `.env` atual. Gere uma nova, por
> exemplo com `openssl rand -base64 24`.

Nada mais a configurar manualmente: o script `provisionarClinica.js` (passo 4)
cria o banco mestre `clinicas_web` e o banco de cada clínica sozinho, na
primeira execução.

## 3. Copiar o projeto pro servidor

Envie o zip do projeto (por `scp`, `rsync`, ou clonando de um repositório
Git privado) para, por exemplo, `/opt/aclinika`:

```bash
sudo mkdir -p /opt/aclinika
sudo chown $USER:$USER /opt/aclinika
# depois de enviar o zip para o servidor:
unzip aclinica-multitenant.zip -d /opt/aclinika
cd /opt/aclinika/aclinica-multitenant
```

## 4. Backend

```bash
cd /opt/aclinika/aclinica-multitenant/clinica-backend
npm install --omit=dev
```

Edite o `.env` (baseado no `.env.example`) com os valores de produção:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=A_SENHA_FORTE_DO_PASSO_2

MASTER_DB_NAME=clinicas_web

JWT_SECRET=GERE_UM_VALOR_LONGO_E_ALEATORIO_AQUI
JWT_EXPIRES_IN=8h

PORT=3000

FRONTEND_URL=https://www.aclinika.com.br
```

Gere um `JWT_SECRET` forte:
```bash
openssl rand -hex 32
```

**Gere seu próprio par de chaves de licença** (o `README-LICENCA.md` já
recomenda isso — o par atual foi gerado num ambiente de desenvolvimento
assistido e não deve ir pra produção):
```bash
rm licenca-chave-privada.pem
node src/scripts/gerarChavesLicenca.js
```
Copie a chave pública impressa e cole em `src/utils/licenca.js`, na constante
`CHAVE_PUBLICA` (substituindo o valor atual). Guarde a chave privada nova em
lugar seguro fora do servidor também (backup) — se ela se perder, você não
consegue mais emitir licenças novas.

**Proteja a chave privada** (só o dono do processo deve conseguir ler):
```bash
chmod 600 licenca-chave-privada.pem
```

Provisione a primeira clínica de verdade (isso já cria o banco mestre
`clinicas_web` na primeira vez que rodar):
```bash
node src/scripts/provisionarClinica.js \
  --nome "Nome da Clínica" \
  --dominio dominioreal.com.br \
  --admin-nome "Nome do Admin" \
  --admin-email admin@dominioreal.com.br \
  --admin-senha "umaSenhaForte123"
```

Importe a base de medicamentos (ANVISA) uma única vez:
```bash
npm run atualizar-medicamentos
```

## 5. Frontend

```bash
cd /opt/aclinika/aclinica-multitenant/clinica-frontend
```

Edite o `.env`:
```bash
VITE_API_URL=https://api.aclinika.com.br
```

```bash
npm install
npm run build
```

Isso gera `clinica-frontend/dist/` — os arquivos estáticos prontos pra servir.

## 6. PM2 (mantém os dois processos no ar, reinicia sozinho se cair)

```bash
sudo npm install -g pm2

# Backend
cd /opt/aclinika/aclinica-multitenant/clinica-backend
pm2 start src/server.js --name aclinika-backend

# Frontend (serve os arquivos estáticos do build, com fallback de SPA)
cd /opt/aclinika/aclinica-multitenant/clinica-frontend
pm2 serve dist 8080 --name aclinika-frontend --spa

# Salva a lista de processos e configura start automático no boot
pm2 save
pm2 startup
# ^ esse comando imprime UM comando pra você copiar/colar e rodar
#   (registra o PM2 como serviço systemd) — copie e execute-o.
```

Verifique:
```bash
pm2 status
pm2 logs aclinika-backend --lines 50
```

## 7. Cloudflare Tunnel

```bash
# Instala o cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Autentica (abre um link — cole no navegador e escolha o domínio aclinika.com.br)
cloudflared tunnel login

# Cria o túnel
cloudflared tunnel create aclinika
```

Isso gera um arquivo de credenciais em `~/.cloudflared/<TUNNEL-ID>.json` e
mostra o `<TUNNEL-ID>`. Crie o arquivo de configuração:

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Conteúdo (troque `<TUNNEL-ID>` pelo id real gerado acima):

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: www.aclinika.com.br
    service: http://localhost:8080
  - hostname: api.aclinika.com.br
    service: http://localhost:3000
  - service: http_status:404
```

> Se `cloudflared tunnel login` rodou com seu usuário normal (não root), o
> arquivo de credenciais fica em `/home/SEU_USUARIO/.cloudflared/...` — ajuste
> o caminho no `credentials-file` de acordo, ou copie o `.cloudflared` inteiro
> para `/root/.cloudflared` se for rodar o serviço como root (padrão do
> `cloudflared service install`).

Registra os dois hostnames apontando pro túnel:
```bash
cloudflared tunnel route dns aclinika www.aclinika.com.br
cloudflared tunnel route dns aclinika api.aclinika.com.br
```

Instala como serviço do sistema (inicia sozinho no boot, reinicia se cair):
```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

## 8. Firewall — a grande vantagem do Cloudflare Tunnel

Como o túnel é **iniciado de dentro pra fora** (o servidor conecta no
Cloudflare, não o contrário), você não precisa abrir a porta 80/443 pro
público. Bloqueie tudo, exceto SSH:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Nada externo consegue nem tentar bater direto nas portas 3000/8080/5432 —
elas só existem em `localhost`.

## 9. Backups

Configure um backup diário do Postgres. Crie `/opt/aclinika/backup.sh`:

```bash
#!/bin/bash
DATA=$(date +%Y%m%d)
DESTINO=/opt/aclinika/backups
mkdir -p "$DESTINO"

# Banco mestre
pg_dump -U postgres clinicas_web > "$DESTINO/clinicas_web_$DATA.sql"

# Um dump por clínica cadastrada
psql -U postgres -d clinicas_web -t -c "SELECT db_name FROM clinicas;" | while read -r DB; do
  DB=$(echo "$DB" | xargs)
  [ -n "$DB" ] && pg_dump -U postgres "$DB" > "$DESTINO/${DB}_$DATA.sql"
done

# Termos de consentimento assinados (contém dado sensível de paciente)
tar -czf "$DESTINO/uploads_$DATA.tar.gz" -C /opt/aclinika/aclinica-multitenant/clinica-backend uploads

# Apaga backups com mais de 30 dias
find "$DESTINO" -type f -mtime +30 -delete
```

```bash
chmod +x /opt/aclinika/backup.sh
crontab -e
# adicione a linha (roda todo dia às 3h da manhã):
0 3 * * * PGPASSWORD='A_SENHA_DO_PASSO_2' /opt/aclinika/backup.sh
```

> Idealmente copie esses backups pra **fora** do servidor de vez em quando
> (outro servidor, S3, Google Drive) — um backup que mora só na mesma máquina
> não protege contra a máquina falhar/ser comprometida.

## 10. Checklist final

- [ ] `https://www.aclinika.com.br` carrega o login
- [ ] `https://api.aclinika.com.br` responde `{"mensagem":"API da Clínica no ar 🚀"}`
- [ ] Login com o admin criado no passo 4 funciona
- [ ] `pm2 status` mostra os dois processos `online`
- [ ] `sudo systemctl status cloudflared` mostra `active (running)`
- [ ] `sudo ufw status` mostra só SSH liberado
- [ ] Backup rodou pelo menos uma vez manualmente pra testar (`sudo /opt/aclinika/backup.sh`)

## Atualizando o sistema no futuro

```bash
cd /opt/aclinika/aclinica-multitenant
git pull   # ou: reenvie e substitua os arquivos, se não usa Git no servidor

cd clinica-backend && npm install --omit=dev && pm2 restart aclinika-backend
cd ../clinica-frontend && npm install && npm run build && pm2 restart aclinika-frontend
```

Se alguma migration SQL nova for adicionada, rode-a manualmente em cada banco
de clínica antes de reiniciar:
```bash
psql -U postgres -d clinica_dominioreal_com_br -f sql/migration_nova.sql
```
