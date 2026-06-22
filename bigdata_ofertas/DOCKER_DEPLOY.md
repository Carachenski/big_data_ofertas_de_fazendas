# Deploy via Docker — guia passo a passo

Este guia cobre como subir a aplicação `bigdata_ofertas` (Next.js) em um container Docker para
acesso pelos colegas na mesma rede local, conectando a um banco PostgreSQL que **fica fora do
Docker** (em outra máquina ou na própria máquina host).

> Escrito para ser seguido por uma IA/agente ou por uma pessoa, sem precisar de contexto adicional
> da conversa onde isso foi decidido. Siga a ordem das seções.

---

## 0. Arquitetura (o que sobe onde)

- **Container Docker** → só a aplicação Next.js (`app`, porta 3000).
- **PostgreSQL** → **NÃO entra no Docker**. Continua rodando direto no SO, na máquina onde já
  está hoje (local ou em outra máquina da rede). O container só se conecta nele via rede.
- Os colegas acessam via `http://<IP_DA_MAQUINA_QUE_RODA_O_CONTAINER>:3000`.

---

## 1. Pré-requisitos

- Docker Desktop (ou Docker Engine + Docker Compose) instalado na máquina que vai rodar o
  container.
- PostgreSQL já rodando e acessível pela rede, com os dados de `bigdata_ofertas` carregados
  (ver seção 2 para garantir que o schema de apoio também está lá).
- Saber o **IP da máquina do banco** (ex.: `192.168.0.50`) e a **porta** do Postgres (neste
  projeto, **5433**, não a porta padrão 5432).

---

## 2. Banco de dados — checklist OBRIGATÓRIO antes de subir o container

A aplicação depende de mais do que só a tabela `bigdata_ofertas`. Sem os itens abaixo, ou a
aplicação não funciona (erro de "function does not exist" / "relation does not exist"), ou
funciona mas fica **lenta** (~5s por busca de polo em vez de ~350-450ms).

### 2.1 Tabelas necessárias
Confirme que TODAS existem no banco de destino:
```sql
SELECT count(*) FROM bigdata_ofertas;   -- ofertas raspadas
SELECT count(*) FROM reserva_legal;     -- cidade + geocódigo IBGE + ligação com polo
SELECT count(*) FROM polo_agro;         -- nome dos polos agrícolas
SELECT count(*) FROM polo_agro_municipio; -- ligação polo <-> município (geocódigo)
SELECT count(*) FROM car_compilado;     -- CAR (Cadastro Ambiental Rural) nacional
```
Se alguma estiver faltando ou vazia, restaure o dump correspondente (`pg_dump`/`psql -f`) antes
de continuar.

### 2.2 Extensão, função e índices de performance (⭐ o item que mais é esquecido)
A busca por polo usa `unaccent()` para casar nome de cidade sem acento. `unaccent()` nativo do
Postgres é **STABLE, não IMMUTABLE** — não pode ser usado direto em índice. Por isso existe um
wrapper IMMUTABLE (`immutable_unaccent`) e 3 índices funcionais construídos em cima dele. **Sem
isso, todas as 4 queries da tela `/analise` fazem varredura completa de `bigdata_ofertas`
recalculando unaccent linha a linha — o carregamento da tela vai de ~350-450ms pra ~5 segundos.**

**Verifique se já existem:**
```sql
SELECT extname FROM pg_extension WHERE extname = 'unaccent';
SELECT proname FROM pg_proc WHERE proname = 'immutable_unaccent';
SELECT indexname FROM pg_indexes
WHERE tablename IN ('bigdata_ofertas', 'reserva_legal', 'car_compilado');
```
Espera-se: a extensão `unaccent`, a função `immutable_unaccent`, e os índices
`idx_bigdata_ofertas_uf_municipio`, `idx_reserva_legal_uf_cidade`, `idx_car_compilado_geocodigo`.

**Se QUALQUER um desses não aparecer**, rode a migration (idempotente — pode rodar de novo sem
medo, mesmo se parte já existir):
```bash
psql -h <HOST_DO_BANCO> -p 5433 -U postgres -d postgres \
  -f bigdata_ofertas/db/migrations/001_indices_performance_polo.sql
```
(O arquivo está em `bigdata_ofertas/db/migrations/001_indices_performance_polo.sql` neste
repositório — não precisa recriar o conteúdo manualmente, só apontar pro arquivo.)

**Depois de rodar, confirme a query principal funciona e está rápida:**
```sql
\timing on
SELECT count(*)
FROM bigdata_ofertas b
LEFT JOIN reserva_legal r
       ON upper(immutable_unaccent(r.cidade)) = upper(immutable_unaccent(b.municipio))
      AND r.uf = b.uf
LEFT JOIN polo_agro_municipio pam ON pam.municipio_id = r.geocodigo
LEFT JOIN polo_agro pa ON pa.id_agrovalora = pam.polo_agro_id
WHERE pa.nome = 'Feira de Santana-BA';
```
Deve rodar em frações de segundo (não segundos). Se vier o erro `função immutable_unaccent(text)
não existe`, a migration não rodou de fato — repita o passo anterior.

---

## 3. Configurar a conexão do container com o banco

Dentro do container, **`localhost` aponta para o próprio container, não para a máquina do banco**.
Por isso a conexão é configurada via arquivo de ambiente separado do `.env.local` usado em
desenvolvimento local.

```bash
cd bigdata_ofertas
cp .env.docker.example .env.docker
```

Edite `.env.docker` e troque `DB_HOST` pelo IP real da máquina do banco (as outras variáveis —
usuário, senha, porta, nome do banco — são as mesmas em ambas as máquinas, conforme decidido pelo
usuário):
```env
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=192.168.0.50   # <- IP real da máquina do banco, NUNCA localhost
DB_PORT=5433
```

`.env.docker` está no `.gitignore` (contém credencial) — não comitar esse arquivo, só o
`.env.docker.example` (template sem dado sensível).

---

## 4. Build e subida do container

```bash
cd bigdata_ofertas
docker compose up --build -d
```

O que isso faz (definido em `Dockerfile` + `docker-compose.yml`):
- Build multi-estágio: instala dependências (`npm ci`), builda (`npm run build`, gera
  `.next/standalone`), e a imagem final só leva o output standalone + `node_modules` mínimo
  (mais leve que copiar o projeto inteiro).
- Sobe só o serviço `app` (Next.js), escutando em `0.0.0.0:3000` dentro do container.
- `docker-compose.yml` mapeia a porta do host para o container: `3000:3000`.
- As variáveis de `.env.docker` são injetadas no container em tempo de execução (não ficam
  "assadas" na imagem) via `env_file`.

**Acompanhar logs / confirmar que subiu sem erro:**
```bash
docker compose logs -f app
```
Procure por uma linha do tipo `✓ Ready in <N>ms`. Se aparecer erro de conexão com o banco
(`ECONNREFUSED`, `timeout`), revise a seção 5 (rede/firewall) e a seção 3 (`DB_HOST` certo).

---

## 5. Liberar acesso pela rede local (para os colegas)

1. Descubra o IP da máquina que está rodando o container (Windows: `ipconfig`, procure
   "Endereço IPv4" do adaptador de rede em uso).
2. Garanta que a porta 3000 está liberada no firewall dessa máquina:
   - Windows: Painel de Controle → Firewall do Windows Defender → Configurações avançadas →
     Regra de Entrada → Nova Regra → Porta → TCP 3000 → Permitir.
3. Os colegas acessam via `http://<IP_DA_MAQUINA>:3000` (mesma rede/Wi-Fi/LAN).
4. Importante: o **banco** também precisa aceitar conexão vindas do IP da máquina do container
   (não só do `localhost` dele mesmo) — no Postgres da máquina do banco, verifique
   `postgresql.conf` (`listen_addresses = '*'` ou o IP específico) e `pg_hba.conf` (uma linha
   `host all all <subnet_da_rede>/24 md5` ou equivalente). Sem isso, o container nem chega a
   conectar no banco, mesmo com `DB_HOST` certo.

---

## 6. Testes de fumaça (smoke test) depois de subir

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/             # esperado: 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/analise      # esperado: 200
curl -s http://localhost:3000/api/filters                                  # esperado: JSON com ufs/usos/polos
```
Depois, abra `http://localhost:3000/analise` no navegador, selecione um polo qualquer e confirme
que a tabela/gráficos aparecem em menos de 1 segundo (se demorar ~5s, volte na seção 2.2 — os
índices não foram aplicados nesse banco).

---

## 7. Atualizar a aplicação depois de uma mudança de código

```bash
git pull
docker compose up --build -d   # rebuilda só o que mudou e reinicia o container
```

## 8. Parar / remover o container

```bash
docker compose down
```
(isso NÃO afeta o banco de dados — ele roda fora do Docker, continua intacto.)

---

## 9. Erros já vistos e como resolver

| Sintoma | Causa | Solução |
|---|---|---|
| Build falha com `Cannot find name 'ResultsTableProps'` | Bug de TypeScript já corrigido no repo atual | `git pull` pra garantir que está na versão com o fix |
| `.next/standalone/server.js` não existe (só uma subpasta) | Lockfile perdido em pasta pai confunde a raiz do projeto que o Next infere | Já corrigido via `turbopack.root` no `next.config.mjs`; se acontecer de novo, procure por `package-lock.json`/`pnpm-lock.yaml` soltos em pastas acima do projeto e remova |
| Tela `/analise` demora ~5s pra carregar | Índices/função de performance não existem nesse banco | Seção 2.2 — rodar `001_indices_performance_polo.sql` |
| Erro `relation "reserva_legal" does not exist` (ou `polo_agro`, `car_compilado`) | Dump restaurado foi só de `bigdata_ofertas`, faltam as outras tabelas | Seção 2.1 — restaurar as tabelas de apoio também |
| Polo com nome acentuado (ex.: "Lagoa da Confusão") não retorna nada | Bug de encoding duplicado em `polo_agro.nome` — já corrigido no código (rotas revertem o encoding antes de comparar) | `git pull` pra garantir versão atual; não é um problema de dado, é tratado em código |
| Container sobe mas não conecta no banco | Firewall ou `pg_hba.conf`/`listen_addresses` bloqueando a conexão de outra máquina | Seção 5, item 4 |
