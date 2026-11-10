import { Client } from "pg";

// Dados do Dashboard, calculados em segundo plano e guardados na memória do servidor.
//
// bigdata_ofertas tem ~716 mil linhas (~1 GB) e qualquer contagem sobre ela inteira leva de 20 a 30 s
// no banco. Por isso o Dashboard não consulta o banco a cada visita:
//   - uma única consulta, numa só passada pela tabela, produz todos os números da tela;
//   - o resultado fica em memória; quem abre o Dashboard recebe o último cálculo na hora;
//   - se o cálculo tem mais de IDADE_MAXIMA_MS, um novo é disparado em segundo plano (a visita
//     atual não espera; a próxima já recebe os números novos);
//   - instrumentation.ts dispara o primeiro cálculo assim que o servidor sobe.

export interface DashboardData {
  totalOfertas: number;
  distinctSites: string[];
  ofertasPorUf: { uf: string; count: number }[];
  ofertasPorUso: { uso: string; count: number }[];
  ofertasPorPolo: { polo_agro: string; count: number }[];
  atualizadoEm: string; // ISO
}

const IDADE_MAXIMA_MS = 60 * 60 * 1000; // 1 hora

// GROUPING(uf, uso, site, municipio_norm) liga o bit da coluna que NÃO está no grupo
// (uf é o bit mais alto). Cada conjunto de agrupamento abaixo tem um código:
//   ()               -> 1111 = 15   total
//   (uf)             -> 0111 = 7    ofertas por UF
//   (uso)            -> 1011 = 11   ofertas por uso
//   (site)           -> 1101 = 13   sites distintos
//   (uf, municipio)  -> 0110 = 6    base da contagem por polo
//
// A contagem por polo agrega primeiro por município (~5 mil grupos) e só depois liga com
// reserva_legal -> polo_agro_municipio -> polo_agro. Dá o mesmo resultado do join oferta a oferta
// (conferido polo a polo), sem ler cada oferta pelo índice.
const SQL_DASHBOARD = `
  WITH g AS MATERIALIZED (
    SELECT
      uf, uso, site,
      upper(immutable_unaccent(municipio)) AS municipio_norm,
      COUNT(*)::bigint AS n,
      GROUPING(uf, uso, site, upper(immutable_unaccent(municipio))) AS grupo
    FROM bigdata_ofertas
    GROUP BY GROUPING SETS ((), (uf), (uso), (site), (uf, upper(immutable_unaccent(municipio))))
  ),
  polos AS (
    SELECT pa.nome AS polo_agro, SUM(g.n)::bigint AS count
    FROM g
    JOIN reserva_legal r
      ON r.uf = g.uf AND upper(immutable_unaccent(r.cidade)) = g.municipio_norm
    JOIN polo_agro_municipio pam ON pam.municipio_id = r.geocodigo
    JOIN polo_agro pa ON pa.id_agrovalora = pam.polo_agro_id
    WHERE g.grupo = 6 AND pa.nome IS NOT NULL
    GROUP BY pa.nome
  )
  SELECT
    (SELECT n FROM g WHERE grupo = 15) AS total,
    (SELECT COALESCE(json_agg(site ORDER BY site), '[]') FROM g WHERE grupo = 13 AND site IS NOT NULL) AS sites,
    (SELECT COALESCE(json_agg(json_build_object('uf', uf, 'count', n) ORDER BY uf), '[]') FROM g WHERE grupo = 7 AND uf IS NOT NULL) AS por_uf,
    (SELECT COALESCE(json_agg(json_build_object('uso', uso, 'count', n) ORDER BY uso), '[]') FROM g WHERE grupo = 11 AND uso IS NOT NULL) AS por_uso,
    (SELECT COALESCE(json_agg(json_build_object('polo_agro', polo_agro, 'count', count) ORDER BY count DESC), '[]') FROM polos) AS por_polo
`;

async function calcularDashboard(): Promise<DashboardData> {
  const client = new Client({
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
  });
  await client.connect();
  try {
    await client.query("SET client_encoding TO 'UTF8'");
    const { rows } = await client.query(SQL_DASHBOARD);
    const row = rows[0];
    return {
      totalOfertas: Number(row.total ?? 0),
      distinctSites: row.sites,
      ofertasPorUf: row.por_uf.map((x: { uf: string; count: number }) => ({ uf: x.uf, count: Number(x.count) })),
      ofertasPorUso: row.por_uso.map((x: { uso: string; count: number }) => ({ uso: x.uso, count: Number(x.count) })),
      ofertasPorPolo: row.por_polo.map((x: { polo_agro: string; count: number }) => ({
        // polo_agro.nome está com encoding duplicado no banco (ex.: "ConfusÃ£o"); corrige para exibição
        polo_agro: Buffer.from(x.polo_agro, "latin1").toString("utf8"),
        count: Number(x.count),
      })),
      atualizadoEm: new Date().toISOString(),
    };
  } finally {
    await client.end();
  }
}

// Estado do cache. Fica em globalThis para sobreviver ao recarregamento de módulos do `next dev`.
const cache = globalThis as typeof globalThis & {
  __dashboardDados?: DashboardData;
  __dashboardCalculo?: Promise<DashboardData>;
};

/** Dispara um novo cálculo, a menos que um já esteja em andamento. */
export function atualizarDashboard(): Promise<DashboardData> {
  if (!cache.__dashboardCalculo) {
    const inicio = Date.now();
    cache.__dashboardCalculo = calcularDashboard()
      .then((dados) => {
        cache.__dashboardDados = dados;
        console.log(`Dashboard recalculado em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
        return dados;
      })
      .finally(() => {
        cache.__dashboardCalculo = undefined;
      });
  }
  return cache.__dashboardCalculo;
}

/** Último cálculo do Dashboard, se já existir (sem disparar consulta nenhuma). */
export function dashboardEmCache(): DashboardData | undefined {
  return cache.__dashboardDados;
}

/**
 * Devolve os dados do Dashboard. Usa o último cálculo, se houver (e recalcula em segundo plano
 * quando ele passou de IDADE_MAXIMA_MS); só espera o banco quando ainda não existe cálculo nenhum.
 */
export async function obterDashboard(): Promise<DashboardData> {
  const dados = cache.__dashboardDados;
  if (!dados) return atualizarDashboard();

  if (Date.now() - new Date(dados.atualizadoEm).getTime() > IDADE_MAXIMA_MS) {
    atualizarDashboard().catch((err) => console.error("Erro ao recalcular o Dashboard:", err));
  }
  return dados;
}
