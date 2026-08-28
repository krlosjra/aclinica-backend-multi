#!/bin/bash
# ============================================
# Testes cURL - API da Clínica
# ============================================
# Pré-requisitos:
#   - Servidor rodando (npm run dev)
#   - Banco populado com sql/seed.sql
#   - jq instalado (pra extrair o token automaticamente):
#       Ubuntu/Debian: sudo apt install jq
#       macOS:         brew install jq
#
# Uso: bash testes.sh
# ============================================

BASE_URL="http://localhost:3000"

echo "============================================"
echo "1. AUTENTICAÇÃO"
echo "============================================"

echo -e "\n--- Login como recepção (maria@clinica.com) ---"
RESPOSTA_LOGIN_RECEPCAO=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@clinica.com","senha":"123456"}')
echo "$RESPOSTA_LOGIN_RECEPCAO" | jq .
TOKEN_RECEPCAO=$(echo "$RESPOSTA_LOGIN_RECEPCAO" | jq -r '.token')

echo -e "\n--- Login como médica (ana.souza@clinica.com) ---"
RESPOSTA_LOGIN_MEDICO=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ana.souza@clinica.com","senha":"123456"}')
echo "$RESPOSTA_LOGIN_MEDICO" | jq .
TOKEN_MEDICO=$(echo "$RESPOSTA_LOGIN_MEDICO" | jq -r '.token')
ID_MEDICO=$(echo "$RESPOSTA_LOGIN_MEDICO" | jq -r '.usuario.id')

echo -e "\n--- Registrar um novo usuário admin ---"
curl -s -X POST "$BASE_URL/auth/registrar" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Admin Geral","email":"admin@clinica.com","senha":"123456","role":"admin"}' | jq .

echo -e "\n--- Login como admin ---"
RESPOSTA_LOGIN_ADMIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinica.com","senha":"123456"}')
echo "$RESPOSTA_LOGIN_ADMIN" | jq .
TOKEN_ADMIN=$(echo "$RESPOSTA_LOGIN_ADMIN" | jq -r '.token')

echo -e "\n--- Tentando acessar rota protegida SEM token (deve dar 401) ---"
curl -s -X GET "$BASE_URL/pacientes" | jq .


echo -e "\n============================================"
echo "2. USUÁRIOS"
echo "============================================"

echo -e "\n--- Listar médicos disponíveis (qualquer usuário logado) ---"
curl -s -X GET "$BASE_URL/usuarios/medicos" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Listar todos os usuários (só admin) ---"
curl -s -X GET "$BASE_URL/usuarios" \
  -H "Authorization: Bearer $TOKEN_ADMIN" | jq .

echo -e "\n--- Tentar listar usuários sendo recepção (deve dar 403) ---"
curl -s -X GET "$BASE_URL/usuarios" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .


echo -e "\n============================================"
echo "3. PACIENTES"
echo "============================================"

echo -e "\n--- Criar paciente (recepção) ---"
RESPOSTA_PACIENTE=$(curl -s -X POST "$BASE_URL/pacientes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d '{
    "nome": "Carlos Alberto",
    "cpf": "111.222.333-44",
    "telefone": "(91) 98888-0000",
    "email": "carlos@email.com",
    "data_nascimento": "1988-05-10"
  }')
echo "$RESPOSTA_PACIENTE" | jq .
ID_PACIENTE=$(echo "$RESPOSTA_PACIENTE" | jq -r '.id')

echo -e "\n--- Listar pacientes ---"
curl -s -X GET "$BASE_URL/pacientes" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Buscar pacientes por nome (?busca=) ---"
curl -s -X GET "$BASE_URL/pacientes?busca=Carlos" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Buscar paciente por ID ---"
curl -s -X GET "$BASE_URL/pacientes/$ID_PACIENTE" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Atualizar telefone do paciente ---"
curl -s -X PUT "$BASE_URL/pacientes/$ID_PACIENTE" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d '{"telefone":"(91) 97777-1234"}' | jq .

echo -e "\n--- Tentar excluir paciente sendo recepção (deve dar 403, só admin exclui) ---"
curl -s -X DELETE "$BASE_URL/pacientes/$ID_PACIENTE" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .


echo -e "\n============================================"
echo "4. CONSULTAS"
echo "============================================"

echo -e "\n--- Marcar consulta (recepção agenda pro médico) ---"
DATA_CONSULTA=$(date -d "+1 day" +"%Y-%m-%dT14:00:00" 2>/dev/null || date -v+1d +"%Y-%m-%dT14:00:00")
RESPOSTA_CONSULTA=$(curl -s -X POST "$BASE_URL/consultas" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d "{
    \"paciente_id\": $ID_PACIENTE,
    \"medico_id\": $ID_MEDICO,
    \"data_hora\": \"$DATA_CONSULTA\",
    \"valor\": 250.00,
    \"observacoes\": \"Consulta de rotina\"
  }")
echo "$RESPOSTA_CONSULTA" | jq .
ID_CONSULTA=$(echo "$RESPOSTA_CONSULTA" | jq -r '.id')

echo -e "\n--- Tentar marcar OUTRA consulta no MESMO horário pro mesmo médico (deve dar 409) ---"
curl -s -X POST "$BASE_URL/consultas" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d "{
    \"paciente_id\": $ID_PACIENTE,
    \"medico_id\": $ID_MEDICO,
    \"data_hora\": \"$DATA_CONSULTA\",
    \"valor\": 200.00
  }" | jq .

echo -e "\n--- Listar todas as consultas (recepção vê tudo) ---"
curl -s -X GET "$BASE_URL/consultas" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Médico lista SUAS consultas (filtro automático, mesmo sem passar medico_id) ---"
curl -s -X GET "$BASE_URL/consultas" \
  -H "Authorization: Bearer $TOKEN_MEDICO" | jq .

echo -e "\n--- Filtrar consultas por status ---"
curl -s -X GET "$BASE_URL/consultas?status=agendada" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n============================================"
echo "4b. ABERTURA DE CAIXA (necessária antes de qualquer pagamento)"
echo "============================================"

echo -e "\n--- Recepção abre o caixa do dia ---"
curl -s -X POST "$BASE_URL/caixa/abrir" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d '{"valor_abertura":100.00,"observacoes":"Abertura do dia"}' | jq .

echo -e "\n--- Ver status do caixa ---"
curl -s -X GET "$BASE_URL/caixa/status" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Médico confirma a própria consulta ---"
curl -s -X PATCH "$BASE_URL/consultas/$ID_CONSULTA/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_MEDICO" \
  -d '{"status":"confirmada","valor_dinheiro":200.00}' | jq .

echo -e "\n--- Médico finaliza a consulta (deve gerar lançamento automático no caixa) ---"
curl -s -X PATCH "$BASE_URL/consultas/$ID_CONSULTA/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_MEDICO" \
  -d '{"status":"realizada"}' | jq .


echo -e "\n============================================"
echo "5. CAIXA (fluxo de caixa)"
echo "============================================"

echo -e "\n--- Ver se a consulta finalizada gerou lançamento automático ---"
curl -s -X GET "$BASE_URL/caixa" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Lançar uma saída manual (ex: compra de material) ---"
curl -s -X POST "$BASE_URL/caixa" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d '{"tipo":"saida","descricao":"Compra de material de escritório","valor":80.50}' | jq .

echo -e "\n--- Ver resumo do caixa (total entradas, saídas, saldo) ---"
curl -s -X GET "$BASE_URL/caixa/resumo" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Filtrar caixa só por entradas ---"
curl -s -X GET "$BASE_URL/caixa?tipo=entrada" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" | jq .

echo -e "\n--- Tentar acessar caixa sendo médico (deve dar 403) ---"
curl -s -X GET "$BASE_URL/caixa" \
  -H "Authorization: Bearer $TOKEN_MEDICO" | jq .

echo -e "\n--- Recepção fecha o caixa do dia (mostra o resumo) ---"
curl -s -X POST "$BASE_URL/caixa/fechar" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d '{"observacoes":"Fechamento do dia"}' | jq .

echo -e "\n--- Tentar lançar no caixa depois de fechado (deve dar 400) ---"
curl -s -X POST "$BASE_URL/caixa" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_RECEPCAO" \
  -d '{"tipo":"saida","descricao":"Não deveria entrar","valor":10}' | jq .

echo -e "\n============================================"
echo "FIM DOS TESTES"
echo "============================================"
