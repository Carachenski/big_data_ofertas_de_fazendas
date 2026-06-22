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
import type { OfertaResult } from "@/components/query-form"

// Define as colunas que devem ser exibidas e a ordem delas
const DISPLAY_COLUMNS = [
  "preco",
  "municipio",
  "uf",
  "descricao",
  "foto_principal",
  "url",
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
  data_processo: "Data Processo",
  uso: "Uso",
  site: "Site",
  area: "Área",
  valor_ha: "Valor/HA",
}

// Função para formatar valores para exibição
function formatValue(key: string, value: any): React.ReactNode {
  if (value === null || value === undefined) {
    return "-"
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
    </>
  )
}
