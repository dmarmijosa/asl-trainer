import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type {
  HandLandmark,
  MultiHandLandmarks,
  PredictGesturePayload,
  TrainGesturePayload,
} from './interfaces';
import { TrainingPort } from './services/training-port';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  private readonly trainingPort = inject(TrainingPort);

  video = viewChild<ElementRef<HTMLVideoElement>>('video');
  canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private handLandmarker!: HandLandmarker;
  private animationFrameId: number | null = null;

  connectionStatus = signal('Conectando...');
  isCameraOn = signal(false);
  handsDetected = signal(0);
  trainingStatus = signal('Listo para entrenar');
  predictionStatus = signal('Sin prueba');
  predictedGesture = signal('---');
  lastLandmarks: MultiHandLandmarks | null = null;

  private readonly handConnections: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [13, 17],
    [17, 18],
    [18, 19],
    [19, 20],
    [0, 17],
  ];

  private readonly handColors = [
    { line: '#22d3ee', point: '#facc15' },
    { line: '#fb7185', point: '#86efac' },
  ];

  constructor() {
    this.registerTrainingSubscriptions();
  }

  async ngAfterViewInit() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }

  ngOnDestroy() {
    this.stopCamera();
    this.trainingPort.disconnect();
  }

  private registerTrainingSubscriptions() {
    this.trainingPort.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        this.connectionStatus.set(status);
      });

    this.trainingPort.trainingFinished$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => {
        if (res?.data) {
          this.trainingStatus.set(`Gesto "${res.label ?? ''}" guardado en Pinecone.`);
          return;
        }

        this.trainingStatus.set(res?.message ?? 'Error al guardar el gesto');
      });

    this.trainingPort.predictionResult$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((res) => {
        this.predictedGesture.set(res?.data ?? 'UNKNOWN');
        if (res?.success) {
          this.predictionStatus.set('Predicción completada');
          return;
        }

        this.predictionStatus.set(res?.message ?? 'Error al predecir');
      });
  }

  async toggleCamera() {
    if (this.isCameraOn()) {
      this.stopCamera();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      });
      const videoEl = this.video()?.nativeElement;
      if (!videoEl) return;
      videoEl.srcObject = stream;
      videoEl.onloadedmetadata = () => this.syncCanvasSize();
      this.isCameraOn.set(true);
      await videoEl.play();
      this.detectFrame();
    } catch {
      this.connectionStatus.set('Permiso de cámara denegado');
    }
  }

  private stopCamera() {
    this.isCameraOn.set(false);
    this.handsDetected.set(0);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const videoElement = this.video()?.nativeElement;
    const stream = videoElement?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoElement) {
      videoElement.srcObject = null;
    }

    this.lastLandmarks = null;
    this.clearCanvas();
  }

  private detectFrame = () => {
    if (!this.isCameraOn()) return;
    const videoElement = this.video()?.nativeElement;
    if (!videoElement) return;
    this.syncCanvasSize();

    const startTimeMs = performance.now();
    const results = this.handLandmarker.detectForVideo(videoElement, startTimeMs);
    const allHands = (results.landmarks ?? []) as MultiHandLandmarks;

    this.handsDetected.set(allHands.length);

    if (allHands.length > 0) {
      this.lastLandmarks = allHands;
      this.drawHands(allHands);
    } else {
      this.lastLandmarks = null;
      this.clearCanvas();
    }

    this.animationFrameId = requestAnimationFrame(this.detectFrame);
  };

  train(label: string) {
    const normalizedLabel = this.normalizeToken(label);
    if (this.lastLandmarks && normalizedLabel) {
      this.trainingStatus.set(`Guardando "${normalizedLabel}"...`);
      const payload: TrainGesturePayload = {
        label: normalizedLabel,
        landmarks: this.lastLandmarks,
      };
      this.trainingPort.sendTrainGesture(payload);
      return;
    }

    this.trainingStatus.set('Coloca al menos una mano en cámara y escribe una etiqueta.');
  }

  testGesture() {
    if (!this.lastLandmarks) {
      this.predictionStatus.set('No hay manos detectadas para probar');
      return;
    }

    this.predictionStatus.set('Probando gesto...');
    const payload: PredictGesturePayload = {
      landmarks: this.lastLandmarks,
    };
    this.trainingPort.sendPredictGesture(payload);
  }

  private drawHands(hands: MultiHandLandmarks) {
    const ctx = this.canvas()?.nativeElement?.getContext('2d');
    const canvas = this.canvas()?.nativeElement;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    hands.forEach((landmarks, handIndex) => {
      const colors = this.handColors[handIndex % this.handColors.length];
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2.5;

      for (const [start, end] of this.handConnections) {
        const a = landmarks[start];
        const b = landmarks[end];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
        ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
        ctx.stroke();
      }

      ctx.fillStyle = colors.point;
      for (const point of landmarks) {
        this.drawPoint(ctx, point, canvas.width, canvas.height);
      }
    });
  }

  private drawPoint(
    ctx: CanvasRenderingContext2D,
    point: HandLandmark,
    width: number,
    height: number,
  ) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 5, 0, 2 * Math.PI);
    ctx.fill();
  }

  private clearCanvas() {
    const canvas = this.canvas()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private syncCanvasSize() {
    const canvas = this.canvas()?.nativeElement;
    const video = this.video()?.nativeElement;
    if (!canvas || !video) return;

    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;
    if (!width || !height) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  private normalizeToken(value: string): string {
    return (value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }
}
