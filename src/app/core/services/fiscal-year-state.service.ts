import { Injectable, computed, effect, signal } from '@angular/core';
import { currentFiscalYear } from '../../shared/utils/date.util';

/** How many fiscal years the project list shows: 1 is the selected year alone; 3 and 5 count back from it. */
export type ListSpan = 1 | 3 | 5 | 'all';

export const LIST_SPANS: ListSpan[] = [1, 3, 5, 'all'];

const STORAGE_KEY = 'awp:fiscal-year-state:v1';

/**
 * The fiscal year chosen in the toolbar, shared by every page so it survives moving between them
 * (e.g. opening a project and coming back). Kept for the browser tab only (sessionStorage).
 */
@Injectable({ providedIn: 'root' })
export class FiscalYearStateService {
  readonly currentYear = currentFiscalYear();

  readonly year = signal(this.currentYear);
  readonly listSpan = signal<ListSpan>(1);

  readonly isPast = computed(() => this.year() < this.currentYear);

  constructor() {
    const saved = readSaved();
    if (saved) {
      if (Number.isInteger(saved.year)) this.year.set(saved.year!);
      if (LIST_SPANS.includes(saved.listSpan!)) this.listSpan.set(saved.listSpan!);
    }
    effect(() => {
      const state = { year: this.year(), listSpan: this.listSpan() };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // sessionStorage unavailable — the choice still holds until reload
      }
    });
  }

  resetToCurrent(): void {
    this.year.set(this.currentYear);
  }
}

function readSaved(): { year?: number; listSpan?: ListSpan } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
