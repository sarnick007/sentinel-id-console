'use client'

import { Float, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

function VerificationCore({ active }: { active: boolean }) {
  const mesh = useRef<Mesh>(null)
  useFrame((_, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.y += delta * (active ? 0.8 : 0.25)
    mesh.current.rotation.x = Math.sin(performance.now() * 0.0005) * 0.12
  })
  return <Float speed={active ? 2.4 : 1.2} rotationIntensity={0.35} floatIntensity={0.5}><RoundedBox ref={mesh} args={[1.25, 1.25, 0.16]} radius={0.12} smoothness={5}><meshStandardMaterial color={active ? '#c7f36b' : '#8ce7df'} emissive={active ? '#526d20' : '#1c625d'} emissiveIntensity={0.6} metalness={0.55} roughness={0.25} /></RoundedBox></Float>
}

export function VerificationDepth({ active = false }: { active?: boolean }) {
  return <div className="verification-depth" aria-hidden="true"><Canvas camera={{ position: [0, 0, 3.2], fov: 35 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}><ambientLight intensity={0.65} /><pointLight position={[2, 2, 3]} intensity={3} color="#c7f36b" /><pointLight position={[-2, -1, 2]} intensity={2} color="#8ce7df" /><VerificationCore active={active} /><OrbitControls enableZoom={false} enablePan={false} autoRotate={false} /></Canvas></div>
}
