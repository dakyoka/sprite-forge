"use client";
import { Suspense, useEffect, useLayoutEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface ModelCanvasProps {
  /** GLB の配信 URL */
  url: string;
  autoRotate: boolean;
  wireframe: boolean;
  /** 環境光の強さ */
  ambient: number;
  /** キーとなる平行光源の強さ */
  keyLight: number;
  /** レンダラのトーンマッピング露出 */
  exposure: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

/** トーンマッピング露出をレンダラへ反映する(値が変わるたびに更新)。 */
function ExposureUpdater({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

/** RoomEnvironment を PMREM 化して PBR 反射用の環境マップを設定(CDN 不要・オフライン可)。 */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/**
 * GLB を読み込み、バウンディングボックス中心を原点 XZ に合わせ、
 * 最下端を y=0 に落として「床に立つ」ように配置する。
 * 初回ロード時にカメラと OrbitControls を自動フレーミングし、保存状態を更新する
 * (Reset ボタンはこの保存状態へ戻る)。
 */
function Model({
  url,
  wireframe,
  controlsRef,
}: {
  url: string;
  wireframe: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { scene } = useGLTF(url);
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // XZ 中心を原点へ、最下端を床(y=0)へ
    scene.position.x -= center.x;
    scene.position.z -= center.z;
    scene.position.y -= box.min.y;

    const radius = Math.max(size.x, size.y, size.z) || 1;
    const targetY = size.y / 2;
    const target = new THREE.Vector3(0, targetY, 0);

    camera.position.set(radius * 1.6, targetY + radius * 0.8, radius * 2.2);
    camera.near = radius / 100;
    camera.far = radius * 100;
    camera.updateProjectionMatrix();

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = radius * 0.4;
      controls.maxDistance = radius * 10;
      controls.update();
      controls.saveState();
    }
  }, [scene, camera, controlsRef]);

  // ワイヤーフレームのトグル(全マテリアルを走査して反映)
  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat && "wireframe" in mat) {
          (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    });
  }, [scene, wireframe]);

  return <primitive object={scene} />;
}

/** ロード中インジケータ(Canvas 内 HTML)。 */
function CanvasLoader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
        <p className="text-[9px] text-neutral-400 uppercase tracking-wider whitespace-nowrap">
          3D モデル読み込み中…
        </p>
      </div>
    </Html>
  );
}

export default function ModelCanvas({
  url,
  autoRotate,
  wireframe,
  ambient,
  keyLight,
  exposure,
  controlsRef,
}: ModelCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [3, 2, 4], fov: 45, near: 0.01, far: 1000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#0a0a0a"]} />
      <ExposureUpdater exposure={exposure} />

      <ambientLight intensity={ambient} />
      <directionalLight position={[5, 8, 5]} intensity={keyLight} castShadow />
      <directionalLight position={[-6, 4, -4]} intensity={keyLight * 0.25} />

      <Suspense fallback={null}>
        <StudioEnvironment />
      </Suspense>

      {/* 3D の床グリッド(XZ 平面・遠近に従う) */}
      <Grid
        position={[0, 0, 0]}
        infiniteGrid
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#1f2937"
        sectionSize={2.5}
        sectionThickness={1.1}
        sectionColor="#7c5cff"
        fadeDistance={40}
        fadeStrength={1.5}
        followCamera={false}
      />

      <Suspense fallback={<CanvasLoader />}>
        <Model url={url} wireframe={wireframe} controlsRef={controlsRef} />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={2.0}
      />
    </Canvas>
  );
}
