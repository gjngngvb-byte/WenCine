# Visão geral da arquitetura

WenCine é um monorepo com aplicações independentes: `apps/web` para interface e 3D; `apps/server` para API e tempo real; `packages/shared` para contratos; `packages/database` para persistência; `assets/3d` para recursos artísticos; `infra` para execução local.

## Limites de confiança
O navegador é um cliente não confiável. O backend decide propriedade da sala, permissões, concessões de itens e estado oficial de reprodução. Socket.IO é transporte, não substituto de autorização ou persistência.

## Estado em tempo real
O servidor deverá manter o estado autoritativo da sala, publicar eventos versionados e fornecer snapshot após reconexão. A reprodução sincronizada deve considerar referência temporal e correção de drift.

## Desempenho 3D
Carregar a cena sob demanda, usar GLB/GLTF otimizados, texturas comprimidas, DPR limitado, carregamento progressivo e modos de qualidade. A interface deve continuar utilizável sem WebGL.

## Voz e vídeo
Voz fica em subsistema WebRTC separado, com tokens temporários autorizados pelo backend. Fontes externas de vídeo precisam de política explícita de incorporação e allowlist.
