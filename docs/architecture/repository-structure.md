# Estrutura do repositório

A árvore completa proposta foi apresentada antes da preparação do repositório. A separação principal é:

- `apps/web`: rotas, componentes, features e camada 3D.
- `apps/server`: módulos de domínio, APIs, validação e eventos Socket.IO.
- `packages/shared`: schemas e contratos usados pelos dois lados.
- `packages/database`: esquema Prisma, migrações e cliente PostgreSQL.
- `assets/3d`: modelos, texturas, materiais, animações e áudio.
- `tests/`: testes unitários, integração, contratos, E2E e carga.
- `docs/`: arquitetura, desenvolvimento, operação e decisões técnicas.
- `infra/`: containers e serviços locais.
- `.github/`: CI, segurança e templates de contribuição.

Cada diretório de domínio deverá manter responsabilidade única. Evitar regras críticas de permissão no frontend e tipos duplicados de eventos entre cliente e servidor.
