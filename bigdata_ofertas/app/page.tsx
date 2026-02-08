import { QueryForm } from "@/components/query-form"
import { Database } from "lucide-react"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-8">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Bigdata Ofertas</h1>
            <p className="text-muted-foreground">Pesquise por cidade ou Polo Agro</p>
          </div>
        </div>

        <QueryForm />
      </div>
    </main>
  )
}
