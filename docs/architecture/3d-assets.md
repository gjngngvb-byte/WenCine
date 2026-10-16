# Política de recursos 3D

- Preferir GLB para modelos de runtime e otimizar polígonos, materiais e texturas.
- Usar LOD e qualidade configurável quando a cena crescer.
- Verificar licença e origem de modelos, sons, fontes e texturas.
- Evitar binários grandes no Git; considerar Git LFS ou storage/CDN conforme os limites.
- Não colocar arquivos de trabalho temporários na pasta de runtime.
- Implementar fallback para dispositivos sem WebGL e limitar DPR em dispositivos móveis.
