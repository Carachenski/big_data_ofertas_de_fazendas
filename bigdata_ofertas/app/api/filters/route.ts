import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
})

export async function GET() {
  try {
    // Buscar UFs distintas
    const ufsResult = await pool.query(`
      SELECT DISTINCT uf FROM reserva_legal 
      WHERE uf IS NOT NULL 
      ORDER BY uf
    `)

    // A busca de cidades foi movida para /api/cities?uf=... para carregamento sob demanda

    // Buscar usos distintos
    const usosResult = await pool.query(`
      SELECT DISTINCT uso FROM bigdata_ofertas 
      WHERE uso IS NOT NULL 
      ORDER BY uso
    `)

    // Buscar polos agrícolas distintos
    const polosResult = await pool.query(`
      SELECT DISTINCT pa.nome 
      FROM polo_agro pa
      INNER JOIN polo_agro_municipio pam ON pa.id_agrovalora = pam.polo_agro_id
      WHERE pa.nome IS NOT NULL
      ORDER BY pa.nome
    `)

    return NextResponse.json({
      ufs: ufsResult.rows.map((r) => r.uf),
      cidades: [], // Retorna array vazio, cidades são carregadas sob demanda
      usos: usosResult.rows.map((r) => r.uso),
      polos: polosResult.rows.map((r) => Buffer.from(r.nome, 'latin1').toString('utf-8')),
    })
  } catch (error) {
    console.error("Erro ao buscar filtros:", error)
    return NextResponse.json({ error: "Erro ao buscar filtros do banco de dados" }, { status: 500 })
  }
}