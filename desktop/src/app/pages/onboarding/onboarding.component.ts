import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../shared/services/api.service';
import { AppStateService } from '../../shared/services/app-state.service';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="onboarding">
      <div class="onboarding-card">
        <!-- Progress Indicator -->
        <div class="step-indicator">
          @for (step of steps; track step; let i = $index) {
            <div
              class="step-dot"
              [class.step-dot--active]="i === currentStep()"
              [class.step-dot--completed]="i < currentStep()"
            ></div>
          }
        </div>

        <div class="step-content">
          <!-- Step 1: Personal Info -->
          @if (currentStep() === 0) {
            <h2 class="step-title">Tell us about yourself</h2>
            <p class="step-desc">We'll use this to personalize your interview experience.</p>
            <div class="form-fields">
              <div class="form-group">
                <label class="form-label">Full Name <span class="required">*</span></label>
                <input class="sparrow-input" type="text" placeholder="e.g. John Smith" [(ngModel)]="fullName" />
              </div>
              <div class="form-group">
                <label class="form-label">Email <span class="optional">(optional)</span></label>
                <input class="sparrow-input" type="email" placeholder="e.g. john.smith@email.com" [(ngModel)]="email" />
              </div>
              <div class="form-group">
                <label class="form-label">Target Role <span class="required">*</span></label>
                <input class="sparrow-input" type="text" placeholder="e.g. Senior Frontend Engineer" [(ngModel)]="targetRole" />
              </div>
              <div class="form-group">
                <label class="form-label">Company Name <span class="optional">(optional)</span></label>
                <input class="sparrow-input" type="text" placeholder="e.g. Google" [(ngModel)]="companyName" />
              </div>
            </div>
          }

          <!-- Step 2: Job Description -->
          @if (currentStep() === 1) {
            <h2 class="step-title">Job Description</h2>
            <p class="step-desc">Paste the job description to enable role-specific answers.</p>
            <div class="form-fields">
              <div class="form-group">
                <label class="form-label">Job Description <span class="optional">(optional)</span></label>
                <textarea
                  class="sparrow-input textarea-large"
                  placeholder="Paste the full job description here..."
                  rows="10"
                  [(ngModel)]="jobDescription"
                ></textarea>
              </div>
            </div>
          }

          <!-- Step 3: Documents -->
          @if (currentStep() === 2) {
            <h2 class="step-title">Upload Documents</h2>
            <p class="step-desc">Your resume and supporting documents power AI context.</p>
            <div class="form-fields">
              <div class="form-group">
                <label class="form-label">Resume <span class="required">*</span></label>
                <div class="upload-zone" (click)="triggerFileUpload('resume')" (dragover)="onDragOver($event)" (drop)="onDrop($event, 'resume')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="upload-icon">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span class="upload-text">
                    @if (resumeFile()) {
                      {{ resumeFile() }}
                    } @else {
                      Click or drag to upload resume (PDF, DOCX)
                    }
                  </span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Supporting Documents <span class="optional">(optional)</span></label>
                <div class="upload-zone" (click)="triggerFileUpload('docs')" (dragover)="onDragOver($event)" (drop)="onDrop($event, 'docs')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="upload-icon">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span class="upload-text">{{ supportingFilesLabel() }}</span>
                </div>
              </div>
            </div>
          }

          <!-- Step 4: Preferences -->
          @if (currentStep() === 3) {
            <h2 class="step-title">Preferences</h2>
            <p class="step-desc">Customize how the AI assistant responds.</p>
            <div class="form-fields">
              <div class="form-group">
                <label class="form-label">Custom Instructions <span class="optional">(optional)</span></label>
                <textarea
                  class="sparrow-input"
                  placeholder="e.g. Keep answers under 3 sentences, focus on backend topics..."
                  rows="4"
                  [(ngModel)]="customInstructions"
                ></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Preferred Language</label>
                <select class="sparrow-input" [(ngModel)]="language">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="pt">Portuguese</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="hi">Hindi</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
            </div>
          }
        </div>

        @if (errorMessage()) {
          <div class="form-error">{{ errorMessage() }}</div>
        }

        <!-- Navigation -->
        <div class="step-nav">
          @if (currentStep() > 0) {
            <button class="nav-btn nav-btn--back" (click)="prevStep()">Back</button>
          } @else {
            <div></div>
          }
          @if (currentStep() < steps.length - 1) {
            <button class="sparrow-btn-primary" (click)="nextStep()">Continue</button>
          } @else {
            <button class="sparrow-btn-accent" (click)="finish()" [disabled]="isSubmitting()">
              {{ isSubmitting() ? 'Saving...' : 'Complete Setup' }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .onboarding {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 40px - 3rem);
    }

    .onboarding-card {
      background-color: var(--color-sparrow-surface);
      border: 1px solid var(--color-sparrow-border);
      border-radius: 16px;
      padding: 2rem 2.5rem;
      width: 100%;
      max-width: 560px;
    }

    .step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }

    .step-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-sparrow-border);
      transition: all 0.3s ease;
    }

    .step-dot--active {
      width: 24px;
      border-radius: 4px;
      background: linear-gradient(135deg, #8b5e3c, #a47551);
    }

    .step-dot--completed {
      background-color: var(--color-sparrow-accent);
    }

    .step-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-sparrow-text);
      margin: 0 0 0.375rem;
    }

    .step-desc {
      font-size: 0.8125rem;
      color: var(--color-sparrow-text-muted);
      margin: 0 0 1.5rem;
    }

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .form-label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-sparrow-text);
    }

    .required { color: var(--color-sparrow-danger); }
    .optional { color: var(--color-sparrow-text-muted); font-weight: 400; }

    .textarea-large { min-height: 200px; resize: vertical; }

    .upload-zone {
      border: 2px dashed var(--color-sparrow-border);
      border-radius: 12px;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--color-sparrow-primary);
        background-color: rgba(139, 94, 60, 0.05);
      }
    }

    .upload-icon {
      width: 32px;
      height: 32px;
      color: var(--color-sparrow-text-muted);
    }

    .upload-text {
      font-size: 0.8125rem;
      color: var(--color-sparrow-text-muted);
    }

    .step-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 2rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--color-sparrow-border);
    }

    .form-error {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      border: 1px solid rgba(239, 68, 68, 0.35);
      background-color: rgba(239, 68, 68, 0.12);
      color: #fecaca;
      font-size: 0.8125rem;
    }

    .nav-btn {
      padding: 0.625rem 1.25rem;
      border-radius: 12px;
      font-weight: 500;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .nav-btn--back {
      background: transparent;
      border: 1px solid var(--color-sparrow-border);
      color: var(--color-sparrow-text-muted);

      &:hover {
        border-color: var(--color-sparrow-text-muted);
        color: var(--color-sparrow-text);
      }
    }

    select.sparrow-input {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;
      padding-right: 2rem;
    }

    .sparrow-btn-accent:disabled {
      cursor: wait;
      opacity: 0.7;
      filter: none;
      transform: none;
      box-shadow: none;
    }
  `],
})
export class OnboardingComponent {
  steps = ['Personal', 'Job Description', 'Documents', 'Preferences'];
  currentStep = signal(0);

  fullName = '';
  email = '';
  targetRole = '';
  companyName = '';
  jobDescription = '';
  customInstructions = '';
  language = 'en';
  resumeFile = signal<string | null>(null);
  supportingFilesLabel = signal('Upload supporting docs (PDF, DOCX, TXT, MD)');
  errorMessage = signal<string | null>(null);
  isSubmitting = signal(false);
  private resumeFileObject: File | null = null;
  private supportingFileObjects: File[] = [];

  constructor(
    private readonly api: ApiService,
    private readonly appState: AppStateService,
    private readonly router: Router
  ) { }

  nextStep(): void {
    if (this.currentStep() < this.steps.length - 1) {
      this.currentStep.update((s) => s + 1);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 0) {
      this.currentStep.update((s) => s - 1);
    }
  }

  async finish(): Promise<void> {
    this.errorMessage.set(null);

    if (!this.fullName.trim()) {
      this.errorMessage.set('Full name is required.');
      return;
    }

    if (!this.targetRole.trim()) {
      this.errorMessage.set('Target role is required.');
      return;
    }

    if (!this.resumeFileObject) {
      this.errorMessage.set('Please upload your resume before completing setup.');
      return;
    }

    this.isSubmitting.set(true);

    try {
      const user = await firstValueFrom(
        this.api.createUser({
          fullName: this.fullName.trim(),
          email: this.email.trim() || undefined,
          language: this.language,
          targetRole: this.targetRole.trim(),
          companyName: this.companyName.trim() || undefined,
          jobDescription: this.jobDescription.trim() || undefined,
          customInstructions: this.customInstructions.trim() || undefined,
        })
      );

      this.appState.saveUser({
        id: user.id,
        fullName: user.fullName,
        preferredLanguage: user.preferredLanguage ?? this.language,
        token: user.token,
      });

      await firstValueFrom(this.api.uploadDocument(user.id, 'resume', this.resumeFileObject));

      for (const file of this.supportingFileObjects) {
        await firstValueFrom(this.api.uploadDocument(user.id, 'supporting', file));
      }

      await this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Setup failed. Please verify the backend is running and try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  triggerFileUpload(type: string): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = type === 'docs';
    input.accept = type === 'resume' ? '.pdf,.doc,.docx' : '.pdf,.doc,.docx,.txt,.md';
    input.onchange = () => this.handleSelectedFiles(Array.from(input.files ?? []), type);
    input.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, type: string): void {
    event.preventDefault();
    this.handleSelectedFiles(Array.from(event.dataTransfer?.files ?? []), type);
  }

  private handleSelectedFiles(files: File[], type: string): void {
    if (files.length === 0) {
      return;
    }

    if (type === 'resume') {
      this.resumeFileObject = files[0];
      this.resumeFile.set(files[0].name);
      return;
    }

    this.supportingFileObjects = files;
    this.supportingFilesLabel.set(files.map((file) => file.name).join(', '));
  }
}
