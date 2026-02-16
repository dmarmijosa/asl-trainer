import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AslTrainingService } from './services/asl-training.service';
import { TrainingPort } from './services/training-port';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    {
      provide: TrainingPort,
      useExisting: AslTrainingService,
    },
  ]
};
