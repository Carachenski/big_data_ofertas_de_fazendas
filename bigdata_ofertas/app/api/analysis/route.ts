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

  // Faixas de tamanho (ha) usadas tanto no gráfico de comparação CAR x Ofertas quanto para
  // classificar os pontos do gráfico de dispersão (permite filtrar a dispersão por faixa clicada)
  const faixaCase = `
      CASE
        WHEN area <= 1 THEN '<=1'
        WHEN area <= 5 THEN '1-5'
        WHEN area <= 10 THEN '5-10'
        WHEN area <= 20 THEN '10-20'
        WHEN area <= 30 THEN '20-30'
        WHEN area <= 50 THEN '30-50'
        WHEN area <= 100 THEN '50-100'
        WHEN area <= 300 THEN '100-300'
        WHEN area <= 500 THEN '300-500'
        WHEN area <= 1500 THEN '500-1500'
        WHEN area <= 3000 THEN '1500-3000'
        WHEN area <= 5000 THEN '3000-5000'
        ELSE '+5000'
      END
  `;

  // CTEs compartilhadas: calcula valor/ha e aplica as regras de valor absurdo por uso
  const baseCte = `
      WITH bruto AS (
        SELECT
            b.uso,
            b.area,
            b.preco::numeric / b.area AS valor_ha
        FROM bigdata_ofertas b
        LEFT JOIN reserva_legal r
               ON upper(immutable_unaccent(r.cidade)) = upper(immutable_unaccent(b.municipio))
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
      SELECT uso, valor_ha, area, ${faixaCase} AS faixa FROM base
      `,
      params
    );

    const faixaAreaResult = await client.query(
      `
      WITH ofertas_polo AS (
        SELECT b.area
        FROM bigdata_ofertas b
        LEFT JOIN reserva_legal r
               ON upper(immutable_unaccent(r.cidade)) = upper(immutable_unaccent(b.municipio))
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
      area: parseFloat(row.area),
      faixa: row.faixa,
    }));

    const ordemFaixas = ["0-10", "10-100", "100-1000", "1000-10000", "+10000"];
    const quantidadePorFaixa = new Map(
      faixaAreaResult.rows.map((row) => [row.faixa, parseInt(row.quantidade, 10)])
    );
    const faixasArea = ordemFaixas.map((faixa) => ({
      faixa,
      quantidade: quantidadePorFaixa.get(faixa) ?? 0,
    }));

    // Cobertura: total de ofertas do polo (sem filtro de validade de preço, contagem bruta de
    // imóveis anunciados) vs total de CARs (cadastro ambiental rural) cadastrados nos municípios
    // do polo. car_compilado.car tem o formato "UF-GEOCODIGO-HASH"; o geocódigo é o mesmo
    // id_municipios usado em polo_agro_municipio.
    const coberturaResult = await client.query(
      `
      SELECT
        (
          SELECT COUNT(*)
          FROM bigdata_ofertas b
          LEFT JOIN reserva_legal r
                 ON upper(immutable_unaccent(r.cidade)) = upper(immutable_unaccent(b.municipio))
                AND r.uf = b.uf
          LEFT JOIN polo_agro_municipio pam
                 ON pam.municipio_id = r.geocodigo
          LEFT JOIN polo_agro pa
                 ON pa.id_agrovalora = pam.polo_agro_id
          WHERE pa.nome = $1
            AND ($2::date IS NULL OR b.data_processo >= $2::date)
            AND ($3::date IS NULL OR b.data_processo <= $3::date)
        ) AS total_ofertas,
        (
          SELECT COUNT(cc.car)
          FROM car_compilado cc
          JOIN polo_agro_municipio pam
                 ON pam.municipio_id = split_part(cc.car, '-', 2)::bigint
          JOIN polo_agro pa
                 ON pa.id_agrovalora = pam.polo_agro_id
          WHERE pa.nome = $1
        ) AS total_cars
      `,
      params
    );

    const totalOfertasPolo = parseInt(coberturaResult.rows[0].total_ofertas, 10);
    const totalCarsPolo = parseInt(coberturaResult.rows[0].total_cars, 10);

    // Comparação CAR x Ofertas por faixa de tamanho (mesmos intervalos da planilha
    // LISTA_DE_FREQUENCIA.xlsx: 1, 5, 10, 20, 30, 50, 100, 300, 500, 1500, 3000, 5000, +5000 ha)
    const comparacaoResult = await client.query(
      `
      WITH car_polo AS (
        SELECT cc.area::numeric AS area
        FROM car_compilado cc
        JOIN polo_agro_municipio pam
               ON pam.municipio_id = split_part(cc.car, '-', 2)::bigint
        JOIN polo_agro pa
               ON pa.id_agrovalora = pam.polo_agro_id
        WHERE pa.nome = $1
      ),
      ofertas_polo AS (
        SELECT b.area
        FROM bigdata_ofertas b
        LEFT JOIN reserva_legal r
               ON upper(immutable_unaccent(r.cidade)) = upper(immutable_unaccent(b.municipio))
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
      ),
      car_faixas AS (
        SELECT ${faixaCase} AS faixa, COUNT(*) AS quantidade
        FROM car_polo
        GROUP BY faixa
      ),
      oferta_faixas AS (
        SELECT ${faixaCase} AS faixa, COUNT(*) AS quantidade
        FROM ofertas_polo
        GROUP BY faixa
      )
      SELECT 'car' AS tipo, faixa, quantidade FROM car_faixas
      UNION ALL
      SELECT 'oferta' AS tipo, faixa, quantidade FROM oferta_faixas
      `,
      params
    );

    const ordemFaixasTamanho = [
      "<=1", "1-5", "5-10", "10-20", "20-30", "30-50", "50-100",
      "100-300", "300-500", "500-1500", "1500-3000", "3000-5000", "+5000",
    ];
    const carPorFaixa = new Map<string, number>();
    const ofertaPorFaixa = new Map<string, number>();
    for (const row of comparacaoResult.rows) {
      const qtd = parseInt(row.quantidade, 10);
      if (row.tipo === "car") carPorFaixa.set(row.faixa, qtd);
      else ofertaPorFaixa.set(row.faixa, qtd);
    }
    const carCounts = ordemFaixasTamanho.map((f) => carPorFaixa.get(f) ?? 0);
    const ofertaCounts = ordemFaixasTamanho.map((f) => ofertaPorFaixa.get(f) ?? 0);

    function mediaDesvio(valores: number[]) {
      const n = valores.length;
      const media = valores.reduce((a, b) => a + b, 0) / n;
      const variancia = valores.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1);
      return { media, desvio: Math.sqrt(variancia) };
    }
    const { media: mediaCarFaixas, desvio: desvioCarFaixas } = mediaDesvio(carCounts);
    const { media: mediaOfertaFaixas, desvio: desvioOfertaFaixas } = mediaDesvio(ofertaCounts);

    const comparacaoFaixas = ordemFaixasTamanho.map((faixa, i) => ({
      faixa,
      carQtd: carCounts[i],
      ofertaQtd: ofertaCounts[i],
      carZ: desvioCarFaixas > 0 ? (carCounts[i] - mediaCarFaixas) / desvioCarFaixas : 0,
      ofertaZ: desvioOfertaFaixas > 0 ? (ofertaCounts[i] - mediaOfertaFaixas) / desvioOfertaFaixas : 0,
    }));

    return NextResponse.json({ usoStats, pontos, faixasArea, totalOfertasPolo, totalCarsPolo, comparacaoFaixas });
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
