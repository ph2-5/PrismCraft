/**
 * Task 2A.21: Blockout3DCanvas — R3F 3D 渲染画布
 *
 * 使用 @react-three/fiber 在 React 中渲染 Three.js Scene。
 * 接收 BlockoutScene 数据，构建并渲染场景对象。
 *
 * 功能：
 * - 渲染地面、道具、人偶、灯光
 * - 支持轨道相机控制（OrbitControls）
 * - 当 cameraPath 存在时，按当前时间播放相机轨迹
 * - WebGL 不可用时显示降级文案
 */

import { Suspense, useMemo, useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";
import type {
  BlockoutScene,
  GroundPlane,
  PrimitiveShape,
  LightingPreset,
} from "../domain/scene-schema";
import type { Mannequin } from "../domain/mannequin-types";
import { POSE_PRESETS } from "../domain/mannequin-types";
import { getMannequinGeometry } from "../services/mannequin-service";
import { getCameraPoseAtTime, type CameraPose } from "../services/camera-animator";
import { isWebGLAvailable } from "../services/render-service";

// ─── 公共类型 ─────────────────────────────────────────────────────────────────

export interface Blockout3DCanvasProps {
  /** BlockoutScene 数据 */
  scene: BlockoutScene;
  /** 是否启用轨道相机控制（默认 true） */
  enableOrbitControls?: boolean;
  /** 当前播放时间（秒，0-duration），用于相机轨迹回放 */
  playbackTime?: number;
  /** 是否自动播放相机轨迹（默认 false） */
  autoPlay?: boolean;
  /** 画布宽度（不指定时填充父容器） */
  width?: number | string;
  /** 画布高度 */
  height?: number | string;
  /** 选中的人偶 ID（高亮显示） */
  selectedMannequinId?: string;
  /** 选中道具 ID（高亮显示） */
  selectedPropId?: string;
  /** 点击人偶回调 */
  onMannequinClick?: (id: string) => void;
  /** 点击道具回调 */
  onPropClick?: (id: string) => void;
  /** WebGL 不可用时的降级文案 */
  fallbackMessage?: string;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function Blockout3DCanvas({
  scene,
  enableOrbitControls = true,
  playbackTime,
  autoPlay = false,
  width = "100%",
  height = "100%",
  selectedMannequinId,
  selectedPropId,
  onMannequinClick,
  onPropClick,
  fallbackMessage = "WebGL 不可用，无法显示 3D 白模",
}: Blockout3DCanvasProps) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setWebglAvailable(isWebGLAvailable());
  }, []);

  if (webglAvailable === false) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--muted, #f5f5f5)",
          color: "var(--muted-fg, #888)",
          fontSize: 12,
          textAlign: "center",
          padding: 20,
        }}
      >
        {fallbackMessage}
      </div>
    );
  }

  if (webglAvailable === null) {
    return <div style={{ width, height }} />;
  }

  return (
    <div style={{ width, height, position: "relative" }}>
      <Canvas
        camera={{
          fov: scene.camera.fov,
          position: [scene.camera.position.x, scene.camera.position.y, scene.camera.position.z],
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        shadows
      >
        <Suspense fallback={null}>
          <SceneContents
            scene={scene}
            enableOrbitControls={enableOrbitControls}
            playbackTime={playbackTime}
            autoPlay={autoPlay}
            selectedMannequinId={selectedMannequinId}
            selectedPropId={selectedPropId}
            onMannequinClick={onMannequinClick}
            onPropClick={onPropClick}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

// ─── 场景内容 ─────────────────────────────────────────────────────────────────

interface SceneContentsProps {
  scene: BlockoutScene;
  enableOrbitControls: boolean;
  playbackTime?: number;
  autoPlay: boolean;
  selectedMannequinId?: string;
  selectedPropId?: string;
  onMannequinClick?: (id: string) => void;
  onPropClick?: (id: string) => void;
}

function SceneContents({
  scene,
  enableOrbitControls,
  playbackTime,
  autoPlay,
  selectedMannequinId,
  selectedPropId,
  onMannequinClick,
  onPropClick,
}: SceneContentsProps) {
  const { camera } = useThree();

  // 自动播放：根据 RAF 时间计算 playbackTime
  const [autoTime, setAutoTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (autoPlay && scene.cameraPath && scene.cameraPath.length > 0) {
      if (startTimeRef.current === null) {
        startTimeRef.current = clock.elapsedTime;
      }
      const duration = scene.cameraPath[scene.cameraPath.length - 1]!.time;
      const elapsed = (clock.elapsedTime - startTimeRef.current) % duration;
      setAutoTime(elapsed);
    } else {
      startTimeRef.current = null;
    }
  });

  // 应用相机位姿
  const currentTime = autoPlay ? autoTime : playbackTime;
  useEffect(() => {
    if (currentTime === undefined) return;
    if (!scene.cameraPath || scene.cameraPath.length === 0) return;

    const pose = getCameraPoseAtTime(scene.cameraPath, currentTime, scene.camera.fov);
    applyPoseToCamera(camera as THREE.PerspectiveCamera, pose);
  }, [currentTime, scene.cameraPath, scene.camera.fov, camera]);

  return (
    <>
      <Lights preset={scene.lighting} />

      <Ground ground={scene.ground} />

      {scene.props.map((prop) => (
        <PropMesh
          key={prop.id}
          prop={prop}
          isSelected={prop.id === selectedPropId}
          onClick={onPropClick}
        />
      ))}

      {scene.characters.map((m) => (
        <MannequinMesh
          key={m.id}
          mannequin={m}
          isSelected={m.id === selectedMannequinId}
          onClick={onMannequinClick}
        />
      ))}

      {enableOrbitControls && (
        <OrbitControls
          target={[scene.camera.target.x, scene.camera.target.y, scene.camera.target.z]}
          makeDefault
        />
      )}

      <Environment preset="studio" />
    </>
  );
}

// ─── 灯光 ─────────────────────────────────────────────────────────────────────

function Lights({ preset }: { preset: LightingPreset }) {
  const azimuth = (preset.sunAzimuth ?? 45) * Math.PI / 180;
  const elevation = (preset.sunElevation ?? 60) * Math.PI / 180;
  const radius = 20;

  const sunPosition: [number, number, number] = [
    radius * Math.cos(elevation) * Math.sin(azimuth),
    radius * Math.sin(elevation),
    radius * Math.cos(elevation) * Math.cos(azimuth),
  ];

  return (
    <>
      <ambientLight
        intensity={preset.ambientIntensity ?? 0.4}
        color={preset.ambientColor ?? "#ffffff"}
      />
      <directionalLight
        position={sunPosition}
        intensity={preset.intensity ?? 1.2}
        color={preset.sunColor ?? "#ffffff"}
        castShadow
      />
      {preset.type === "dramatic" && (
        <directionalLight position={[-10, 5, -10]} intensity={0.6} color="#ffd700" />
      )}
      {preset.type === "night" && (
        <directionalLight position={[-5, 8, 5]} intensity={0.3} color="#4a6afa" />
      )}
    </>
  );
}

// ─── 地面 ─────────────────────────────────────────────────────────────────────

function Ground({ ground }: { ground: GroundPlane }) {
  const color = ground.color ?? "#3a3a3a";

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[ground.size.width, ground.size.depth]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {ground.showGrid && (
        <Grid
          args={[ground.size.width, ground.size.depth]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#444444"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#666666"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
        />
      )}
    </group>
  );
}

// ─── 道具 mesh ────────────────────────────────────────────────────────────────

interface PropMeshProps {
  prop: PrimitiveShape;
  isSelected: boolean;
  onClick?: (id: string) => void;
}

function PropMesh({ prop, isSelected, onClick }: PropMeshProps) {
  const geometry = useMemo(() => {
    switch (prop.type) {
      case "box": return <boxGeometry args={[1, 1, 1]} />;
      case "cylinder": return <cylinderGeometry args={[0.5, 0.5, 1, 16]} />;
      case "sphere": return <sphereGeometry args={[0.5, 16, 12]} />;
      case "plane": return <planeGeometry args={[1, 1]} />;
      case "cone": return <coneGeometry args={[0.5, 1, 16]} />;
      case "torus": return <torusGeometry args={[0.5, 0.18, 8, 24]} />;
      default: return <boxGeometry args={[1, 1, 1]} />;
    }
  }, [prop.type]);

  if (prop.visible === false) return null;

  const color = prop.color ?? "#808080";

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClick?.(prop.id);
  };

  return (
    <mesh
      position={[prop.position.x, prop.position.y, prop.position.z]}
      rotation={[0, (prop.rotationY * Math.PI) / 180, 0]}
      scale={[prop.scale.x, prop.scale.y, prop.scale.z]}
      castShadow
      receiveShadow
      onClick={handleClick}
    >
      {geometry}
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        metalness={0.1}
        flatShading
        emissive={isSelected ? "#ffaa00" : "#000000"}
        emissiveIntensity={isSelected ? 0.3 : 0}
      />
    </mesh>
  );
}

// ─── 人偶 mesh ────────────────────────────────────────────────────────────────

interface MannequinMeshProps {
  mannequin: Mannequin;
  isSelected: boolean;
  onClick?: (id: string) => void;
}

function MannequinMesh({ mannequin, isSelected, onClick }: MannequinMeshProps) {
  const color = useMemo(() => getMannequinColor(mannequin.id), [mannequin.id]);

  if (mannequin.visible === false) return null;

  const geom = getMannequinGeometry(mannequin);
  const poseMeta = POSE_PRESETS[mannequin.pose];

  const bodyHeight = geom.height * 0.7;
  const bodyRadius = Math.max(0.1, geom.width / 2);
  const headRadius = Math.max(0.08, bodyRadius * 0.7);

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClick?.(mannequin.id);
  };

  const showArrow = poseMeta.silhouette === "upright" || poseMeta.silhouette === "extended";
  const isLying = poseMeta.silhouette === "low";

  return (
    <group
      position={[geom.center.x, isLying ? geom.height / 2 : 0, geom.center.z]}
      rotation={[0, geom.rotationRad, isLying ? Math.PI / 2 : 0]}
      onClick={handleClick}
    >
      {/* 身体（胶囊） */}
      <mesh position={[0, bodyHeight / 2 + bodyRadius, 0]} castShadow>
        <capsuleGeometry args={[bodyRadius, bodyHeight, 4, 8]} />
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          flatShading
          emissive={isSelected ? "#ffaa00" : "#000000"}
          emissiveIntensity={isSelected ? 0.4 : 0}
        />
      </mesh>

      {/* 头部（球） */}
      <mesh position={[0, bodyHeight + bodyRadius * 2 + headRadius * 0.5, 0]} castShadow>
        <sphereGeometry args={[headRadius, 12, 8]} />
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          flatShading
          emissive={isSelected ? "#ffaa00" : "#000000"}
          emissiveIntensity={isSelected ? 0.4 : 0}
        />
      </mesh>

      {/* 朝向标识（小三角锥） */}
      {showArrow && (
        <mesh
          position={[0, bodyHeight + bodyRadius * 2 + headRadius * 0.5, headRadius + 0.2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[0.08, 0.25, 4]} />
          <meshStandardMaterial color="#ff5555" roughness={0.6} flatShading />
        </mesh>
      )}
    </group>
  );
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function applyPoseToCamera(camera: THREE.PerspectiveCamera, pose: CameraPose): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  if (pose.fov !== camera.fov) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

function getMannequinColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const hash = Math.abs(h);
  const hue = ((hash % 60) - 30 + 360) / 360; // 0-1 范围
  const color = new THREE.Color().setHSL(hue, 0.1, 0.5);
  return `#${color.getHexString()}`;
}
