import { Injectable } from '@angular/core';
import { fromEvent, merge, Observable } from 'rxjs';
import { map, shareReplay, startWith } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import type {
  PredictGesturePayload,
  PredictionResultEvent,
  TrainGesturePayload,
  TrainingFinishedEvent,
} from '../interfaces';
import { environment } from '../../environments/environment';
import { TrainingPort } from './training-port';

@Injectable({ providedIn: 'root' })
export class AslTrainingService extends TrainingPort {
  private readonly backendUrl = environment.backendUrl;
  private readonly socket: Socket = io(environment.backendUrl);

  readonly connectionStatus$: Observable<string> = merge(
    fromEvent(this.socket, 'connect').pipe(map(() => `Conectado (${this.socket.id ?? 'socket'})`)),
    fromEvent(this.socket, 'disconnect').pipe(map(() => 'Desconectado')),
    fromEvent(this.socket, 'connect_error').pipe(map(() => 'Error de conexión')),
  ).pipe(startWith('Conectando...'), shareReplay({ bufferSize: 1, refCount: true }));

  readonly trainingFinished$: Observable<TrainingFinishedEvent> = fromEvent<TrainingFinishedEvent>(
    this.socket,
    'training-finished',
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  readonly predictionResult$: Observable<PredictionResultEvent> = fromEvent<PredictionResultEvent>(
    this.socket,
    'prediction-result',
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  sendTrainGesture(payload: TrainGesturePayload): void {
    this.socket.emit('train-gesture', payload);
  }

  sendPredictGesture(payload: PredictGesturePayload): void {
    this.socket.emit('predict-gesture', payload);
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}
