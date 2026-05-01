import { Component, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { ShellComponent } from './layout/shell/shell.component';
import { RouterOutlet } from '@angular/router';
import { SettingsService } from './shared/services/settings.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ShellComponent, RouterOutlet],
  template: `
    @if (isOverlayRoute) {
      <router-outlet />
    } @else {
      <app-shell />
    }
  `,
})
export class AppComponent {
  private readonly settings = inject(SettingsService);
  isOverlayRoute = false;

  constructor(private router: Router) {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        map((event) => (event as NavigationEnd).urlAfterRedirects)
      )
      .subscribe((url) => {
        this.isOverlayRoute = url.includes('/overlay') || url.includes('/mobile/');
      });
  }
}
