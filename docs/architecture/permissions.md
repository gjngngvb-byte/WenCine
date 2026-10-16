# Modelo de permissões

O papel OWNER deve corresponder ao proprietário persistido da sala. Moderadores e membros só podem receber papéis por operações autorizadas do backend.

Ações administrativas validam sessão, participação atual, papel e alvo. Conceder item exige verificar permissão, existência do item e participação do destinatário, registrando a concessão no banco. Ocultar botões no frontend é apenas UX; a autorização real sempre ocorre no servidor.
