# Implantação

Frontend e backend são serviços separados. O frontend pode ser publicado em plataforma compatível com Next.js; o backend precisa de Node persistente com suporte a WebSockets. PostgreSQL e Redis devem ser serviços gerenciados ou operados separadamente.

Antes de produção, configurar secrets no provedor, CORS exato, TLS, migrações, health checks, logs, limites de recursos, backups e política de retenção. As imagens Docker são pontos de partida e precisam ser testadas no provedor escolhido.
