import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Canvas,
  useUpdate,
  useResource,
  useFrame,
  ReactThreeFiber
} from 'react-three-fiber';
import * as THREE from 'three';

const faceTexW = 0.2;
const faceTexH = 0.2;
const texMargin = 0.1;

const facesPerRow = Math.floor(1 / (faceTexW + texMargin));

function computeFaceUV(faceIndex: number) {
  const faceColumn = faceIndex % facesPerRow;
  const faceRow = Math.floor(faceIndex / facesPerRow);

  const left = faceColumn * (faceTexW + texMargin);
  const top = faceRow * (faceTexH + texMargin);
  const right = left + faceTexW;
  const bottom = top + faceTexH;

  return { left, top, right, bottom };
}

let testCount = 0;

function Scene() {
  const [lightSceneRef, lightScene] = useResource<THREE.Scene>();

  const atlasWidth = 64;
  const atlasHeight = 64;
  const size = atlasWidth * atlasHeight;

  const atlasData = useMemo(() => {
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const x = i % atlasWidth;
      const y = Math.floor(i / atlasWidth);

      const stride = i * 3;

      const v = x % 8 === 0 || y % 8 === 0 ? 0 : 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return data;
  }, []);

  const controlTexture = useMemo(() => {
    return new THREE.DataTexture(
      atlasData,
      atlasWidth,
      atlasHeight,
      THREE.RGBFormat
    );
  }, []);

  const testTexture = useMemo(() => {
    const width = 256;
    const height = 256;
    const size = width * height;
    const data = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      const stride = i * 3;

      const v = 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }

    return new THREE.DataTexture(data, width, height, THREE.RGBFormat);
  }, []);

  const boxBufferRef = useUpdate<THREE.BoxBufferGeometry>((boxBuffer) => {
    const uvAttr = boxBuffer.attributes.uv;

    for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
      const { left, top, right, bottom } = computeFaceUV(faceIndex);

      // default is [0, 1, 1, 1, 0, 0, 1, 0]
      const uvItemBase = faceIndex * 4;
      uvAttr.setXY(uvItemBase, left, bottom);
      uvAttr.setXY(uvItemBase + 1, right, bottom);
      uvAttr.setXY(uvItemBase + 2, left, top);
      uvAttr.setXY(uvItemBase + 3, right, top);
    }

    boxBuffer.setAttribute('uv2', new THREE.BufferAttribute(uvAttr.array, 2));
  }, []);

  const rtWidth = 32;
  const rtHeight = 32;
  const testTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(rtWidth, rtHeight);
  }, []);

  const testCam = useMemo(() => {
    const rtFov = 90; // full near-180 FOV actually works poorly
    const rtAspect = rtWidth / rtHeight;
    const rtNear = 0.1;
    const rtFar = 10;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const testBuffer = useMemo(() => {
    return new Uint8Array(rtWidth * rtHeight * 4);
  }, []);

  const pinholeTexture = useMemo(() => {
    return new THREE.DataTexture(
      testBuffer,
      rtWidth,
      rtHeight,
      THREE.RGBAFormat
    );
  }, []);

  useFrame(({ gl, scene }) => {
    // face 4 is the top one
    const faceIndex = 4;

    const { left, top, right, bottom } = computeFaceUV(faceIndex);
    const faceTexW = (right - left) * atlasWidth;
    const faceTexH = (bottom - top) * atlasHeight;
    const faceTexelCols = Math.ceil(faceTexW);
    const faceTexelRows = Math.ceil(faceTexH);

    // even texel offset from face origin inside texture data
    const faceTexelX = testCount % faceTexelCols;
    const faceTexelY = Math.floor(testCount / faceTexelCols);
    testCount = (testCount + 1) % (faceTexelRows * faceTexelCols);

    // find texel inside atlas, as rounded to texel boundary
    const atlasTexelLeft = left * atlasWidth;
    const atlasTexelTop = top * atlasWidth;
    const atlasTexelX = Math.floor(atlasTexelLeft) + faceTexelX;
    const atlasTexelY = Math.floor(atlasTexelTop) + faceTexelY;

    // compute rounded texel's U and V position within face
    const pU = (atlasTexelX - atlasTexelLeft) / faceTexW;
    const pV = (atlasTexelY - atlasTexelTop) / faceTexH;

    // read vertex position for this face and interpolate along U and V axes
    // @todo also transform by mesh pos
    const boxBuffer = boxBufferRef.current;
    const posArray = boxBuffer.attributes.position.array;
    const facePosStart = faceIndex * 4 * 3;
    const facePosOrigin = facePosStart + 2 * 3;
    const facePosU = facePosStart + 3 * 3;
    const facePosV = facePosStart;

    const dUx = posArray[facePosU] - posArray[facePosOrigin];
    const dUy = posArray[facePosU + 1] - posArray[facePosOrigin + 1];
    const dUz = posArray[facePosU + 2] - posArray[facePosOrigin + 2];

    const dVx = posArray[facePosV] - posArray[facePosOrigin];
    const dVy = posArray[facePosV + 1] - posArray[facePosOrigin + 1];
    const dVz = posArray[facePosV + 2] - posArray[facePosOrigin + 2];

    const pUVx = posArray[facePosOrigin] + dUx * pU + dVx * pV;
    const pUVy = posArray[facePosOrigin + 1] + dUy * pU + dVy * pV;
    const pUVz = posArray[facePosOrigin + 2] + dUz * pU + dVz * pV - 2;

    // console.log(atlasTexelX, atlasTexelY, pUVx, pUVy, pUVz);

    const upAngle = Math.random() * Math.PI;
    testCam.position.set(pUVx, pUVy, pUVz);
    testCam.up.set(Math.cos(upAngle), Math.sin(upAngle), 0);
    testCam.lookAt(pUVx, pUVy, pUVz + 1);
    gl.setRenderTarget(testTarget);
    gl.render(scene, testCam);
    gl.setRenderTarget(null);

    gl.readRenderTargetPixels(testTarget, 0, 0, rtWidth, rtHeight, testBuffer);
    pinholeTexture.needsUpdate = true;

    const rtLength = testBuffer.length;
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < rtLength; i += 4) {
      const a = testBuffer[i + 3];
      r += testBuffer[i];
      g += testBuffer[i + 1];
      b += testBuffer[i + 2];
    }

    const pixelCount = rtWidth * rtHeight;
    const ar = Math.round(r / pixelCount);
    const ag = Math.round(g / pixelCount);
    const ab = Math.round(b / pixelCount);

    atlasData.set([ar, ag, ab], (atlasTexelY * atlasWidth + atlasTexelX) * 3);
    controlTexture.needsUpdate = true;
  });

  return (
    <>
      <scene ref={lightSceneRef} />

      <mesh position={[0, 0, -5]}>
        <planeBufferGeometry attach="geometry" args={[200, 200]} />
        <meshBasicMaterial attach="material" color="#171717" />
      </mesh>
      <mesh position={[-4, 4, 0]}>
        <planeBufferGeometry attach="geometry" args={[2, 2]} />
        <meshBasicMaterial attach="material" map={pinholeTexture} />
      </mesh>
      <mesh position={[0, 0, -2]}>
        <boxBufferGeometry
          attach="geometry"
          args={[5, 5, 2]}
          ref={boxBufferRef}
        />
        <meshBasicMaterial
          attach="material"
          map={controlTexture}
          aoMap={testTexture}
          aoMapIntensity={1}
        />
      </mesh>
      <mesh position={[0, 0, 3]}>
        <boxBufferGeometry attach="geometry" args={[1, 1, 6]} />
        <meshBasicMaterial attach="material" color="black" />
      </mesh>
      <mesh position={[5, -5, 10]}>
        <boxBufferGeometry attach="geometry" args={[8, 8, 8]} />
        <meshBasicMaterial attach="material" color="white" />
      </mesh>
    </>
  );
}

function App() {
  return (
    <Canvas
      camera={{ position: [-4, -4, 8], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        // gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputEncoding = THREE.sRGBEncoding;
      }}
    >
      <Scene />
    </Canvas>
  );
}

export default App;
