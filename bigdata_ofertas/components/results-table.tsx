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
import { Download, ExternalLink, FileText, ImageIcon, ImageOff } from "lucide-react"
import type { OfertaResult } from "@/components/query-form"

// Define as colunas que devem ser exibidas e a ordem delas
const DISPLAY_COLUMNS = [
  "municipio",
  "uf",
  "preco",
  "area",
  "valor_ha",
  "foto_principal",
  "uso",
  "url",
  "pagina_imagem",
  "data_processo",
  "site",
  "descricao",
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

// URL da foto principal a exibir, ou null se o valor não for uma URL utilizável
function urlFotoPrincipal(value: unknown): string | null {
  // No Viva Real o coletor gravou o srcset inteiro ("url1 340w, url2 768w, url3 1080w") em vez de
  // uma URL. Usa a primeira URL da lista, a menor (200x200), que basta para a miniatura.
  let foto = typeof value === "string" ? value.trim().split(/\s+/)[0] : ""
  // No Buskaza parte das fotos passa pelo intermediário cdn.buskaza.com.br, que saiu do ar (o domínio
  // não existe mais). A URL traz a foto original no parâmetro image_url; usa ela direto.
  try {
    const u = new URL(foto)
    const original = u.hostname === "cdn.buskaza.com.br" ? u.searchParams.get("image_url") : null
    if (original) foto = original
  } catch {
    // não é URL; cai no teste abaixo
  }
  // A base também tem valores como "N/A", que o navegador mostraria como imagem quebrada
  return /^https?:\/\//i.test(foto) ? foto : null
}

// Miniatura da foto principal. Quando a foto não existe mais no site de origem (anúncio removido,
// site que trocou os arquivos, como o Parnaíba), mostra um ícone de "foto indisponível" no lugar da
// imagem quebrada; se houver página salva, o clique abre o print, onde a foto aparece.
function FotoPrincipal({ value, onAbrirPaginaSalva }: { value: unknown; onAbrirPaginaSalva?: () => void }) {
  const foto = urlFotoPrincipal(value)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => setFalhou(false), [foto])

  if (!foto) return <>-</>

  if (falhou) {
    const titulo = onAbrirPaginaSalva
      ? "A foto não está mais disponível no site. Clique para ver a página salva do anúncio."
      : "A foto não está mais disponível no site."
    return (
      <button
        type="button"
        onClick={onAbrirPaginaSalva}
        disabled={!onAbrirPaginaSalva}
        title={titulo}
        aria-label={titulo}
        className="flex w-20 h-14 items-center justify-center rounded border border-dashed text-muted-foreground enabled:hover:bg-secondary enabled:cursor-pointer"
      >
        <ImageOff className="h-5 w-5" />
      </button>
    )
  }

  return (
    <img
      src={foto}
      alt="Foto Principal"
      // Os CDNs de imagem da OLX, Zap Imóveis e Viva Real bloqueiam (403) pedidos cujo Referer é
      // outro site (proteção contra hotlink). Sem Referer eles entregam a foto normalmente.
      referrerPolicy="no-referrer"
      loading="lazy"
      className="w-20 h-14 object-cover rounded"
      onError={() => setFalhou(true)}
    />
  )
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

  // Área: sempre 2 casas decimais. Vem do banco como texto (numeric -> "5000.0000"), por isso
  // converte antes de formatar.
  if (key === "area") {
    const area = Number(value)
    return Number.isFinite(area)
      ? area.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(value)
  }

  // Preço e valor/ha: em reais com centavos. Vêm do banco como texto já formatado
  // (tipo money -> "R$ 270.000.000,00"), por isso convertem para número antes de formatar.
  if (key === "preco" || key === "valor_ha") {
    const reais =
      typeof value === "number" ? value : Number(String(value).replace(/[^\d,-]/g, "").replace(",", "."))
    return Number.isFinite(reais)
      ? reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(value)
  }

  if (typeof value === "number") {
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

  // Abre o diálogo com a página salva (print) da oferta
  const abrirPaginaSalva = (result: OfertaResult) => {
    setErroImagem(false)
    setImagemAberta({
      caminho: result.pagina_imagem,
      titulo: [result.site, result.municipio, result.uf].filter(Boolean).join(" · "),
    })
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
                        if (columnKey === descriptionColumn) {
                          // Só um botão, para não ocupar espaço com o texto; o texto abre no diálogo
                          return (
                            <TableCell key={columnKey}>
                              {typeof cellValue === "string" && cellValue.trim() ? (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleDoubleClick(cellValue, "Descrição Completa")}
                                  title="Ler a descrição completa do anúncio"
                                  aria-label="Ler a descrição completa do anúncio"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          )
                        }
                        if (columnKey === "foto_principal") {
                          return (
                            <TableCell key={columnKey}>
                              <FotoPrincipal
                                value={cellValue}
                                onAbrirPaginaSalva={result.pagina_imagem ? () => abrirPaginaSalva(result) : undefined}
                              />
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
                                  onClick={() => abrirPaginaSalva(result)}
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
