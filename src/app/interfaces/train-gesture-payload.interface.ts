import type { MultiHandLandmarks } from './multi-hand-landmarks.type';

export interface TrainGesturePayload {
  label: string;
  landmarks: MultiHandLandmarks;
}
