"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart3, Table2, ScatterChartIcon, Ruler, PieChartIcon, GitCompare } from "lucide-react"
import {
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Customized,
  BarChart,
  Bar,
  LabelList,
  PieChart,
  Pie,
} from "recharts"

interface UsoStat {
  uso: string
  quantidade: number
  media: number
  moda: number | null
  mediana: number
  maximo: number
  minimo: number
}

interface Ponto {
  uso: string
  valorHa: number
}

interface FaixaArea {
  faixa: string
  quantidade: number
}

interface ComparacaoFaixa {
  faixa: string
  carQtd: number
  ofertaQtd: number
  carZ: number
  ofertaZ: number
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AF19FF", "#FF1943", "#19FFED", "#FFC0CB"]

const Y_CAP = 300000

function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function ultimoDiaDoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-").map(Number)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return `${anoMes}-${String(ultimoDia).padStart(2, "0")}`
}

function formatFaixaLabel(faixa: string): string {
  if (faixa.startsWith("+")) {
    return `+${Number(faixa.slice(1)).toLocaleString("pt-BR")}`
  }
  const [inicio, fim] = faixa.split("-").map(Number)
  return `${inicio.toLocaleString("pt-BR")}-${fim.toLocaleString("pt-BR")}`
}

function formatFaixaTamanhoLabel(faixa: string): string {
  if (faixa === "<=1") return "até 1"
  if (faixa.startsWith("+")) return `+${Number(faixa.slice(1)).toLocaleString("pt-BR")}`
  const [inicio, fim] = faixa.split("-").map(Number)
  return `${inicio.toLocaleString("pt-BR")}-${fim.toLocaleString("pt-BR")}`
}

export default function AnalisePage() {
  const [polos, setPolos] = useState<string[]>([])
  const [loadingPolos, setLoadingPolos] = useState(true)
  const [selectedPolo, setSelectedPolo] = useState("")
  const [mesInicio, setMesInicio] = useState("")
  const [mesFim, setMesFim] = useState("")

  const [usoStats, setUsoStats] = useState<UsoStat[]>([])
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [faixasArea, setFaixasArea] = useState<FaixaArea[]>([])
  const [comparacaoFaixas, setComparacaoFaixas] = useState<ComparacaoFaixa[]>([])
  const [totalOfertasPolo, setTotalOfertasPolo] = useState(0)
  const [totalCarsPolo, setTotalCarsPolo] = useState(0)
  const [loadingStats, setLoadingStats] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const poloOptions: ComboboxOption[] = useMemo(
    () => polos.filter(Boolean).map((p) => ({ value: p, label: p })),
    [polos]
  )

  useEffect(() => {
    async function loadFilters() {
      try {
        const response = await fetch("/api/filters")
        const data = await response.json()
        if (response.ok) {
          setPolos(data.polos)
        }
      } catch (err) {
        console.error("Erro ao carregar filtros:", err)
      } finally {
        setLoadingPolos(false)
      }
    }
    loadFilters()
  }, [])

  useEffect(() => {
    if (!selectedPolo) {
      setUsoStats([])
      setPontos([])
      setFaixasArea([])
      setComparacaoFaixas([])
      setTotalOfertasPolo(0)
      setTotalCarsPolo(0)
      setHasSearched(false)
      return
    }

    async function loadAnalysis() {
      setLoadingStats(true)
      setError(null)
      setHasSearched(true)
      try {
        const params = new URLSearchParams({ poloAgricola: selectedPolo })
        if (mesInicio) params.append("dataInicio", `${mesInicio}-01`)
        if (mesFim) params.append("dataFim", ultimoDiaDoMes(mesFim))

        const response = await fetch(`/api/analysis?${params.toString()}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || "Erro ao buscar dados de análise")
        }
        setUsoStats(data.usoStats)
        setPontos(data.pontos)
        setFaixasArea(data.faixasArea)
        setComparacaoFaixas(data.comparacaoFaixas)
        setTotalOfertasPolo(data.totalOfertasPolo)
        setTotalCarsPolo(data.totalCarsPolo)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
        setUsoStats([])
        setPontos([])
        setFaixasArea([])
        setComparacaoFaixas([])
        setTotalOfertasPolo(0)
        setTotalCarsPolo(0)
      } finally {
        setLoadingStats(false)
      }
    }
    loadAnalysis()
  }, [selectedPolo, mesInicio, mesFim])

  // Ordem dos usos no eixo X segue a mesma ordem já definida pela API (usoStats)
  const usoOrder = useMemo(() => usoStats.map((u) => u.uso), [usoStats])
  const usoIndex = useMemo(() => {
    const m = new Map<string, number>()
    usoOrder.forEach((u, i) => m.set(u, i))
    return m
  }, [usoOrder])
  const usoStatsByName = useMemo(() => {
    const m = new Map<string, UsoStat>()
    usoStats.forEach((s) => m.set(s.uso, s))
    return m
  }, [usoStats])

  // Jitter horizontal determinístico (baseado no índice do ponto) para não "tremer" a cada re-render
  const scatterData = useMemo(() => {
    return pontos
      .filter((p) => p.valorHa <= Y_CAP)
      .map((p, i) => {
        const idx = usoIndex.get(p.uso) ?? 0
        const seed = Math.sin(i * 12.9898) * 43758.5453
        const jitter = (seed - Math.floor(seed) - 0.5) * 0.7
        return { x: idx + jitter, y: p.valorHa, uso: p.uso }
      })
  }, [pontos, usoIndex])

  const pontosForaDaVista = useMemo(() => pontos.filter((p) => p.valorHa > Y_CAP).length, [pontos])

  function UsoTick({ x, y, payload }: any) {
    const uso = usoOrder[payload.value]
    const stat = usoStatsByName.get(uso)
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" fontSize={12} fill="#374151">
          {uso}
        </text>
        <text x={0} y={0} dy={32} textAnchor="middle" fontSize={11} fill="#6b7280">
          {`(n=${stat?.quantidade ?? 0})`}
        </text>
      </g>
    )
  }

  function renderMedianLines(props: any) {
    const xAxis = Object.values(props.xAxisMap ?? {})[0] as any
    const yAxis = Object.values(props.yAxisMap ?? {})[0] as any
    if (!xAxis || !yAxis) return null
    return (
      <g>
        {usoStats.map((stat, idx) => {
          if (stat.mediana > Y_CAP) return null
          const x1 = xAxis.scale(idx - 0.35)
          const x2 = xAxis.scale(idx + 0.35)
          const y = yAxis.scale(stat.mediana)
          return (
            <g key={stat.uso}>
              <line x1={x1} x2={x2} y1={y} y2={y} stroke="#dc2626" strokeWidth={3} />
              <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#dc2626">
                {`mediana ${formatCurrency(stat.mediana)}`}
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  return (
    <div className="space-y-6 container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Análise por Polo Agro</h1>
          <p className="text-muted-foreground">Estatísticas de valor por hectare agrupadas por uso.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Selecione o Polo Agrícola</CardTitle>
          <CardDescription>As tabelas e gráficos abaixo serão calculados para o polo selecionado.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 max-w-sm">
              <Label htmlFor="polo">Polo Agrícola</Label>
              <Combobox
                options={poloOptions}
                value={selectedPolo}
                onSelect={setSelectedPolo}
                placeholder="Selecione o polo"
                searchPlaceholder="Buscar polo..."
                emptyPlaceholder="Nenhum polo encontrado."
                disabled={loadingPolos}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mesInicio">Período (data do processo) - De</Label>
              <Input
                id="mesInicio"
                type="month"
                min="2025-01"
                value={mesInicio}
                onChange={(e) => setMesInicio(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mesFim">Até</Label>
              <Input
                id="mesFim"
                type="month"
                min="2025-01"
                value={mesFim}
                onChange={(e) => setMesFim(e.target.value)}
                className="w-44"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Parte 1: Tabela de estatísticas por uso */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-muted-foreground" /> Estatísticas de Valor por Hectare por Uso
          </CardTitle>
          <CardDescription>
            Quantidade de ofertas, média, moda, mediana, valor máximo e mínimo (R$/ha) para cada tipo de uso do solo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasSearched ? (
            <p className="text-center text-muted-foreground py-8">Selecione um polo agrícola para ver as estatísticas.</p>
          ) : loadingStats ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : usoStats.length > 0 ? (
            <div className="relative">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Uso</TableHead>
                    <TableHead className="text-right">Qtd. Ofertas</TableHead>
                    <TableHead className="text-right">Média (R$/ha)</TableHead>
                    <TableHead className="text-right">Moda (R$/ha)</TableHead>
                    <TableHead className="text-right">Mediana (R$/ha)</TableHead>
                    <TableHead className="text-right">Máximo (R$/ha)</TableHead>
                    <TableHead className="text-right">Mínimo (R$/ha)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usoStats.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.uso}</TableCell>
                      <TableCell className="text-right">{item.quantidade.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.media)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.moda)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.mediana)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.maximo)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.minimo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {usoStats.reduce((sum, item) => sum + item.quantidade, 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhuma oferta encontrada para este polo.</p>
          )}
        </CardContent>
      </Card>

      {/* Parte 2: Gráfico de dispersão do valor por hectare por uso */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScatterChartIcon className="h-5 w-5 text-muted-foreground" /> Dispersão do Valor por Hectare por Uso
          </CardTitle>
          <CardDescription>
            {hasSearched && !loadingStats && usoStats.length > 0
              ? `Polo ${selectedPolo} — linha vermelha = mediana da classe — eixo até ${formatCurrency(Y_CAP)}/ha (${pontosForaDaVista.toLocaleString("pt-BR")} amostras acima, fora da vista)`
              : "Cada ponto representa uma oferta. A linha vermelha marca a mediana de cada classe de uso."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasSearched ? (
            <p className="text-center text-muted-foreground py-8">Selecione um polo agrícola para ver o gráfico.</p>
          ) : loadingStats ? (
            <Skeleton className="h-[500px] w-full" />
          ) : usoStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={500}>
              <ScatterChart margin={{ top: 30, right: 30, left: 20, bottom: 20 }}>
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[-0.5, usoOrder.length - 0.5]}
                  ticks={usoOrder.map((_, i) => i)}
                  tick={UsoTick}
                  interval={0}
                  height={50}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[0, Y_CAP]}
                  tickFormatter={(v) => `R$ ${(v / 1000).toLocaleString("pt-BR")}k`}
                  width={70}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null
                    const p = payload[0].payload as { uso: string; y: number }
                    return (
                      <div className="bg-background border rounded-md p-2 text-sm shadow-md">
                        <div className="font-medium">{p.uso}</div>
                        <div>{formatCurrency(p.y)}/ha</div>
                      </div>
                    )
                  }}
                />
                <Scatter data={scatterData} fill="#8884d8" fillOpacity={0.6}>
                  {scatterData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[(usoIndex.get(entry.uso) ?? 0) % COLORS.length]} />
                  ))}
                </Scatter>
                <Customized component={renderMedianLines} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhuma oferta encontrada para este polo.</p>
          )}
        </CardContent>
      </Card>

      {/* Parte 3: Distribuição de ofertas por faixa de tamanho */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-muted-foreground" /> Ofertas por Faixa de Tamanho
          </CardTitle>
          <CardDescription>Quantidade total de ofertas por faixa de área (hectares), independente do uso.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasSearched ? (
            <p className="text-center text-muted-foreground py-8">Selecione um polo agrícola para ver o gráfico.</p>
          ) : loadingStats ? (
            <Skeleton className="h-96 w-full" />
          ) : faixasArea.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={faixasArea}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="faixa"
                  tickFormatter={formatFaixaLabel}
                  width={110}
                  label={{ value: "Faixa de tamanho (ha)", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString("pt-BR"), "Ofertas"]}
                  labelFormatter={(label: string) => formatFaixaLabel(label)}
                />
                <Bar dataKey="quantidade" name="Ofertas" fill="#8884d8">
                  <LabelList
                    dataKey="quantidade"
                    position="insideRight"
                    fill="#fff"
                    fontSize={12}
                    formatter={(value: number) => value.toLocaleString("pt-BR")}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhuma oferta encontrada para este polo.</p>
          )}
        </CardContent>
      </Card>

      {/* Parte 4: Cobertura de ofertas em relação ao total de CARs do polo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChartIcon className="h-5 w-5 text-muted-foreground" /> Cobertura de Ofertas vs. CAR
          </CardTitle>
          <CardDescription>
            Proporção entre o número de ofertas anunciadas e o total de Cadastros Ambientais Rurais (CAR) dos municípios do polo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasSearched ? (
            <p className="text-center text-muted-foreground py-8">Selecione um polo agrícola para ver o gráfico.</p>
          ) : loadingStats ? (
            <Skeleton className="h-96 w-full" />
          ) : totalCarsPolo > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Ofertas no mercado", value: totalOfertasPolo },
                      { name: "Demais imóveis (CAR sem oferta)", value: Math.max(totalCarsPolo - totalOfertasPolo, 0) },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={90}
                    outerRadius={140}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    <Cell fill="#0088FE" />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString("pt-BR")} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[180px] left-0 right-0 text-center pointer-events-none">
                <div className="text-3xl font-bold text-foreground">
                  {((totalOfertasPolo / totalCarsPolo) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-muted-foreground">de cobertura</div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-[#0088FE]" />
                <span>Ofertas no mercado</span>
              </div>
              <p className="text-center text-sm text-muted-foreground mt-2">
                {totalOfertasPolo.toLocaleString("pt-BR")} ofertas de um total de {totalCarsPolo.toLocaleString("pt-BR")} CARs cadastrados nos municípios do polo.
              </p>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhum CAR encontrado para este polo.</p>
          )}
        </CardContent>
      </Card>
      {/* Parte 5: Comparação entre distribuição de tamanho do CAR e das ofertas (Z-score, como na planilha) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-muted-foreground" /> Comparação CAR x Ofertas por Faixa de Tamanho
          </CardTitle>
          <CardDescription>
            Compara, faixa a faixa, como o tamanho dos imóveis anunciados se distribui em relação ao total de CARs
            do polo: barras para cima indicam faixa super-representada, para baixo indicam sub-representada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasSearched ? (
            <p className="text-center text-muted-foreground py-8">Selecione um polo agrícola para ver o gráfico.</p>
          ) : loadingStats ? (
            <Skeleton className="h-96 w-full" />
          ) : comparacaoFaixas.length > 0 ? (
            <ResponsiveContainer width="100%" height={450}>
              <BarChart data={comparacaoFaixas} stackOffset="sign" margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <XAxis dataKey="faixa" tickFormatter={formatFaixaTamanhoLabel} angle={-40} textAnchor="end" height={70} interval={0} fontSize={12} />
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} width={50} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${(value * 100).toFixed(0)}%`, name]}
                  labelFormatter={(label: string) => formatFaixaTamanhoLabel(label)}
                />
                <Legend />
                <Bar dataKey="carZ" name="CAR" stackId="faixa" fill="#0c4a6e" />
                <Bar dataKey="ofertaZ" name="OFERTAS" stackId="faixa" fill="#f97316">
                  <LabelList
                    dataKey="ofertaQtd"
                    position="inside"
                    formatter={(value: number) => value.toLocaleString("pt-BR")}
                    fontSize={12}
                    fontWeight={600}
                    fill="#fff"
                    stroke="#000"
                    strokeWidth={3}
                    paintOrder="stroke"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado para este polo.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
