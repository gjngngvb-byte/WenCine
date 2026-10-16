# Tempo real

Socket.IO é transporte, não fonte de autorização. Cada evento deve validar payload, derivar identidade da sessão, autorizar a ação, aplicar limites e emitir apenas estado permitido. O estado autoritativo fica no servidor.
