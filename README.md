# WenCine

Cinema virtual 3D multijogador, desenvolvido como monorepo TypeScript.

## Tecnologias
- Web: Next.js, React, TypeScript, Three.js, React Three Fiber e Drei.
- API e tempo real: Node.js, Fastify e Socket.IO.
- Dados planejados: PostgreSQL, Prisma e Redis.
- Qualidade: Vitest, Playwright, ESLint, Prettier e GitHub Actions.

## Primeira etapa funcional
- Criar salas públicas e privadas.
- Entrar por código de sala/convite.
- Ambiente de cinema 3D com tela, assentos, paredes e iluminação.
- Avatares 3D com movimentação por WASD/setas e controles móveis.
- Sincronização de presença e posição via Socket.IO.
- Chat em tempo real com limite básico de mensagens.
- Personalização inicial de cor, acessórios 3D básicos e algumas expressões.

## Executar localmente
1. Instale Node.js 22 LTS, pnpm 9+ e Docker.
2. Copie `.env.example` para `.env` e ajuste os valores locais.
3. Execute `docker compose -f infra/compose.yaml up -d`.
4. Execute `pnpm install`.
5. Execute `pnpm dev`.

Frontend: http://localhost:3000  
API/health: http://localhost:4000/health

## Limitações conhecidas nesta etapa
- Salas, participantes e mensagens residem na memória do processo. Reiniciar o backend apaga as salas. Ainda não é adequado para produção nem múltiplas instâncias.
- Ainda não há autenticação de conta, persistência de inventário, permissões administrativas completas ou pagamento.
- A cena 3D ainda usa modelos geométricos gerados por código, sem pacote final de modelos/rigs de animação.
- Player de vídeo sincronizado, WebRTC/voz, emotes e interações em dupla, NPCs e sistema de concessões de itens ainda estão pendentes.
- O limite configurável de participantes não é uma garantia de desempenho; precisa de teste de carga.
- A sessão usa um token de participante temporário no armazenamento da aba. Não é um sistema completo de autenticação.

## Segurança e operação
Não use esta versão como serviço público de produção antes de implementar autenticação real, persistência, autorização por ação, validação de entrada privada, observabilidade, migrações, testes e proteção operacional. Não coloque segredos reais no repositório.
