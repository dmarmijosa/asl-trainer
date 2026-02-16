import { Observable } from 'rxjs';
import type {
  PredictGesturePayload,
  PredictionResultEvent,
  TrainGesturePayload,
  TrainingFinishedEvent,
} from '../interfaces';

export abstract class TrainingPort {
  abstract readonly connectionStatus$: Observable<string>;
  abstract readonly trainingFinished$: Observable<TrainingFinishedEvent>;
  abstract readonly predictionResult$: Observable<PredictionResultEvent>;

  abstract sendTrainGesture(payload: TrainGesturePayload): void;
  abstract sendPredictGesture(payload: PredictGesturePayload): void;
  abstract disconnect(): void;
}
