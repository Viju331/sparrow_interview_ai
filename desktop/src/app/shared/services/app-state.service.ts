import { Injectable } from '@angular/core';

interface StoredUser {
  id: string;
  fullName: string;
  preferredLanguage: string;
  token?: string;
}

@Injectable({ providedIn: 'root' })
export class AppStateService {
  private readonly userKey = 'sparrow.currentUser';
  private readonly sessionKey = 'sparrow.currentSessionId';

  get currentUser(): StoredUser | null {
    try {
      const raw = localStorage.getItem(this.userKey);
      return raw ? (JSON.parse(raw) as StoredUser) : null;
    } catch {
      return null;
    }
  }

  get currentUserId(): string | null {
    return this.currentUser?.id ?? null;
  }

  get authToken(): string | null {
    return this.currentUser?.token ?? null;
  }

  get preferredLanguage(): string {
    return this.currentUser?.preferredLanguage ?? 'en';
  }

  saveUser(user: StoredUser): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  clearUser(): void {
    localStorage.removeItem(this.userKey);
  }

  saveCurrentSessionId(sessionId: string): void {
    localStorage.setItem(this.sessionKey, sessionId);
  }

  getCurrentSessionId(): string | null {
    return localStorage.getItem(this.sessionKey);
  }

  clearCurrentSessionId(): void {
    localStorage.removeItem(this.sessionKey);
  }
}
