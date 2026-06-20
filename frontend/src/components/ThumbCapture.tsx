"use client";
import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** GLB ロード失敗(404・破損)でも履歴ペインを巻き込まないためのバウンダリ。 */
class CaptureErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * GLB を一度だけオフスクリーンで「正面」からレンダリングし、PNG(dataURL)に
 * キャプチャするコンポーネント。履歴サムネイルを多数のライブキャンバスではなく
 * 静止画像にするため(パフォーマンス改善 + 一目で建物の正面が分かる)。
 *
 * 親(HistoryPane)が 1 件ずつ順番にマウントし、onDone でキャッシュへ保存する。
 */
const CAP = 256; // キャプチャ解像度(正方形)

function CaptureScene({ url, onCapture }: { url: string; onCapture: (dataUrl: string | null) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { scene: gltf } = useGLTF(url);
  // メインビューアと同じ gltf を再ペアレントしないようクローンを使う。
  const model = useMemo(() => gltf.clone(true), [gltf]);

  useEffect(() => {
    // 両面描画(裏面カリングによる見かけの穴を防ぐ)。
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mt of mats) if (mt) (mt as THREE.Material).side = THREE.DoubleSide;
    });

    // 中心を原点へ、最下端を y=0 へ。正面(+Z)からやや見下ろすアングルで框める。
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const r = Math.max(size.x, size.y, size.z) || 1;
    const cy = size.y / 2;
    camera.position.set(0, cy + r * 0.22, r * 2.35);
    camera.near = r / 100;
    camera.far = r * 100;
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();

    // 中立 IBL(RoomEnvironment)できれいな PBR にする。
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;

    // 数フレーム描画してから drawing buffer をキャプチャする。
    let raf = 0;
    let n = 0;
    const tick = () => {
      gl.render(scene, camera);
      if (++n >= 4) {
        let data: string | null = null;
        try {
          data = gl.domElement.toDataURL("image/png");
        } catch {
          data = null;
        }
        onCapture(data);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [model, gl, scene, camera, onCapture]);

  return <primitive object={model} />;
}

export default function ThumbCapture({
  jobId,
  url,
  onDone,
}: {
  jobId: string;
  url: string;
  onDone: (jobId: string, dataUrl: string | null) => void;
}) {
  return (
    <div
      aria-hidden
      style={{ position: "fixed", left: -99999, top: -99999, width: CAP, height: CAP, pointerEvents: "none", opacity: 0 }}
    >
      <CaptureErrorBoundary onError={() => onDone(jobId, null)}>
        <Canvas
          frameloop="never"
          dpr={1}
          camera={{ position: [0, 0, 3], fov: 35 }}
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
          style={{ width: CAP, height: CAP }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 4]} intensity={2.2} />
          <directionalLight position={[-4, 2, -3]} intensity={0.6} />
          <Suspense fallback={null}>
            <CaptureScene url={url} onCapture={(d) => onDone(jobId, d)} />
          </Suspense>
        </Canvas>
      </CaptureErrorBoundary>
    </div>
  );
}
