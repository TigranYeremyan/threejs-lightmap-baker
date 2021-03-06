import React, { useMemo, useCallback, useContext } from 'react';
import { useUpdate } from 'react-three-fiber';
import * as THREE from 'three';

export interface AtlasSceneItem {
  mesh: THREE.Mesh;
  buffer: THREE.Geometry | THREE.BufferGeometry; // either is fine
  albedo: THREE.Color;
  albedoMap?: THREE.Texture;
  emissive: THREE.Color;
  emissiveIntensity: number;
  emissiveMap?: THREE.Texture;
  factorName: string | null;
  animationClip: THREE.AnimationClip | null;
}

export interface AtlasSceneLight {
  dirLight: THREE.DirectionalLight;
  factorName: string | null;
}

export interface AtlasLightFactor {
  mesh: THREE.Mesh;
  emissiveIntensity: number;
}

export interface Atlas {
  lightSceneItems: AtlasSceneItem[];
  lightSceneLights: AtlasSceneLight[];
}

const IrradianceAtlasContext = React.createContext<Atlas | null>(null);

export function useIrradianceAtlasContext() {
  const atlasInfo = useContext(IrradianceAtlasContext);

  if (!atlasInfo) {
    throw new Error('must be inside manager context');
  }

  return atlasInfo;
}

// @todo wrap in provider helper
export const IrradianceTextureContext = React.createContext<THREE.Texture | null>(
  null
);

// attach a mesh to be mapped in texture atlas
export function useAtlasMeshRef(
  factorName: string | null,
  animationClip: THREE.AnimationClip | null,
  withMesh?: (mesh: THREE.Mesh) => void
) {
  const atlas = useIrradianceAtlasContext();
  const { lightSceneItems } = atlas;

  const meshRef = useUpdate<THREE.Mesh>((mesh) => {
    const meshBuffer = mesh.geometry;
    const material = mesh.material;

    if (Array.isArray(material)) {
      throw new Error('material array not supported');
    }

    if (!(material instanceof THREE.MeshLambertMaterial)) {
      throw new Error('only Lambert materials are supported');
    }

    // register display item
    lightSceneItems.push({
      mesh,
      buffer: meshBuffer,
      albedo: material.color,
      albedoMap: material.map || undefined,
      emissive: material.emissive,
      emissiveIntensity: material.emissiveIntensity, // @todo if factor contributor, zero emissive by default
      emissiveMap: material.emissiveMap || undefined,
      factorName,
      animationClip
    });

    if (!(meshBuffer instanceof THREE.BufferGeometry)) {
      throw new Error('expected buffer geometry');
    }

    if (!meshBuffer.index) {
      throw new Error('expecting indexed mesh buffer');
    }

    // allow upstream code to run
    if (withMesh) {
      withMesh(mesh);
    }
  }, []);

  return meshRef;
}

export function useLightRef(factorName: string | null) {
  const { lightSceneLights } = useIrradianceAtlasContext();

  const lightRef = useUpdate<THREE.Light>((light) => {
    if (!(light instanceof THREE.DirectionalLight)) {
      throw new Error('only directional lights are supported');
    }

    // register display item
    lightSceneLights.push({
      dirLight: light,
      factorName
    });
  }, []);

  return lightRef;
}

const IrradianceSurfaceManager: React.FC = ({ children }) => {
  const atlas: Atlas = useMemo(
    () => ({
      lightSceneItems: [],
      lightSceneLights: []
    }),
    []
  );

  return (
    <IrradianceAtlasContext.Provider value={atlas}>
      {children}
    </IrradianceAtlasContext.Provider>
  );
};

export default IrradianceSurfaceManager;
