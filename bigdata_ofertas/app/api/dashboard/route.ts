import { NextResponse } from "next/server";
import { obterDashboard } from "@/lib/dashboard";

// Os números vêm do cálculo guardado em memória (lib/dashboard.ts), não de uma consulta por visita.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await obterDashboard());
  } catch (error) {
    console.error("Erro ao buscar dados do dashboard:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do dashboard" },
      { status: 500 }
    );
  }
}
