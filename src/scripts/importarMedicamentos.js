const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('csv-parser');
// Medicamentos agora é uma tabela COMPARTILHADA (banco "clinicas_web"),
// não uma por clínica — então esse script volta a ser uma importação
// única, direto no masterDb.
const masterDb = require('../config/masterDb');

const URL_ANVISA =
    'https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv';

const arquivoCSV = path.join(
    __dirname,
    '../../downloads/DADOS_ABERTOS_MEDICAMENTOS.csv'
);

function limpar(valor) {
    if (valor === undefined || valor === null) {
        return null;
    }

    const texto = String(valor).trim();

    return texto === '' ? null : texto;
}

const { execFile } = require('child_process');

function baixarArquivo() {

    return new Promise((resolve, reject) => {

        console.log('Baixando arquivo da ANVISA...');

        execFile(
            'curl',
            [
                '-k',
                '-L',
                '--fail',
                '--silent',
                '--show-error',
                '-o',
                arquivoCSV,
                URL_ANVISA
            ],
            (error, stdout, stderr) => {

                if (error) {

                    console.error(
                        'Erro ao baixar arquivo da ANVISA:',
                        stderr
                    );

                    return reject(error);
                }

                console.log(
                    'Arquivo da ANVISA baixado com sucesso.'
                );

                resolve();
            }
        );

    });
}

async function importarCSV() {
    console.log('Importando medicamentos para o PostgreSQL...');

    const client = await masterDb.pool.connect();

    try {
        await client.query('BEGIN');

        /*
         * Mantém a tabela e substitui os dados.
         *
         * Como a base da ANVISA é uma base de referência,
         * isso simplifica bastante a atualização.
         */
        await client.query('TRUNCATE TABLE medicamentos');

        let total = 0;

        await new Promise((resolve, reject) => {

            fs.createReadStream(arquivoCSV)
                .pipe(csv({
                    separator: ';',
                    mapHeaders: ({ header }) =>
                        header
                            .replace(/^\uFEFF/, '')
                            .trim()
                            .toUpperCase()
                }))
                .on('data', async (row) => {

                    /*
                     * NÃO coloque queries diretamente aqui em bases
                     * muito grandes sem controle de concorrência.
                     *
                     * Para a primeira versão vamos acumular os registros.
                     */

                    try {

                        const registroAnvisa =
                            limpar(
                                row.REGISTRO ||
                                row.REGISTRO_ANVISA ||
                                row.NU_REGISTRO ||
                                row.NUMERO_REGISTRO
                            );

                        const nomeProduto =
                            limpar(
                                row.PRODUTO ||
                                row.NOME_PRODUTO ||
                                row.NOME
                            );

                        const principioAtivo =
                            limpar(
                                row.PRINCIPIO_ATIVO ||
                                row.PRINCÍPIO_ATIVO ||
                                row.PRINCIPIO
                            );

                        if (!nomeProduto) {
                            return;
                        }

                        await client.query(
                            `
                            INSERT INTO medicamentos (
                                registro_anvisa,
                                nome_produto,
                                principio_ativo,
                                empresa_detentora,
                                categoria_regulatoria,
                                numero_processo,
                                situacao_registro,
                                data_registro,
                                data_vencimento,
                                forma_farmaceutica,
                                concentracao,
                                via_administracao,
                                unidade,
                                quantidade,
                                arquivo_origem
                            )
                            VALUES (
                                $1,$2,$3,$4,$5,$6,$7,$8,$9,
                                $10,$11,$12,$13,$14,$15
                            )
                            `,
                            [
                                registroAnvisa,
                                nomeProduto,
                                principioAtivo,

                                limpar(
                                    row.EMPRESA ||
                                    row.EMPRESA_DETENTORA ||
                                    row.DETENTORA_REGISTRO
                                ),

                                limpar(
                                    row.CATEGORIA ||
                                    row.CATEGORIA_REGULATORIA
                                ),

                                limpar(
                                    row.PROCESSO ||
                                    row.NUMERO_PROCESSO
                                ),

                                limpar(
                                    row.SITUACAO ||
                                    row.SITUACAO_REGISTRO
                                ),

                                null,
                                null,

                                limpar(
                                    row.FORMA_FARMACEUTICA ||
                                    row.FORMA
                                ),

                                limpar(
                                    row.CONCENTRACAO
                                ),

                                limpar(
                                    row.VIA_ADMINISTRACAO ||
                                    row.VIA
                                ),

                                limpar(
                                    row.UNIDADE
                                ),

                                limpar(
                                    row.QUANTIDADE
                                ),

                                'ANVISA'
                            ]
                        );

                        total++;

                        if (total % 500 === 0) {
                            console.log(`${total} medicamentos importados...`);
                        }

                    } catch (err) {
                        reject(err);
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });

        await client.query('COMMIT');

        console.log(`Importação concluída: ${total} medicamentos.`);

    } catch (err) {

        await client.query('ROLLBACK');

        console.error('Erro durante importação:', err);

        throw err;

    } finally {
        client.release();
    }
}

async function executar() {

    try {

        await baixarArquivo();

        await importarCSV();

        console.log('Processo concluído.');

    } catch (err) {

        console.error('Falha:', err);

        process.exitCode = 1;
    }
}

executar();