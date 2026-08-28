// Medicamentos (base ANVISA) é uma tabela COMPARTILHADA — vive no
// banco "clinicas_web" (junto com o registro de clínicas), não no
// banco de cada clínica, porque a lista é a mesma pra todo mundo.
const masterDb = require('../config/masterDb');

async function buscar(req, res) {

    try {

        const busca = (req.query.busca || '').trim();

        if (busca.length < 2) {
            return res.json([]);
        }

        const resultado = await masterDb.query(
            `
            SELECT
                id,
                registro_anvisa,
                nome_produto,
                principio_ativo,
                empresa_detentora,
                categoria_regulatoria,
                situacao_registro,
                forma_farmaceutica,
                concentracao,
                via_administracao
            FROM medicamentos
            WHERE
                nome_produto ILIKE $1
                OR principio_ativo ILIKE $1
            ORDER BY nome_produto
            LIMIT 20
            `,
            [`%${busca}%`]
        );

        return res.json(resultado.rows);

    } catch (err) {

        console.error(
            'Erro ao pesquisar medicamentos:',
            err
        );

        return res.status(500).json({
            erro: 'Erro ao consultar medicamentos.'
        });
    }
}

module.exports = {
    buscar
};