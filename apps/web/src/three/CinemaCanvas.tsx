'use client';

import { Canvas } from '@react-three/fiber';

export function CinemaCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 2, 6], fov: 55 }}
      dpr={[1, 1.5]}
      fallback={<p>Este dispositivo não consegue renderizar a cena 3D.</p>}
    >
      <color attach="background" args={['#10101c']} />
      <ambientLight intensity={0.8} />
      {/* A composição da cena será adicionada após a definição dos requisitos funcionais. */}
    </Canvas>
  );
}
