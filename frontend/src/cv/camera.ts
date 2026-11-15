// Turns the webcam on and off. The picture only goes into a <video> element on this page so MediaPipe can
// read it frame by frame. Nothing is recorded: no MediaRecorder, no canvas snapshots, no upload, no storage.

// The one open camera stream (null when the camera is off).
let stream: MediaStream | null = null;

/** Why the camera could not start, in plain words for the camera panel. */
export class CameraError extends Error {}

/** Asks for the webcam and plays it into `video`. Resolves once frames are flowing. */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  // Some browsers (or plain http on another computer) have no camera API at all.
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('This browser cannot use the camera here. Open the app at http://localhost in Chrome or Edge.');
  }
  try {
    // A small picture is enough for body points and is cheaper to process. Video only, never sound.
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
  } catch (error) {
    // The user (or the browser settings) said no.
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new CameraError('Camera blocked. Allow the camera in the browser address bar, then try again.');
    }
    // No webcam plugged in.
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      throw new CameraError('No camera found. Plug in a webcam, then try again.');
    }
    // Another app is using it, or something else went wrong.
    throw new CameraError('The camera could not start. Close other apps that use it, then try again.');
  }
  // Show the live picture in the video element. Muted so the browser lets it play without a click.
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
}

/** Turns the webcam off (its light goes out) and empties the video element. */
export function stopCamera(video?: HTMLVideoElement | null): void {
  // Stopping every track releases the camera.
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  // Detach the stream so no old frame stays on screen.
  if (video) video.srcObject = null;
}
