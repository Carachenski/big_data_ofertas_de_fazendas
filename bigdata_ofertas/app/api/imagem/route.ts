import { type NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Serve as imagens das páginas das ofertas (prints salvos para quando o anúncio sai do ar).
//
// bigdata_ofertas.pagina_imagem guarda o caminho relativo "ofertas_paginas/<site>/<xx>/<arquivo>.webp".
// A pasta ofertas_paginas fica fora do projeto e é montada no container (ver docker-compose.yml);
// OFERTAS_PAGINAS_DIR aponta para ela.
//
//   GET /api/imagem?path=ofertas_paginas/imovelweb/07/3004836207.webp             -> exibe
//   GET /api/imagem?path=ofertas_paginas/imovelweb/07/3004836207.webp&download=1  -> baixa

const PREFIXO = "ofertas_paginas/";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(request: NextRequest) {
  const raiz = process.env.OFERTAS_PAGINAS_DIR;
  if (!raiz) {
    return NextResponse.json(
      { error: "OFERTAS_PAGINAS_DIR não configurado no servidor" },
      { status: 500 }
    );
  }

  const caminho = (request.nextUrl.searchParams.get("path") || "").replace(/\\/g, "/");
  const download = request.nextUrl.searchParams.get("download") === "1";

  if (!caminho.startsWith(PREFIXO)) {
    return NextResponse.json({ error: "Caminho de imagem inválido" }, { status: 400 });
  }

  const extensao = path.extname(caminho).toLowerCase();
  const contentType = CONTENT_TYPES[extensao];
  if (!contentType) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 400 });
  }

  // Resolve dentro da raiz e recusa qualquer caminho que escape dela (ex.: "../")
  const raizResolvida = path.resolve(raiz);
  const arquivo = path.resolve(raizResolvida, caminho.slice(PREFIXO.length));
  if (!arquivo.startsWith(raizResolvida + path.sep)) {
    return NextResponse.json({ error: "Caminho de imagem inválido" }, { status: 400 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await readFile(arquivo);
  } catch {
    return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });
  }

  // Nome do arquivo baixado: <site>_<arquivo original>, ex.: imovelweb_3004836207.webp
  const partes = caminho.split("/");
  const nomeDownload = `${partes[1]}_${partes[partes.length - 1]}`.replace(/[^\w.-]/g, "_");

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(conteudo.length),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${nomeDownload}"`,
    },
  });
}
