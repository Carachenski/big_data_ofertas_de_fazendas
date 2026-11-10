"use client"

import { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, ExternalLink, ImageIcon } from "lucide-react"
import type { OfertaResult } from "@/components/query-form"

// Define as colunas que devem ser exibidas e a ordem delas
const DISPLAY_COLUMNS = [
  "preco",
  "municipio",
  "uf",
  "descricao",
  "foto_principal",
  "url",
  "pagina_imagem",
  "data_processo",
  "uso",
  "site",
  "area",
  "valor_ha",
]

// Mapeia os nomes das colunas para os cabeçalhos de exibição
const COLUMN_HEADERS: { [key: string]: string } = {
  preco: "Preço",
  municipio: "Município",
  uf: "Estado",
  descricao: "Descrição",
  foto_principal: "Foto Principal",
  url: "URL",
  pagina_imagem: "Página Salva",
  data_processo: "Data Processo",
  uso: "Uso",
  site: "Site",
  area: "Área",
  valor_ha: "Valor/HA",
}

// Função para formatar valores para exibição
// URL da imagem da página salva da oferta (servida por /api/imagem a partir de pagina_imagem)
function imagemUrl(caminho: string, download = false): string {
  const params = new URLSearchParams({ path: caminho })
  if (download) params.append("download", "1")
  return `/api/imagem?${params.toString()}`
}

function formatValue(key: string, value: any): React.ReactNode {
  if (value === null || value === undefined) {
    return "-"
  }

  // Data do processo: só mês/ano. Lê direto do texto ISO ("2025-11-19T00:00:00.000Z") em vez de
  // usar new Date(), que no fuso do Brasil jogaria o dia 1º para o mês anterior.
  if (key === "data_processo") {
    const m = /^(\d{4})-(\d{2})/.exec(String(value))
    return m ? `${m[2]}/${m[1]}` : String(value)
  }

  // Tratamento específico para URL
  if (key === "url" && typeof value === "string") {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
        Link
      </a>
    )
  }

  // Tratamento específico para Foto Principal (assumindo que seja uma URL de imagem)
  if (key === "foto_principal" && typeof value === "string") {
    return (
      <img
        src={value}
        alt="Foto Principal"
        className="w-20 h-14 object-cover rounded"
        onError={(e) => {
          // A imagem original falhou, não tentar carregar outro placeholder que pode falhar
          // O navegador mostrará o ícone de imagem quebrada por padrão
        }}
      />
    )
  }

  if (typeof value === "number") {
    if (key === "preco" || key === "valor_ha") {
      return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })
    }
    // Formatação para outros números (como área)
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  if (typeof value === "string" && (value.startsWith("http://") || value.startsWith("https://"))) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
        Link
      </a>
    )
  }
  return String(value)
}

interface ResultsTableProps {
  results: OfertaResult[]
  isLoading: boolean
}

export function ResultsTable({ results, isLoading }: ResultsTableProps) {
  const [modalContent, setModalContent] = useState<{ title: string; content: string } | null>(null)
  // Oferta cuja página salva (pagina_imagem) está aberta no diálogo de imagem
  const [imagemAberta, setImagemAberta] = useState<{ caminho: string; titulo: string } | null>(null)
  const [erroImagem, setErroImagem] = useState(false)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const descriptionColumn = "descricao"

  const handleDoubleClick = (content: string, title: string) => {
    setModalContent({ title, content })
  }

  const handleCloseModal = () => {
    setModalContent(null)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Resultados</CardTitle>
          <CardDescription>
            {results.length} {results.length === 1 ? "registro encontrado" : "registros encontrados"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum resultado encontrado para os filtros informados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {DISPLAY_COLUMNS.map((columnKey) => (
                      <TableHead key={columnKey} className="capitalize">
                        {COLUMN_HEADERS[columnKey] || columnKey.replace(/_/g, " ")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={result.id || index}>
                      {DISPLAY_COLUMNS.map((columnKey) => {
                        const cellValue = result[columnKey]
                        if (columnKey === descriptionColumn && typeof cellValue === 'string') {
                          return (
                            <TableCell
                              key={columnKey}
                              onDoubleClick={() => handleDoubleClick(cellValue, "Descrição Completa")}
                              className="cursor-pointer"
                              title="Clique duas vezes para ver a descrição completa"
                            >
                              <div className="max-w-xs truncate">
                                {cellValue}
                              </div>
                            </TableCell>
                          )
                        }
                        if (columnKey === "pagina_imagem") {
                          return (
                            <TableCell key={columnKey}>
                              {typeof cellValue === "string" && cellValue ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setErroImagem(false)
                                    setImagemAberta({
                                      caminho: cellValue,
                                      titulo: [result.site, result.municipio, result.uf].filter(Boolean).join(" · "),
                                    })
                                  }}
                                  title="Ver a página do anúncio salva (para quando a oferta sai do ar)"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                  Ver
                                </Button>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          )
                        }
                        return (
                          <TableCell key={columnKey}>
                            {formatValue(columnKey, cellValue)}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!modalContent} onOpenChange={(isOpen) => !isOpen && handleCloseModal()}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{modalContent?.title}</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="prose max-h-[60vh] overflow-y-auto p-4 bg-secondary rounded-md">
              <p style={{ whiteSpace: 'pre-wrap' }}>{modalContent?.content}</p>
            </div>
          </DialogDescription>
        </DialogContent>
      </Dialog>

      <Dialog open={!!imagemAberta} onOpenChange={(isOpen) => !isOpen && setImagemAberta(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Página salva da oferta</DialogTitle>
            <DialogDescription>{imagemAberta?.titulo}</DialogDescription>
          </DialogHeader>
          {imagemAberta && (
            <>
              <div className="max-h-[65vh] overflow-y-auto rounded-md border bg-secondary">
                {erroImagem ? (
                  <p className="p-8 text-center text-muted-foreground">
                    Não foi possível carregar a imagem desta oferta.
                  </p>
                ) : (
                  <img
                    src={imagemUrl(imagemAberta.caminho)}
                    alt="Página salva da oferta"
                    className="w-full h-auto"
                    onError={() => setErroImagem(true)}
                  />
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" asChild>
                  <a href={imagemUrl(imagemAberta.caminho)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Abrir em nova aba
                  </a>
                </Button>
                <Button asChild disabled={erroImagem}>
                  <a href={imagemUrl(imagemAberta.caminho, true)}>
                    <Download className="h-4 w-4" />
                    Baixar
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
