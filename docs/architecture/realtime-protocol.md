# Protocolo de tempo real

- Validar cada payload com esquemas compartilhados.
- Derivar a identidade da sessão autenticada, nunca de um campo livre do cliente.
- Autorizar entrada e saída de salas no servidor.
- Limitar frequência, tamanho de mensagens e quantidade de eventos.
- Usar IDs de evento/versões de estado quando necessários para idempotência e ordenação.
- Enviar snapshot confiável após reconexão.
- Nunca transmitir tokens, cookies, senhas ou dados sensíveis nos eventos.
- Separar eventos efêmeros de dados persistentes.
- Sincronização de vídeo deve considerar referência temporal e correção de drift.
