import type { MultiHandLandmarks } from './multi-hand-landmarks.type';

export interface PredictGesturePayload {
  landmarks: MultiHandLandmarks;
}
