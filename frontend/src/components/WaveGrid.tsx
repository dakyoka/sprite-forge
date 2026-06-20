"use client";
import { forwardRef, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * 床グリッド(XZ 平面)を独自シェーダで描画する。Round 2 の drei <Grid> の性質
 * ——半透明・両面描画・地面投影 HDRI の上に重ねて背景が透ける——を踏襲しつつ、
 * 線に「外へ流れる発光波」を足す(原点からの距離に対する sin で、明るいリングが
 * 周期的に外側へ広がる = ワンワンと波が来る)。
 *
 * 波のクレストは HDR 値(>1)まで持ち上げるので、ModelCanvas 側の SelectiveBloom
 * (グリッドだけを選択)で光って見える。HDRI 背景はブルームの選択対象外なので
 * 白飛びしない。
 */

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uCellSize;
  uniform float uSectionSize;
  uniform float uFadeDistance;
  uniform float uFadeStrength;
  uniform vec3  uCellColor;
  uniform vec3  uSectionColor;
  uniform vec3  uWaveColor;
  uniform float uWaveFreq;
  uniform float uWaveSpeed;
  uniform float uWaveBoost;
  uniform float uBaseBright;
  uniform float uBaseAlpha;
  varying vec3 vWorldPos;

  // アンチエイリアス付きグリッド線の被覆率(0..1)。
  float gridLine(vec2 coord, float size) {
    vec2 c = coord / size;
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    float line = min(g.x, g.y);
    return 1.0 - clamp(line, 0.0, 1.0);
  }

  void main() {
    vec2 xz = vWorldPos.xz;
    float cell = gridLine(xz, uCellSize);
    float section = gridLine(xz, uSectionSize);

    float lineMask = max(cell, section);
    if (lineMask <= 0.001) discard;

    // 距離フェード(原点から遠いほど薄く)。
    float d = length(xz);
    float fade = pow(1.0 - clamp(d / uFadeDistance, 0.0, 1.0), uFadeStrength);

    vec3 baseCol = mix(uCellColor, uSectionColor, section);

    // 外へ流れる発光波。sin が周期的なので複数リングが繰り返し外側へ広がる。
    float w = sin(d * uWaveFreq - uTime * uWaveSpeed);
    float band = pow(max(w, 0.0), 3.0); // 山を鋭くしてリング状にする

    // 発光: 基本の線色 + 波のクレストで HDR 値まで持ち上げる。
    vec3 color = baseCol * uBaseBright + uWaveColor * band * uWaveBoost * lineMask;

    // 半透明: 線の被覆 × 距離フェード(クレストでは少し不透明)。
    float alpha = lineMask * fade * (uBaseAlpha + band * 0.35);

    gl_FragColor = vec4(color * fade, clamp(alpha, 0.0, 1.0));
  }
`;

const WaveGrid = forwardRef<THREE.Mesh, { radius: number }>(function WaveGrid({ radius }, ref) {
  const r = radius > 0 ? radius : 1;
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCellSize: { value: 0.5 },
      uSectionSize: { value: 2.5 },
      uFadeDistance: { value: 40 },
      uFadeStrength: { value: 1.5 },
      uCellColor: { value: new THREE.Color("#9ca3af") },
      uSectionColor: { value: new THREE.Color("#7c5cff") },
      uWaveColor: { value: new THREE.Color("#9b7cff") },
      uWaveFreq: { value: 1.2 },
      uWaveSpeed: { value: 1.6 },
      uWaveBoost: { value: 4.0 },
      uBaseBright: { value: 0.6 },
      uBaseAlpha: { value: 0.5 },
    }),
    [],
  );

  // 半径依存パラメータを反映(モデルサイズに対してスケール非依存に保つ)。
  useMemo(() => {
    uniforms.uCellSize.value = r * 0.5;
    uniforms.uSectionSize.value = r * 2.5;
    uniforms.uFadeDistance.value = r * 40;
    uniforms.uWaveFreq.value = 1.2 / r;
  }, [r, uniforms]);

  useFrame((_, delta) => {
    if (matRef.current) {
      (matRef.current.uniforms.uTime.value as number) += delta;
    }
  });

  const planeSize = r * 88; // fadeDistance(r*40)を十分覆う大きさ

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[planeSize, planeSize]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
});

export default WaveGrid;
