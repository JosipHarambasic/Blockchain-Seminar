import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core";
import { provideRouter, withPreloading, PreloadAllModules } from "@angular/router";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideIonicAngular } from "@ionic/angular/standalone";

import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideIonicAngular(),
    provideHttpClient(withFetch()),
  ],
};
