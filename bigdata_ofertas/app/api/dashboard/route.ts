import { NextResponse } from "next/server";
import { Client } from "pg";

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

export async function GET() {
  const client = await getDbClient();

  try {
    const [
      totalOfertasResult,
      distinctSitesResult,
      ofertasPorUfResult,
      ofertasPorUsoResult,
      ofertasPorPoloResult,
    ] = await Promise.all([
      client.query(`SELECT COUNT(*) AS total_ofertas FROM bigdata_ofertas;`),
      client.query(`SELECT DISTINCT site FROM bigdata_ofertas WHERE site IS NOT NULL ORDER BY site;`),
      client.query(`SELECT uf, COUNT(*) AS count FROM bigdata_ofertas WHERE uf IS NOT NULL GROUP BY uf ORDER BY uf;`),
      client.query(`SELECT uso, COUNT(*) AS count FROM bigdata_ofertas WHERE uso IS NOT NULL GROUP BY uso ORDER BY uso;`),
      client.query(`
        SELECT
            pa.nome AS polo_agro,
            COUNT(b.id) AS count
        FROM
            bigdata_ofertas b
        LEFT JOIN
            reserva_legal r ON upper(unaccent(r.cidade)) = upper(unaccent(b.municipio)) AND r.uf = b.uf
        LEFT JOIN
            polo_agro_municipio pam ON pam.municipio_id = r.geocodigo
        LEFT JOIN
            polo_agro pa ON pa.id_agrovalora = pam.polo_agro_id
        WHERE
            pa.nome IS NOT NULL
        GROUP BY
            pa.nome
        ORDER BY
            count DESC;
      `),
    ]);

    const dashboardData = {
      totalOfertas: parseInt(totalOfertasResult.rows[0].total_ofertas, 10),
      distinctSites: distinctSitesResult.rows.map(row => row.site),
      ofertasPorUf: ofertasPorUfResult.rows.map(row => ({ ...row, count: parseInt(row.count, 10) })),
      ofertasPorUso: ofertasPorUsoResult.rows.map(row => ({ ...row, count: parseInt(row.count, 10) })),
      ofertasPorPolo: ofertasPorPoloResult.rows.map(row => ({
        polo_agro: Buffer.from(row.polo_agro, 'latin1').toString('utf8'), // Segunda tentativa de correção de caracteres
        count: parseInt(row.count, 10)
      })),
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error("Erro ao buscar dados do dashboard:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do dashboard" },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}
