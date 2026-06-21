import { type NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const poloAgricola = searchParams.get("poloAgricola") || "";
  const dataInicio = searchParams.get("dataInicio") || null;
  const dataFim = searchParams.get("dataFim") || null;

  if (!poloAgricola) {
    return NextResponse.json(
      { error: "Parâmetro 'poloAgricola' é obrigatório" },
      { status: 400 }
    );
  }

  const client = await getDbClient();
  // polo_agro.nome está com encoding duplicado no banco (ex.: "Confusão" gravado como "ConfusÃ£o").
  // /api/filters corrige isso para exibição com Buffer.from(nome,'latin1').toString('utf8'); aqui
  // fazemos o caminho inverso para comparar com o valor bruto armazenado.
  const poloAgricolaDb = Buffer.from(poloAgricola, "utf8").toString("latin1");
  const params = [poloAgricolaDb, dataInicio, dataFim];

  // CTEs compartilhadas: calcula valor/ha e aplica as regras de valor absurdo por uso
  const baseCte = `
      WITH bruto AS (
        SELECT
            b.uso,
            b.preco::numeric / b.area AS valor_ha
        FROM bigdata_ofertas b
        LEFT JOIN reserva_legal r
               ON upper(unaccent(r.cidade)) = upper(unaccent(b.municipio))
              AND r.uf = b.uf
        LEFT JOIN polo_agro_municipio pam
               ON pam.municipio_id = r.geocodigo
        LEFT JOIN polo_agro pa
               ON pa.id_agrovalora = pam.polo_agro_id
        WHERE pa.nome = $1
          AND b.preco IS NOT NULL
          AND b.area IS NOT NULL
          AND b.area > 0
          AND b.uso IS NOT NULL
          AND ($2::date IS NULL OR b.data_processo >= $2::date)
          AND ($3::date IS NULL OR b.data_processo <= $3::date)
      ),
      -- valor acima de R$ 500.000/ha só é plausível para uso "Lazer"; nos demais usos é dado absurdo.
      -- valor abaixo de R$ 500/ha não é possível em nenhum uso; valor abaixo de R$ 2.000/ha só é
      -- possível para "Pastagem" e "Mata Nativa". Todos são descartados completamente
      -- (não entram nem na quantidade de ofertas desta tabela)
      base AS (
        SELECT * FROM bruto
        WHERE (uso = 'Lazer' OR valor_ha <= 500000)
          AND (
            (uso IN ('Pastagem', 'Mata Nativa') AND valor_ha >= 500)
            OR (uso NOT IN ('Pastagem', 'Mata Nativa') AND valor_ha >= 2000)
          )
      )
  `;

  try {
    const statsResult = await client.query(
      `
      ${baseCte},
      base_valida AS (
        SELECT uso, valor_ha, ln(valor_ha) AS log_valor FROM base
      ),
      estat AS (
        SELECT
            uso,
            COUNT(*) AS quantidade,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_ha) AS mediana,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_ha) AS q1_lin,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_ha) AS q3_lin,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY log_valor) AS q1_log,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY log_valor) AS q3_log
        FROM base_valida
        GROUP BY uso
      ),
      -- limite inferior calculado em escala logarítmica (distribuição de valor/ha é assimétrica à direita,
      -- então o IQR linear não detecta bem outliers baixos); limite superior usa o mais restritivo entre
      -- IQR linear e logarítmico, já que o IQR linear se mostrou mais eficaz para cortar outliers altos
      limites AS (
        SELECT
            uso, quantidade, mediana,
            GREATEST(exp(q1_log - 1.5 * (q3_log - q1_log)), 0) AS limite_inferior,
            LEAST(
              q3_lin + 1.5 * (q3_lin - q1_lin),
              exp(q3_log + 1.5 * (q3_log - q1_log))
            ) AS limite_superior
        FROM estat
      ),
      sem_outliers AS (
        SELECT
            bv.uso,
            AVG(bv.valor_ha) AS media,
            MAX(bv.valor_ha) AS maximo,
            MIN(bv.valor_ha) AS minimo,
            MODE() WITHIN GROUP (ORDER BY ROUND(bv.valor_ha)) AS moda
        FROM base_valida bv
        JOIN limites l ON l.uso = bv.uso
        WHERE bv.valor_ha BETWEEN l.limite_inferior AND l.limite_superior
        GROUP BY bv.uso
      )
      SELECT l.uso, l.quantidade, s.media, s.moda, l.mediana, s.maximo, s.minimo
      FROM limites l
      JOIN sem_outliers s ON s.uso = l.uso
      ORDER BY
        CASE l.uso
          WHEN 'Lavoura' THEN 1
          WHEN 'Cana-de-Açucar' THEN 2
          WHEN 'Culturas Permanentes' THEN 3
          WHEN 'Pastagem' THEN 4
          WHEN 'Silvicultura' THEN 5
          WHEN 'Lazer' THEN 6
          WHEN 'Mata Nativa' THEN 7
          ELSE 8
        END
      `,
      params
    );

    const pontosResult = await client.query(
      `
      ${baseCte}
      SELECT uso, valor_ha FROM base
      `,
      params
    );

    const faixaAreaResult = await client.query(
      `
      WITH ofertas_polo AS (
        SELECT b.area
        FROM bigdata_ofertas b
        LEFT JOIN reserva_legal r
               ON upper(unaccent(r.cidade)) = upper(unaccent(b.municipio))
              AND r.uf = b.uf
        LEFT JOIN polo_agro_municipio pam
               ON pam.municipio_id = r.geocodigo
        LEFT JOIN polo_agro pa
               ON pa.id_agrovalora = pam.polo_agro_id
        WHERE pa.nome = $1
          AND b.area IS NOT NULL
          AND b.area > 0
          AND ($2::date IS NULL OR b.data_processo >= $2::date)
          AND ($3::date IS NULL OR b.data_processo <= $3::date)
      )
      SELECT
          CASE
            WHEN area <= 10 THEN '0-10'
            WHEN area <= 100 THEN '10-100'
            WHEN area <= 1000 THEN '100-1000'
            WHEN area <= 10000 THEN '1000-10000'
            ELSE '+10000'
          END AS faixa,
          COUNT(*) AS quantidade
      FROM ofertas_polo
      GROUP BY faixa
      `,
      params
    );

    const usoStats = statsResult.rows.map((row) => ({
      uso: row.uso,
      quantidade: parseInt(row.quantidade, 10),
      media: parseFloat(row.media),
      moda: row.moda !== null ? parseFloat(row.moda) : null,
      mediana: parseFloat(row.mediana),
      maximo: parseFloat(row.maximo),
      minimo: parseFloat(row.minimo),
    }));

    const pontos = pontosResult.rows.map((row) => ({
      uso: row.uso,
      valorHa: parseFloat(row.valor_ha),
    }));

    const ordemFaixas = ["0-10", "10-100", "100-1000", "1000-10000", "+10000"];
    const quantidadePorFaixa = new Map(
      faixaAreaResult.rows.map((row) => [row.faixa, parseInt(row.quantidade, 10)])
    );
    const faixasArea = ordemFaixas.map((faixa) => ({
      faixa,
      quantidade: quantidadePorFaixa.get(faixa) ?? 0,
    }));

    return NextResponse.json({ usoStats, pontos, faixasArea });
  } catch (error) {
    console.error("Erro ao buscar dados de análise:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de análise" },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}
