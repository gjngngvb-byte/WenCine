# WenCine

Base arquitetural de um cinema virtual 3D multijogador, organizada como monorepo TypeScript.

## Tecnologias planejadas
- Web: Next.js, React, TypeScript, Three.js, React Three Fiber e Drei.
- API/tempo real: Node.js, Fastify e Socket.IO.
- Dados: PostgreSQL, Prisma e Redis.
- Voz: WebRTC por integração com LiveKit ou serviço compatível.
- Qualidade: Vitest, Playwright, ESLint, Prettier e GitHub Actions.

## Requisitos locais
Node.js 22 LTS, pnpm 9+ e Docker Compose.

## Início
1. Copie `.env.example` para `.env` e use valores apenas locais.
2. Execute `pnpm install`.
3. Inicie PostgreSQL e Redis com `docker compose -f infra/compose.yaml up -d`.
4. Execute `pnpm dev`.

Consulte `docs/development/local-setup.md` e `docs/architecture/overview.md`.

Esta etapa cria a estrutura e os contratos iniciais. A implementação das funcionalidades será iniciada após a revisão do prompt funcional completo.
