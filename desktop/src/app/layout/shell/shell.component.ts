import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TitlebarComponent } from '../titlebar/titlebar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, TitlebarComponent, SidebarComponent],
  template: `
    <div class="shell">
      <app-titlebar />
      <div class="shell-body">
        <app-sidebar />
        <main class="shell-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    .shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      background-color: var(--color-sparrow-bg);
    }

    .shell-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .shell-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      background-color: var(--color-sparrow-bg);
    }
  `],
})
export class ShellComponent {}
