// /components/three/model-viewer.tsx

'use client';

import { Suspense, useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Center, Environment, Html } from '@react-three/drei';
import { Leva, useControls, folder, button } from 'leva';
import { Loader2, AlertTriangle, Download, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as THREE from 'three';

// --- Type Definitions ---
interface ModelViewerProps {
  modelUrl: string;
  className?: string;
  enableDownload?: boolean;
  onDownload?: () => void;
}

// --- UI Components ---
const LoadingSpinner = () => (
  <Html center>
    <div className="flex flex-col items-center justify-center gap-4 bg-white/10 dark:bg-black/20 backdrop-blur-md p-8 rounded-xl shadow-2xl border border-white/20 dark:border-black/30">
      <Loader2 className="h-12 w-12 animate-spin text-sky-400" />
      <p className="text-base font-medium text-slate-800 dark:text-slate-200">Loading 3D Model...</p>
    </div>
  </Html>
);

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-red-500/10">
    <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
    <h3 className="font-semibold text-red-600 dark:text-red-400">Failed to Load Model</h3>
    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-xs">{error.message}</p>
  </div>
);

// --- Core Model Rendering Logic ---
const Model = memo(({ url, onResetView }: { url:string; onResetView: () => void; }) => {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null!);
  const originalMaterialsRef = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());

  // Leva controls for interactivity
  const { autoRotate, rotationSpeed, wireframe, clipping, clipAxis, clipPosition } = useControls('Model Controls', {
    'Scene': folder({
      autoRotate: { value: false, label: 'Auto Rotate' },
      rotationSpeed: { value: 0.5, min: 0.1, max: 5, step: 0.1, label: 'Speed', render: (get) => get('Model Controls.autoRotate') },
    }),
    'Appearance': folder({
      wireframe: { value: false, label: 'Wireframe' },
    }),
    'Clipping': folder({
      clipping: { value: false, label: 'Enable' },
      clipAxis: { value: 'X', options: ['X', 'Y', 'Z'], label: 'Axis', render: (get) => get('Model Controls.clipping') },
      clipPosition: { value: 0, min: -10, max: 10, step: 0.01, label: 'Position', render: (get) => get('Model Controls.clipping') },
    }),
    'Actions': folder({
      resetView: button(() => onResetView()),
    })
  });

  const clippingPlanes = useMemo(() => {
    const vec = new THREE.Vector3();
    if (clipAxis === 'X') vec.set(1, 0, 0);
    else if (clipAxis === 'Y') vec.set(0, 1, 0);
    else vec.set(0, 0, 1);
    return [new THREE.Plane(vec, -clipPosition)];
  }, [clipAxis, clipPosition]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!originalMaterialsRef.current.has(child.uuid)) {
          originalMaterialsRef.current.set(child.uuid, child.material);
        }
        child.castShadow = true;
        child.receiveShadow = true;
        
        const planes = clipping ? clippingPlanes : null;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat => {
          mat.clippingPlanes = planes;
          mat.clipIntersection = false;
          mat.needsUpdate = true;
        });
        
        if (wireframe) {
          if (!child.userData.wireframeMaterial) {
            child.userData.wireframeMaterial = new THREE.MeshBasicMaterial({ color: 'deepskyblue', wireframe: true });
          }
          child.material = child.userData.wireframeMaterial;
        } else {
          const originalMat = originalMaterialsRef.current.get(child.uuid);
          if (originalMat) child.material = originalMat;
        }
      }
    });
  }, [scene, wireframe, clipping, clippingPlanes]);

  useFrame((_, delta) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += delta * rotationSpeed * 0.25;
    }
  });

  return (
    <Center>
      <group ref={groupRef}>
        <primitive object={scene} />
      </group>
    </Center>
  );
});
Model.displayName = 'Model';

// --- Main Viewer Component ---
const ModelViewer = ({ modelUrl, className = "", enableDownload = false, onDownload }: ModelViewerProps) => {
  const [error, setError] = useState<Error | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null!);
  const controlsRef = useRef<any>(null!);

  const handleError = useCallback((error: unknown) => {
    console.error("Canvas Error:", error);
    setError(error instanceof Error ? error : new Error('An unknown error occurred'));
  }, []);

  const handleResetView = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full h-full ${className} ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950' : 'bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden'}`}
    >
      <div className="relative w-full h-full">
        {error ? (
          <ErrorFallback error={error} />
        ) : (
          <Canvas
            // ✅ THE DEFINITIVE FIX: Adding a `key` prop forces React to
            // completely unmount the old Canvas and mount a new one when the modelUrl
            // changes. This guarantees a clean WebGL state and prevents "Context Lost" errors.
            key={modelUrl}
            shadows
            camera={{ position: [0, 2, 10], fov: 50 }}
            gl={{ 
              antialias: true,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              localClippingEnabled: true 
            }}
            dpr={[1, 2]}
            onError={handleError}
          >
            <hemisphereLight intensity={0.2} color="#ffffff" groundColor="#444444" />
            <ambientLight intensity={0.3} />
            <directionalLight
              position={[5, 10, 7]}
              intensity={1.2}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-far={50}
            />
            <directionalLight position={[-5, -5, -5]} intensity={0.2} />
            <Environment preset="city" />

            <Suspense fallback={<LoadingSpinner />}>
              <Model url={modelUrl} onResetView={handleResetView} />
            </Suspense>

            <OrbitControls 
              ref={controlsRef}
              makeDefault 
              minDistance={0.5} 
              maxDistance={50}
              enableDamping
              dampingFactor={0.05}
            />
          </Canvas>
        )}
      </div>

      <div className="absolute top-3 right-3 flex gap-2 z-10">
        {enableDownload && onDownload && (
          <Button onClick={onDownload} size="icon" variant="ghost" className="h-8 w-8 text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20" title="Download model">
            <Download className="h-4 w-4" />
          </Button>
        )}
        <Button onClick={toggleFullscreen} size="icon" variant="ghost" className="h-8 w-8 text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20" title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      <div className="absolute bottom-3 left-3 z-10">
        <Leva 
          fill 
          flat 
          titleBar={false}
          oneLineLabels
          hideCopyButton
          theme={{
            colors: {
              elevation1: 'rgba(0, 0, 0, 0.5)',
              elevation2: 'hsl(222.2 84% 4.9%)',
              elevation3: 'hsl(217.2 32.6% 17.5%)',
              accent1: 'hsl(210 40% 96.1%)',
              highlight1: 'hsl(210 40% 98%)',
              highlight2: 'hsl(217.2 32.6% 17.5%)',
              highlight3: 'hsl(215 20.2% 65.1%)',
              folderWidgetColor: 'hsl(210 40% 98%)',
              folderTextColor: 'hsl(210 40% 98%)'
            },
            space: { rowGap: '6px' },
            sizes: { rootWidth: '280px' },
            fontSizes: { root: '12px' },
            radii: { sm: '8px' }
          }}
        />
      </div>
    </div>
  );
};

export default ModelViewer;

export function preloadModel(url: string) {
  useGLTF.preload(url);
}