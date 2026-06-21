import { type NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import ExcelJS from 'exceljs'; // Importar a biblioteca exceljs

async function getDbClient() {
  const client = new Client({
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
  });
  await client.connect();
  await client.query("SET client_encoding TO 'UTF8'");
  return client;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const searchType = searchParams.get("searchType") || "location"; // "location" or "polo"

  // Parâmetros para busca por localização
  const uf = searchParams.get("uf") || "";
  const cidades = searchParams.getAll("cidade");
  const usosLocation = searchParams.getAll("uso");

  // Parâmetros para busca por polo
  const poloAgricola = searchParams.get("poloAgricola") || "";
  const usosPolo = searchParams.getAll("uso"); // Changed from usoPolo to usosPolo and get() to getAll()

  const client = await getDbClient();

  try {
    let whereClause = "";
    const values: (string | string[])[] = [];
    let paramIndex = 1;

    if (searchType === "location") {
      // Busca por UF e Cidade
      whereClause += ` AND b.preco IS NOT NULL AND b.area IS NOT NULL AND b.area > 0`;
      if (uf) {
        whereClause += ` AND b.uf = $${paramIndex}`;
        values.push(uf);
        paramIndex++;
      }
      if (cidades.length > 0) {
        whereClause += ` AND b.municipio = ANY($${paramIndex})`;
        values.push(cidades);
        paramIndex++;
      }
      if (usosLocation.length > 0) {
        whereClause += ` AND b.uso = ANY($${paramIndex})`;
        values.push(usosLocation);
        paramIndex++;
      }
    } else {
      // Busca por Polo Agrícola e Uso (multi-select)
      whereClause += ` AND b.preco IS NOT NULL AND b.area IS NOT NULL AND b.area > 0`;
      if (poloAgricola) {
        whereClause += ` AND pa.nome = $${paramIndex}`;
        // polo_agro.nome está com encoding duplicado no banco (ex.: "Confusão" gravado como
        // "ConfusÃ£o"); /api/filters corrige para exibição, aqui revertemos para comparar com o
        // valor bruto armazenado.
        values.push(Buffer.from(poloAgricola, "utf8").toString("latin1"));
        paramIndex++;
      }
      if (usosPolo.length > 0) { // Changed condition to check array length
        whereClause += ` AND b.uso = ANY($${paramIndex})`; // Changed to ANY for multi-select
        values.push(usosPolo); // Pushing the array
        paramIndex++;
      }
    }

    const query = `
      SELECT
          b.*,                         
          r.geocodigo,
          r.cd_legen,
          r.id_bio,
          r.amazonia_l,
          r.reserv,
          pam.polo_agro_id,
          pa.nome AS nome_polo_agro,
          CASE
              WHEN b.area IS NOT NULL AND b.area > 0
              THEN b.preco / b.area
              ELSE NULL
          END AS valor_ha
      FROM bigdata_ofertas b
      LEFT JOIN reserva_legal r
             ON upper(immutable_unaccent(r.cidade)) = upper(immutable_unaccent(b.municipio))
            AND r.uf = b.uf
      LEFT JOIN polo_agro_municipio pam
             ON pam.municipio_id = r.geocodigo
      LEFT JOIN polo_agro pa
             ON pa.id_agrovalora = pam.polo_agro_id
      WHERE 1=1 ${whereClause}
    `;

    const result = await client.query(query, values);
    const data = result.rows;

    // Criar um novo workbook e worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ofertas');

    // Adicionar cabeçalhos
    if (data.length > 0) {
      worksheet.columns = Object.keys(data[0]).map(key => ({
        header: key.replace(/_/g, ' ').toUpperCase(), // Formata cabeçalhos
        key: key,
        width: 20
      }));
    }

    // Adicionar linhas de dados
    worksheet.addRows(data);

    // Gerar o buffer do arquivo Excel
    const buffer = await workbook.xlsx.writeBuffer();

    // Retornar o arquivo Excel como um Blob
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="ofertas.xlsx"',
      },
    });

  } catch (error) {
    console.error("Erro na consulta ou geração do Excel:", error);
    return NextResponse.json(
      { error: "Erro ao conectar ao banco de dados ou gerar o arquivo Excel." },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}
