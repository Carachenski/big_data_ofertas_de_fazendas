// Executado uma vez quando o servidor Next sobe.
// Dispara o primeiro cálculo do Dashboard em segundo plano, para que nem a primeira visita
// precise esperar a consulta (~30 s) ao banco. Ver lib/dashboard.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { atualizarDashboard } = await import("./lib/dashboard");
  atualizarDashboard().catch((err) => console.error("Erro no cálculo inicial do Dashboard:", err));
}
