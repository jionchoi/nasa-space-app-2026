// Shares one unresponsive-detection instance (one camera, one pulse monitor, one detector) with every screen: the header toggle,
// the floating camera panel, the "Are you OK?" overlay and the debug panel on /admin.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { readCvThresholds, withOverrides, type CvOverrides } from '../cv/thresholds';
import type { CvThresholds } from '../cv/types';
import { useUnresponsiveDetection, type UnresponsiveDetection } from '../cv/useUnresponsiveDetection';
import { useApp } from './AppContext';

interface CvState extends UnresponsiveDetection {
  /** The <video> element the camera plays into (rendered by CameraMonitor). */
  videoRef: RefObject<HTMLVideoElement>;
  /** The numbers from thresholds.json "cv" (null if the block is missing). */
  fileThresholds: CvThresholds | null;
  /** The numbers in use: the file's, with the debug panel's overrides on top. */
  thresholds: CvThresholds | null;
  /** Debug panel overrides (this browser session only; never saved). */
  overrides: CvOverrides;
  setOverrides(next: CvOverrides): void;
  /** Show or hide the small camera preview (detection keeps running either way). */
  previewVisible: boolean;
  /** Draw the body-relative skeleton (torso axes, arms) on the preview: a debug aid, off by default. */
  skeletonVisible: boolean;
  setSkeletonVisible(visible: boolean): void;
  setPreviewVisible(visible: boolean): void;
}

const Ctx = createContext<CvState | null>(null);

export function CvProvider({ children }: { children: ReactNode }) {
  const { thresholds: all } = useApp();
  // The <video> lives in CameraMonitor; the hook reads frames from it.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [overrides, setOverridesState] = useState<CvOverrides>({});
  const [previewVisible, setPreviewVisible] = useState(true);
  const [skeletonVisible, setSkeletonVisible] = useState(false);

  // thresholds.json "cv", then the debug overrides on top.
  const fileThresholds = useMemo(() => readCvThresholds(all), [all]);
  const thresholds = useMemo(() => (fileThresholds ? withOverrides(fileThresholds, overrides) : null), [fileThresholds, overrides]);

  // The detection itself.
  const detection = useUnresponsiveDetection(videoRef, thresholds);

  const setOverrides = useCallback((next: CvOverrides) => setOverridesState(next), []);

  const value = useMemo<CvState>(() => ({
    ...detection, videoRef, fileThresholds, thresholds, overrides, setOverrides, previewVisible, setPreviewVisible, skeletonVisible, setSkeletonVisible,
  }), [detection, fileThresholds, thresholds, overrides, setOverrides, previewVisible, skeletonVisible]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCv(): CvState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCv must be used inside CvProvider');
  return ctx;
}
