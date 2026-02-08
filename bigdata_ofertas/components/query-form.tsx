"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { ResultsTable } from "@/components/results-table"
import { Search, Loader2, MapPin, Wheat, Sheet } from "lucide-react"

export type OfertaResult = Record<string, any>

interface FiltersData {
  ufs: string[]
  usos: string[]
  polos: string[]
}

type SearchType = "location" | "polo"

export function QueryForm() {
  const [filters, setFilters] = useState<FiltersData>({
    ufs: [],
    usos: [],
    polos: [],
  })
  const [loadingFilters, setLoadingFilters] = useState(true)

  // Estado para cidades carregadas sob demanda
  const [cidadeOptions, setCidadeOptions] = useState<ComboboxOption[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const [searchType, setSearchType] = useState<SearchType>("location")

  // Location filters
  const [selectedUf, setSelectedUf] = useState("")
  const [selectedCidades, setSelectedCidades] = useState<string[]>([])
  const [selectedUsosLocation, setSelectedUsosLocation] = useState<string[]>([])

  // Polo filters
  const [selectedPolo, setSelectedPolo] = useState("")
  const [selectedUsosPolo, setSelectedUsosPolo] = useState<string[]>([])

  // Results
  const [results, setResults] = useState<OfertaResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Memoize a transformação dos filtros para o formato do Combobox
  const ufOptions = useMemo(() => filters.ufs.filter(Boolean).map(uf => ({ value: uf, label: uf })), [filters.ufs])
  const poloOptions = useMemo(() => filters.polos.filter(Boolean).map(p => ({ value: p, label: p })), [filters.polos])
  const usoOptions = useMemo(() => filters.usos.filter(Boolean).map(u => ({ value: u, label: u })), [filters.usos])

  // Carrega filtros iniciais (sem cidades)
  useEffect(() => {
    async function loadInitialFilters() {
      try {
        const response = await fetch("/api/filters")
        const data = await response.json()
        if (response.ok) {
          setFilters(data)
        }
      } catch (err) {
        console.error("Erro ao carregar filtros:", err)
      } finally {
        setLoadingFilters(false)
      }
    }
    loadInitialFilters()
  }, [])

  // Carrega cidades quando a UF muda
  useEffect(() => {
    async function loadCities() {
      console.log("loadCities useEffect acionado para UF:", selectedUf)
      if (!selectedUf) {
        setCidadeOptions([])
        return
      }
      try {
        setLoadingCities(true)
        setSelectedCidades([]) // Limpa seleção de cidades anterior
        const response = await fetch(`/api/cities?uf=${selectedUf}`)
        const data = await response.json()
        if (response.ok) {
          const options = data.cidades.map((c: string) => ({ value: c, label: c }))
          setCidadeOptions(options)
        }
      } catch (err) {
        console.error("Erro ao carregar cidades:", err)
        setCidadeOptions([])
      } finally {
        setLoadingCities(false)
      }
    }
    loadCities()
  }, [selectedUf])


    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      setIsLoading(true)
      setError(null)
      setHasSearched(true)

      try {
        const params = new URLSearchParams()
        params.append("searchType", searchType)

        if (searchType === "location") {
          if (selectedUf) params.append("uf", selectedUf)
          selectedCidades.forEach(cidade => params.append("cidade", cidade))
          selectedUsosLocation.forEach(uso => params.append("uso", uso))
        }

        else {
          if (selectedPolo) params.append("poloAgricola", selectedPolo)
          selectedUsosPolo.forEach(uso => params.append("uso", uso))
        }

        const response = await fetch(`/api/query?${params.toString()}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Erro ao realizar consulta")
        }

        setResults(data.results)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }

        const clearFilters = () => {

          setSelectedUf("")

          setSelectedCidades([])

          setSelectedUsosLocation([])

          setSelectedPolo("")

          setSelectedUsosPolo([])

          setResults([])

          setHasSearched(false)

          setError(null)

        }


  


    


  


        const handleSearchTypeChange = (type: SearchType) => {


  


          setSearchType(type)


  


          clearFilters()


  


        }


  


    


  


        const handleExport = async () => {


  


          setIsExporting(true);


  


          setError(null);


  


    


  


          try {


  


            const params = new URLSearchParams();


  


            params.append("searchType", searchType);


  


    


  


            if (searchType === "location") {


  


              if (selectedUf) params.append("uf", selectedUf);


  


              selectedCidades.forEach(cidade => params.append("cidade", cidade));


  


              selectedUsosLocation.forEach(uso => params.append("uso", uso));


  


            } else {


  


              if (selectedPolo) params.append("poloAgricola", selectedPolo);


  


              selectedUsosPolo.forEach(uso => params.append("uso", uso));


  


            }


  


    


  


            const response = await fetch(`/api/export-excel?${params.toString()}`);


  


    


  


            if (!response.ok) {


  


              const errorData = await response.json();


  


              throw new Error(errorData.error || "Erro ao exportar para Excel");


  


            }


  


    


  


            const blob = await response.blob();


  


            const url = window.URL.createObjectURL(blob);


  


            const a = document.createElement('a');


  


            a.href = url;


  


            a.download = 'ofertas.xlsx';


  


            document.body.appendChild(a);


  


            a.click();


  


            a.remove();


  


            window.URL.revokeObjectURL(url);


  


    


  


          } catch (err) {


  


            setError(err instanceof Error ? err.message : "Erro desconhecido ao exportar");


  


          } finally {


  


            setIsExporting(false);


  


          }


  


        };


  


    


  


        return (


  


          <div className="space-y-6">


  


            <Card>


  


              <CardHeader>


  


                <CardTitle>Filtros de Pesquisa</CardTitle>


  


                <CardDescription>Escolha o tipo de busca e selecione os filtros desejados</CardDescription>


  


              </CardHeader>


  


              <CardContent>


  


                <div className="flex gap-2 mb-6">


  


                  <Button


  


                    type="button"


  


                    variant={searchType === "location" ? "default" : "outline"}


  


                    onClick={() => handleSearchTypeChange("location")}


  


                    className="flex-1"


  


                  >


  


                    <MapPin className="mr-2 h-4 w-4" />


  


                    UF e Cidade


  


                  </Button>


  


                  <Button


  


                    type="button"


  


                    variant={searchType === "polo" ? "default" : "outline"}


  


                    onClick={() => handleSearchTypeChange("polo")}


  


                    className="flex-1"


  


                  >


  


                    <Wheat className="mr-2 h-4 w-4" />


  


                    Polo Agro e Uso


  


                  </Button>


  


                </div>


  


    


  


                <form onSubmit={handleSubmit}>


  


                  {searchType === "location" && (


  


                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">


  


                      <div className="space-y-2">


  


                        <Label htmlFor="uf">UF</Label>


  


                        <Combobox


  


                          options={ufOptions}


  


                          value={selectedUf}


  


                          onSelect={setSelectedUf}


  


                          placeholder="Selecione a UF"


  


                          searchPlaceholder="Buscar UF..."


  


                          emptyPlaceholder="Nenhuma UF encontrada."


  


                          disabled={loadingFilters}


  


                        />


  


                      </div>


  


                      <div className="space-y-2">


  


                        <Label htmlFor="cidade">Cidades</Label>


  


                        <MultiSelectCombobox


  


                          options={cidadeOptions}


  


                          selected={selectedCidades}


  


                          onChange={setSelectedCidades}


  


                          placeholder="Selecione as cidades"


  


                          searchPlaceholder="Buscar cidade..."


  


                          emptyPlaceholder="Nenhuma cidade encontrada."


  


                          disabled={loadingFilters || !selectedUf || loadingCities}


  


                        />


  


                      </div>


  


                      <div className="space-y-2">


  


                        <Label htmlFor="uso-location">Uso</Label>


  


                         <MultiSelectCombobox


  


                          options={usoOptions}


  


                          selected={selectedUsosLocation}


  


                          onChange={setSelectedUsosLocation}


  


                          placeholder="Selecione o(s) uso(s)"


  


                          searchPlaceholder="Buscar uso..."


  


                          emptyPlaceholder="Nenhum uso encontrado."


  


                          disabled={loadingFilters}


  


                        />


  


                      </div>


  


                    </div>


  


                  )}


  


    


  


                  {searchType === "polo" && (


  


                    <div className="grid gap-4 sm:grid-cols-2">


  


                      <div className="space-y-2">


  


                        <Label htmlFor="polo">Polo Agrícola</Label>


  


                        <Combobox


  


                          options={poloOptions}


  


                          value={selectedPolo}


  


                          onSelect={setSelectedPolo}


  


                          placeholder="Selecione o polo"


  


                          searchPlaceholder="Buscar polo..."


  


                          emptyPlaceholder="Nenhum polo encontrado."


  


                          disabled={loadingFilters}


  


                        />


  


                      </div>


  


                      <div className="space-y-2">


  


                        <Label htmlFor="uso">Uso</Label>


  


                                                <MultiSelectCombobox


  


                                                  options={usoOptions}


  


                                                  selected={selectedUsosPolo}


  


                                                  onChange={setSelectedUsosPolo}


  


                                                  placeholder="Selecione o(s) uso(s)"


  


                                                  searchPlaceholder="Buscar uso..."


  


                                                  emptyPlaceholder="Nenhum uso encontrado."


  


                                                  disabled={loadingFilters}


  


                                                />


  


                      </div>


  


                    </div>


  


                  )}


  


    


  


                  <div className="flex gap-3 mt-6">


  


                    <Button type="submit" disabled={isLoading}>


  


                      {isLoading ? (


  


                        <>


  


                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />


  


                          Consultando...


  


                        </>


  


                      ) : (


  


                        <>


  


                          <Search className="mr-2 h-4 w-4" />


  


                          Pesquisar


  


                        </>


  


                      )}


  


                    </Button>


  


                    <Button type="button" variant="outline" onClick={clearFilters}>


  


                      Limpar Filtros


  


                    </Button>


  


                    {hasSearched && !error && results.length > 0 && (


  


                      <Button type="button" variant="outline" onClick={handleExport} disabled={isExporting}>


  


                        {isExporting ? (


  


                          <>


  


                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />


  


                            Exportando...


  


                          </>


  


                        ) : (


  


                          <>


  


                            <Sheet className="mr-2 h-4 w-4" />


  


                            Exportar para Excel


  


                          </>


  


                        )}


  


                      </Button>


  


                    )}


  


                  </div>


  


    


  


                </form>


  


              </CardContent>


  


            </Card>


  


    


  


            {error && (


  


              <Card className="border-destructive">


  


                <CardContent className="pt-6">


  


                  <p className="text-destructive">{error}</p>


  


                </CardContent>


  


              </Card>


  


            )}


  


    


  


            {hasSearched && !error && <ResultsTable results={results} isLoading={isLoading} />}


  


          </div>


  


        )


  


      }