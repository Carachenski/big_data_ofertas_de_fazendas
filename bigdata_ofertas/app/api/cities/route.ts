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
      await client.query("SET client_encoding TO 'UTF8'");  return client;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const uf = searchParams.get("uf");

  if (!uf) {
    return NextResponse.json(
      { error: "Parâmetro 'uf' é obrigatório" },
      { status: 400 }
    );
  }

  const client = await getDbClient();

  try {
    const cidadesResult = await client.query(
      `
      SELECT DISTINCT cidade FROM reserva_legal
      WHERE uf = $1 AND cidade IS NOT NULL
      ORDER BY cidade
    `,
      [uf]
    );

    const cidades = cidadesResult.rows.map((r) => r.cidade);
    return NextResponse.json({ cidades });
  } catch (error) {
    console.error("Erro ao buscar cidades:", error);
    return NextResponse.json(
      { error: "Erro ao buscar cidades do banco de dados" },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}
