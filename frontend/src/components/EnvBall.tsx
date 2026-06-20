"use client";
import { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { hdriFor, type EnvId } from "./environments";

/**
 * 各環境を一目で判別できるクロム(金属)プレビュー球。
 * metalness=1 / roughness≈0 の球にその環境の HDRI を映り込ませることで、
 * 古典的な「HDRI クロムボール」プレビューになる(平板な単色円より遥かに読みやすい)。
 *
 * 小さなキャンバス + frameloop="demand" で、ロード/PMREM 完了直後の数フレームだけ
 * 描画して以降は静止させ、複数球を並べても負荷を抑える。
 */

/** studio 用の中立リフレクション(RoomEnvironment を PMREM 化)。 */
function StudioBallEnv() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;
    invalidate();
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

/** 環境ロード/反映後しばらく描画を促し、demand モードでも反射が確実に出るようにする。 */
function KickRender() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let n = 0;
    let raf = 0;
    const tick = () => {
      invalidate();
      if (++n < 90) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [invalidate]);
  return null;
}

function ChromeSphere() {
  return (
    <mesh>
      <sphereGeometry args={[1, 48, 48]} />
      <meshStandardMaterial
        color="#ffffff"
        metalness={1}
        roughness={0.04}
        envMapIntensity={1.1}
      />
    </mesh>
  );
}

export default function EnvBall({ envId }: { envId: EnvId }) {
  const hdri = hdriFor(envId);
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 2.5], fov: 32 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        {hdri ? (
          <Environment files={hdri} resolution={128} />
        ) : (
          <StudioBallEnv />
        )}
        <KickRender />
      </Suspense>
      <ChromeSphere />
    </Canvas>
  );
}
