# ADR-0001: Monorepo TypeScript com web e servidor separados

- **Status:** arquitetura inicial aceita.
- **Contexto:** o produto combina interface, renderização 3D, APIs, estado em tempo real, voz e persistência.
- **Decisão:** usar pnpm workspaces, Next.js no frontend, Fastify/Socket.IO no backend, Zod para validação, Prisma/PostgreSQL para dados e Redis para coordenação efêmera.
- **Benefícios:** limites claros entre cliente e servidor, contratos compartilhados, testes por domínio e escalabilidade independente.
- **Custos:** mais configuração que um app único e necessidade de manter contratos versionados.
- **Alternativas:** aplicação full-stack única ou serviço realtime separado desde o início. A separação adicional dependerá de requisitos e métricas.
