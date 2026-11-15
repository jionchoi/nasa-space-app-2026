// Loads the two MediaPipe models (body points and face/eyes) once, and turns their output into a Frame.
// Everything is served by our own app from frontend/public/models, so it works with no internet.
import { FaceLandmarker, FilesetResolver, PoseLandmarker, type FaceLandmarkerResult, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { Frame } from './types';

// Where the files are in the browser (frontend/public/models on disk).
const WASM_FOLDER = '/models/wasm';
export const POSE_MODEL_URL = '/models/pose_landmarker_lite.task';
export const FACE_MODEL_URL = '/models/face_landmarker.task';

/** The two loaded models. */
export interface Landmarkers {
  pose: PoseLandmarker;
  face: FaceLandmarker;
}

/** A model or MediaPipe file is missing or broken. The message says what to do. */
export class ModelSetupError extends Error {}

// The models load once and are shared; this remembers the loading (or finished) promise.
let loading: Promise<Landmarkers> | null = null;

/** Loads both models the first time it is called; later calls get the same ones. */
export function loadLandmarkers(): Promise<Landmarkers> {
  // Start loading only once.
  if (!loading) {
    loading = createLandmarkers();
    // If loading failed (for example a model file was missing), forget it so the next Start tries again.
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/** Checks that our server really has a file. Vite answers a missing file with the app's HTML page, so we check the type too. */
async function assertServed(url: string, whatToDo: string): Promise<void> {
  let ok = false;
  try {
    // HEAD asks only for the headers, not the (large) file.
    const response = await fetch(url, { method: 'HEAD' });
    ok = response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    ok = false;
  }
  if (!ok) throw new ModelSetupError(`Missing ${url}. ${whatToDo}`);
}

/** Tries the graphics card first (faster); if this computer cannot, falls back to the processor. */
async function withGpuFallback<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU');
  } catch {
    return await create('CPU');
  }
}

/** The actual loading: check the files, load MediaPipe's WebAssembly, then build both models. */
async function createLandmarkers(): Promise<Landmarkers> {
  // Clear messages instead of a crash when a file is missing.
  const download = 'Download it into frontend/public/models (see docs/cv-explained.md, Setup).';
  await assertServed(`${WASM_FOLDER}/vision_wasm_internal.js`, 'Run "npm install" in frontend/ (it copies the MediaPipe files).');
  await assertServed(POSE_MODEL_URL, download);
  await assertServed(FACE_MODEL_URL, download);

  // MediaPipe's WebAssembly runtime, from our own server.
  const fileset = await FilesetResolver.forVisionTasks(WASM_FOLDER);

  // Body points: the small ("lite") model, one person, frame by frame from a video.
  const pose = await withGpuFallback((delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  }));

  // Face points plus "blendshapes", which include how closed each eye is (eyeBlinkLeft / eyeBlinkRight).
  const face = await withGpuFallback((delegate) => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
  }));

  return { pose, face };
}

/** Finds one blendshape score (for example "eyeBlinkLeft") in the face result, or null if there is no face. */
function blendshape(result: FaceLandmarkerResult, name: string): number | null {
  // The first (and only) face's list of scores.
  const scores = result.faceBlendshapes?.[0]?.categories;
  if (!scores) return null;
  return scores.find((category) => category.categoryName === name)?.score ?? null;
}

/** Reduces both models' output for one video frame to our small Frame shape. */
export function readFrame(t: number, pose: PoseLandmarkerResult, face: FaceLandmarkerResult): Frame {
  return {
    t,
    // The first (and only) person's 33 body points, or null if no body was found.
    pose: pose.landmarks?.[0] ?? null,
    blinkLeft: blendshape(face, 'eyeBlinkLeft'),
    blinkRight: blendshape(face, 'eyeBlinkRight'),
  };
}
