import React, { useMemo, useEffect, useRef } from 'react';
import { useFrame } from 'react-three-fiber';
import * as THREE from 'three';

import { atlasWidth, atlasHeight } from './IrradianceAtlasMapper';
import { IrradianceTextureContext } from './IrradianceSurfaceManager';

const CompositorLayerMaterial: React.FC<{
  map: THREE.Texture;
  materialRef: React.MutableRefObject<THREE.ShaderMaterial | null>;
}> = ({ map, materialRef }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null },
          multiplier: { value: 0 }
        },

        vertexShader: `
          varying vec2 vUV;

          void main() {
            vUV = uv;

            vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform float multiplier;
          varying vec2 vUV;

          void main() {
            gl_FragColor = vec4(texture2D(map, vUV).rgb * multiplier, 1.0);
          }
        `,

        blending: THREE.AdditiveBlending
      }),
    []
  );

  // disposable managed object
  return (
    <primitive
      object={material}
      attach="material"
      uniforms-map-value={map}
      ref={materialRef}
    />
  );
};

export default function IrradianceCompositor<
  FactorMap extends { [name: string]: THREE.Texture | null | undefined }
>({
  baseOutput,
  factorOutputs,
  factorValues,
  children
}: React.PropsWithChildren<{
  baseOutput: THREE.Texture | null | undefined;
  factorOutputs: FactorMap;
  factorValues?: { [name in keyof FactorMap]: number | undefined };
}>): React.ReactElement {
  const orthoSceneRef = useRef<THREE.Scene>();

  const baseMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const factorMaterialRefMap = useMemo(() => {
    // createRef assumes null as default value (not undefined)
    const result = {} as {
      [name: string]: React.MutableRefObject<THREE.ShaderMaterial | null>;
    };

    for (const key of Object.keys(factorOutputs)) {
      result[key] = React.createRef<THREE.ShaderMaterial>();
    }
    return result;
  }, [factorOutputs]);

  const orthoTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(atlasWidth, atlasHeight, {
      type: THREE.FloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      generateMipmaps: false
    });
  }, []);

  useEffect(
    () => () => {
      // clean up on unmount
      orthoTarget.dispose();
    },
    [orthoTarget]
  );

  const orthoCamera = useMemo(() => {
    return new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  }, []);

  useFrame(({ gl }) => {
    // ensure light scene has been instantiated
    if (!orthoSceneRef.current) {
      return;
    }

    const orthoScene = orthoSceneRef.current; // local var for type safety

    // live-update actual intensity values
    if (baseMaterialRef.current) {
      baseMaterialRef.current.uniforms.multiplier.value = 1;
    }

    for (const factorName in factorOutputs) {
      const factorMaterialRef = factorMaterialRefMap[factorName];
      const multiplier = factorValues && factorValues[factorName];

      if (factorMaterialRef.current && multiplier) {
        factorMaterialRef.current.uniforms.multiplier.value = multiplier;
      }
    }

    gl.autoClear = true;
    gl.setRenderTarget(orthoTarget);
    gl.render(orthoScene, orthoCamera);
    gl.setRenderTarget(null);
  }, 10);

  return (
    <>
      <scene ref={orthoSceneRef}>
        {baseOutput && (
          <mesh>
            <planeBufferGeometry attach="geometry" args={[2, 2]} />
            <CompositorLayerMaterial
              map={baseOutput}
              materialRef={baseMaterialRef}
            />
          </mesh>
        )}

        {Object.keys(factorOutputs).map((factorName) => {
          const factorOutput = factorOutputs[factorName];
          return (
            factorOutput && (
              <mesh key={factorName}>
                <planeBufferGeometry attach="geometry" args={[2, 2]} />
                <CompositorLayerMaterial
                  map={factorOutput}
                  materialRef={factorMaterialRefMap[factorName]}
                />
              </mesh>
            )
          );
        })}
      </scene>

      <IrradianceTextureContext.Provider value={orthoTarget.texture}>
        {children}
      </IrradianceTextureContext.Provider>
    </>
  );
}
