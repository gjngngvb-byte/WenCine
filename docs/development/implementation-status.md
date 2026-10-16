# Status de implementação

## Etapa entregue no código
- [x] Página inicial com criação e entrada em salas.
- [x] Salas públicas e privadas com código de convite.
- [x] Cena 3D inicial com tela, fileiras de assentos, paredes, piso e iluminação.
- [x] Avatares procedurais com cor, acessórios geométricos e algumas expressões.
- [x] Movimentação básica por WASD/setas e controles direcionais móveis.
- [x] Presença, movimento e chat enviados pelo Socket.IO.
- [x] Validação básica de payloads e limitação de frequência do chat.
- [x] Testes unitários do armazenamento em memória das salas.

## Limitações explícitas
As salas e participantes são mantidos em memória no processo Node.js e desaparecem quando o servidor reinicia. Esta etapa é para desenvolvimento, não para publicação pública. Não há autenticação de conta, persistência PostgreSQL, estado distribuído via Redis ou autorização administrativa completa.

## Próximas etapas
1. Validar instalação, lint, tipos, build e testes em CI.
2. Persistir salas e perfis com Prisma/PostgreSQL e migrar sessões para autenticação real.
3. Adicionar colisões físicas, câmera e movimentação contínua refinadas, sentar/levantar e otimizações móveis.
4. Integrar fontes de vídeo e estado de reprodução autoritativo.
5. Implementar convites e animações de dupla com consentimento.
6. Implementar emotes, voz WebRTC e controles de privacidade.
7. Construir inventário, catálogo, permissões temporárias de sala e acesso gratuito do dono a itens exclusivos.
8. Adicionar NPCs, decoração, testes de carga e operação de produção.
