# Desenvolvimento local

1. Instale Node.js 22 LTS, pnpm 9+ e Docker Compose.
2. Copie `.env.example` para `.env`, usando apenas valores locais.
3. Inicie os serviços: `docker compose -f infra/compose.yaml up -d`.
4. Instale dependências: `pnpm install`.
5. Gere o cliente Prisma: `pnpm db:generate`.
6. Inicie web e API: `pnpm dev`.

Esta é a base arquitetural. As funcionalidades completas serão implementadas depois da revisão do prompt principal.
