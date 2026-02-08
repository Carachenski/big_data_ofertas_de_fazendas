"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ListChecks, Globe, AreaChart, PieChartIcon, Table2 } from "lucide-react";


interface DashboardData {
  totalOfertas: number;
  distinctSites: string[];
  ofertasPorUf: { uf: string; count: number }[];
  ofertasPorUso: { uso: string; count: number }[];
  ofertasPorPolo: { polo_agro: string; count: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poloFilter, setPoloFilter] = useState("");

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const response = await fetch("/api/dashboard");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        setError("Erro ao carregar dados do dashboard.");
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full col-span-full" />
            <Skeleton className="h-96 w-full col-span-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null; // Should not happen if loading and error are handled
  }

  // Create sorted copies for charts to avoid state mutation
  const sortedOfertasPorUf = [...data.ofertasPorUf].sort((a, b) => b.count - a.count);
  const sortedOfertasPorUso = [...data.ofertasPorUso].sort((a, b) => b.count - a.count);
  const totalUso = sortedOfertasPorUso.reduce((sum, entry) => sum + entry.count, 0);

  const filteredPoloData = data.ofertasPorPolo.filter(item =>
    item.polo_agro.toLowerCase().includes(poloFilter.toLowerCase())
  );

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1943', '#19FFED', '#FFC0CB'];

  const CustomLegend = ({ payload }: any) => {
    return (
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-sm text-muted-foreground">
        {payload.map((entry: any, index: number) => (
          <li key={`item-${index}`} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.value} ({(entry.payload.percent * 100).toFixed(1)}%)</span>
          </li>
        ))}
      </ul>
    );
  };




  return (
    <div className="space-y-6 container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
          <AreaChart className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard de Ofertas</h1>
            <p className="text-muted-foreground">Visão geral quantitativa do banco de dados.</p>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total de Ofertas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Ofertas</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalOfertas.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-muted-foreground">
              Total de registros no banco de dados.
            </p>
          </CardContent>
        </Card>

        {/* Sites Distintos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sites Distintos</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="max-h-24 overflow-y-auto">
              {data.distinctSites.length > 0 ? (
                data.distinctSites.map((site, index) => (
                  <div key={index} className="text-sm font-medium">{site}</div>
                ))
              ) : (
                <div className="text-sm font-medium">Nenhum site encontrado.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Gráfico de Barras: Ofertas por UF */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5 text-muted-foreground" /> Ofertas por UF
            </CardTitle>
            <CardDescription>Quantidade de ofertas por Unidade Federativa (do maior para o menor).</CardDescription>
          </CardHeader>
          <CardContent>
            {sortedOfertasPorUf.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={sortedOfertasPorUf} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="uf" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value) => [value.toLocaleString('pt-BR'), 'Ofertas']} />
                  <Legend />
                  <Bar dataKey="count" name="Ofertas" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhuma oferta por UF encontrada.</p>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Pizza: Ofertas por Uso */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-muted-foreground" /> Ofertas por Uso
            </CardTitle>
            <CardDescription>Distribuição de ofertas por tipo de uso do solo.</CardDescription>
          </CardHeader>
          <CardContent>
            {sortedOfertasPorUso.length > 0 ? (
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={sortedOfertasPorUso}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={false}
                    outerRadius={150}
                    fill="#8884d8"
                    nameKey="uso"
                    dataKey="count"
                  >
                    {sortedOfertasPorUso.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => {
                    const percent = totalUso > 0 ? ((value / totalUso) * 100).toFixed(1) : "0.0";
                    return [`${value.toLocaleString('pt-BR')} (${percent}%)`, name];
                  }} />
                  <Legend content={<CustomLegend />} verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhuma oferta por uso encontrada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela: Ofertas por Polo Agro */}
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Table2 className="h-5 w-5 text-muted-foreground" /> Ofertas por Polo Agro
                </CardTitle>
                <CardDescription>Quantidade de ofertas agrupadas por Polo Agrícola.</CardDescription>
            </CardHeader>
            <CardContent>
                <Input
                    placeholder="Digite para filtrar por polo..."
                    value={poloFilter}
                    onChange={(e) => setPoloFilter(e.target.value)}
                    className="mb-4"
                />
                {filteredPoloData.length > 0 ? (
                    <div className="overflow-y-auto max-h-96 relative">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                    <TableHead>Polo Agrícola</TableHead>
                                    <TableHead className="text-right">Quantidade de Ofertas</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPoloData.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.polo_agro}</TableCell>
                                        <TableCell className="text-right">{item.count.toLocaleString('pt-BR')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <p className="text-center text-muted-foreground py-8">Nenhum polo encontrado com o filtro atual.</p>
                )}
            </CardContent>
        </Card>
    </div>
  )
}


