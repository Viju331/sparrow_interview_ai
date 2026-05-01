import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppStateService } from '../services/app-state.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const appState = inject(AppStateService);
    const token = appState.authToken;

    if (token) {
        const authReq = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
        });
        return next(authReq);
    }

    return next(req);
};
