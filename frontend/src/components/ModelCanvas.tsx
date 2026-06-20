"use client";
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { EffectComposer, SelectiveBloom, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { hdriFor, type EnvId } from "./environments";
import WaveGrid from "./WaveGrid";

export interface ModelCanvasProps {
  /** GLB の配信 URL */
  url: string;
  autoRotate: boolean;
  wireframe: boolean;
  /** 環境光 = IBL(環境マップ)の強さ。scene.environmentIntensity に連動。 */
  ambient: number;
  /** キーとなる平行光源の強さ */
  keyLight: number;
  /** レンダラのトーンマッピング露出 */
  exposure: number;
  /** 選択中の環境(IBL/背景) */
  envId: EnvId;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

/**
 * トーンマッピング露出をレンダラへ反映する。トーンマッピング自体は
 * EffectComposer の <ToneMapping>(ACES)が行うため、レンダラ側は NoToneMapping
 * にして二重適用を防ぎ、露出値(toneMappingExposure)だけ反映する。
 * ACES の GLSL は toneMappingExposure を乗算するので、露出スライダーは引き続き効く。
 */
function ExposureUpdater({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

/**
 * 中立スタジオ環境。RoomEnvironment を PMREM 化して色被りのない IBL を作る
 * (CDN 不要・オフライン可)。背景はダーク(#0a0a0a)のままにしてグリッドを活かす。
 * `intensity` で scene.environmentIntensity を制御し、環境光スライダーに反応させる。
 */
function StudioEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;
    const prevBg = scene.background;
    scene.background = new THREE.Color("#0a0a0a");
    return () => {
      scene.environment = null;
      scene.background = prevBg;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);
  return null;
}

/**
 * HDRI 環境を地面投影(ground projection)付きで適用する。
 * equirect をそのまま無限遠の球に貼ると、HDRI の地面/地平線がデバッグ
 * グリッド(y=0 平面)と食い違って「地面がめり込む」ように見える。drei の
 * `ground` を使うと HDRI 下半球が y=0 付近の連続した地面として投影され、
 * モデルがその上に立っているように見える(グリッドは非表示にする)。
 *
 * ground の各パラメータはモデル外接半径 `radius` に比例させる。TRELLIS 出力は
 * おおむね 1 ユニット規模だが、将来サイズが変わっても破綻しないよう相対値にする。
 * `scale`(投影ドーム半径)はカメラ far(=radius*100, Model 側で設定)未満に保つ。
 */
function HdriEnvironment({ files, intensity, radius }: { files: string; intensity: number; radius: number }) {
  const r = radius > 0 ? radius : 1;
  return (
    <Environment
      files={files}
      environmentIntensity={intensity}
      ground={{ height: r * 3, radius: r * 24, scale: r * 50 }}
    />
  );
}

/**
 * GLB を読み込み、バウンディングボックス中心を原点 XZ に合わせ、
 * 最下端を y=0 に落として「床に立つ」ように配置する。
 * 初回ロード時にカメラと OrbitControls を自動フレーミングし、保存状態を更新する
 * (Reset ボタンはこの保存状態へ戻る)。外接半径を `onRadius` で親へ通知し、
 * HDRI の地面投影スケールに使う。
 */
function Model({
  url,
  wireframe,
  controlsRef,
  onRadius,
}: {
  url: string;
  wireframe: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onRadius: (r: number) => void;
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

    onRadius(radius);
  }, [scene, camera, controlsRef, onRadius]);

  // マテリアル設定: ワイヤーフレームのトグル + 両面描画。
  // TRELLIS 出力は単一シェルのサーフェスで、既定の FrontSide だと裏向きの面が
  // カリングされて「穴が開いている/破れている」ように見える。DoubleSide にすると
  // 内側からも面が描画され、見かけ上の穴の大半が解消する(実ジオメトリの穴とは別問題)。
  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (!mat) continue;
        const m = mat as THREE.Material & { wireframe?: boolean };
        m.side = THREE.DoubleSide;
        if ("wireframe" in m) m.wireframe = wireframe;
        m.needsUpdate = true;
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
  envId,
  controlsRef,
}: ModelCanvasProps) {
  const hdri = hdriFor(envId);
  const isStudio = envId === "studio" || !hdri;
  const [modelRadius, setModelRadius] = useState(1);
  const gridRef = useRef<THREE.Mesh>(null);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [3, 2, 4], fov: 45, near: 0.01, far: 1000 }}
      gl={{ antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <ExposureUpdater exposure={exposure} />

      {/* 直接光。IBL(環境マップ)の強さは環境光スライダーで下げられるので、
          キーライトを動かすと反射ハイライトと陰影に確実に効く。 */}
      <ambientLight intensity={ambient * 0.35} />
      <directionalLight position={[5, 8, 5]} intensity={keyLight} castShadow />
      <directionalLight position={[-6, 4, -4]} intensity={keyLight * 0.25} />

      {/* 環境(IBL/背景)。studio は中立グレー+ダーク背景+グリッド、それ以外は
          HDRI を地面投影付きで「その環境の中」に置く(グリッドは非表示)。
          environmentIntensity は環境光スライダー(ambient)に連動させる。 */}
      <Suspense fallback={null}>
        {isStudio ? (
          <StudioEnvironment intensity={ambient} />
        ) : (
          <HdriEnvironment files={hdri!} intensity={ambient} radius={modelRadius} />
        )}
      </Suspense>

      {/* 床グリッド(XZ 平面)。Round 2 の性質(半透明・両面・地面投影 HDRI の上に
          重ねて透ける)を保ちつつ、独自シェーダで「外へ流れる発光波」を足す。
          波のクレストは HDR 値なので、下の SelectiveBloom(このグリッドだけを選択)で
          光って見える。 */}
      <WaveGrid ref={gridRef} radius={modelRadius} />

      <Suspense fallback={<CanvasLoader />}>
        <Model url={url} wireframe={wireframe} controlsRef={controlsRef} onRadius={setModelRadius} />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={2.0}
        // 左ドラッグ=回転、中ボタン/右ボタンのドラッグ=パン。
        // (中ボタンを押すだけでは何も起きず、ドラッグして初めてパンする = OrbitControls の標準挙動)
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />

      {/* グリッドの発光波だけを選択的にブルームさせる。HDRI 背景は選択対象外なので
          白飛びしない。トーンマッピング(ACES)はここで行う(EffectComposer は
          レンダラ側のトーンマッピングを無効化するため、最後に必ず適用する)。 */}
      <EffectComposer>
        <SelectiveBloom
          selection={gridRef as unknown as RefObject<THREE.Object3D>}
          ignoreBackground
          luminanceThreshold={1.0}
          luminanceSmoothing={0.2}
          intensity={1.5}
          radius={0.7}
          mipmapBlur
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
