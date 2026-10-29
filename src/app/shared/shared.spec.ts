import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ApiError } from '../core/api/api.models';
import { toParams } from '../core/api/api.service';
import { fieldSummary } from '../core/notify.service';
import { applyServerErrors, languageCode, passwordPolicyProblem } from './forms';
import { generateTemporaryPassword } from './password';
import { ReasonDialog } from './reason-dialog';
import { StatusBadge } from './status-badge';

describe('password policy (mirrors backend)', () => {
  it.each([
    ['short1', 'Use at least 12 characters.'],
    ['onlylettersaaaa', 'Include at least one letter and one digit.'],
    ['123456789012', 'Include at least one letter and one digit.'],
    [' Leading-space-1', 'Remove leading or trailing spaces.'],
  ])('rejects %s', (pw, msg) => expect(passwordPolicyProblem(pw)).toBe(msg));

  it('accepts a compliant password and generated temporary passwords', () => {
    expect(passwordPolicyProblem('Correct-Horse-42')).toBeNull();
    for (let i = 0; i < 20; i++) expect(passwordPolicyProblem(generateTemporaryPassword())).toBeNull();
  });
});

describe('applyServerErrors', () => {
  it('attaches field errors to controls and returns the rest', () => {
    const form = new FormGroup({ email: new FormControl('x') });
    const err = new ApiError(422, 'VALIDATION_FAILED', 'invalid', {
      errors: [{ field: 'email', message: 'not valid' }, { field: 'roles.0.role_code', message: 'unknown role' }],
    });
    expect(applyServerErrors(form, err)).toEqual(['unknown role']);
    expect(form.controls.email.getError('server')).toBe('not valid');
  });
});

describe('languageCode', () => {
  it('sends language codes lower-case (the API refuses "MR" or "en-IN") and blanks as null', () => {
    expect(languageCode(' MR ')).toBe('mr');
    expect(languageCode('en-IN')).toBe('en-in');
    expect(languageCode('  ')).toBeNull();
  });
});

describe('toParams', () => {
  it('drops empty values', () => {
    const p = toParams({ a: 'x', b: '', c: null, d: undefined, e: 0, f: false });
    expect(p.keys().sort()).toEqual(['a', 'e', 'f']);
  });
});

describe('StatusBadge', () => {
  it('maps statuses to tones and humanises labels', async () => {
    const f = TestBed.createComponent(StatusBadge);
    f.componentRef.setInput('status', 'SUSPENDED');
    await f.whenStable();
    const el = f.nativeElement.querySelector('span') as HTMLElement;
    expect(el.className).toContain('badge-warn');
    expect(el.textContent?.trim()).toBe('Suspended');
  });
});

describe('ReasonDialog', () => {
  it('requires a reason and returns it trimmed', async () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [ReasonDialog],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { title: 'Suspend?' } }, { provide: MatDialogRef, useValue: { close } }],
    });
    const f = TestBed.createComponent(ReasonDialog);
    await f.whenStable();
    const c = f.componentInstance as unknown as { form: FormGroup; submit(): void };
    c.submit();
    expect(close).not.toHaveBeenCalled();
    c.form.controls['reason'].setValue('  left the company  ');
    c.submit();
    expect(close).toHaveBeenCalledWith({ reason: 'left the company', password: undefined });
  });
});

describe('error notification field summary', () => {
  it('names the refused fields of a 422 and stays empty otherwise', () => {
    const e = new ApiError(422, 'VALIDATION_FAILED', 'The submitted data is invalid.', {
      errors: [{ field: 'actual_depth_top_cm', message: 'Decimal input should have no more than 1 decimal place' }],
    });
    expect(fieldSummary(e)).toBe(' — Actual depth top cm: Decimal input should have no more than 1 decimal place');
    expect(fieldSummary(new ApiError(409, 'CONFLICT', 'No.'))).toBe('');
  });
});

describe('DocumentsPanel', () => {
  it('preselects an offered category (e.g. LAND_RECORD from the land-records card) and ignores one that is not offered', async () => {
    const { provideHttpClient } = await import('@angular/common/http');
    const { DocumentsPanel } = await import('./documents-panel');
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const f = TestBed.createComponent(DocumentsPanel);
    f.componentRef.setInput('categories', ['LAND_TITLE', 'LAND_RECORD', 'OTHER']);
    f.componentRef.setInput('canUpload', true);
    f.componentRef.setInput('presetCategory', 'LAND_RECORD');
    f.detectChanges();
    const form = (f.componentInstance as unknown as { form: FormGroup }).form;
    expect(form.value.category).toBe('LAND_RECORD');
    f.componentRef.setInput('presetCategory', 'KYC_ID');
    f.detectChanges();
    expect(form.value.category).toBe('LAND_RECORD');
  });
});

describe('allPages', () => {
  it('pages through the whole list instead of stopping at 100', async () => {
    const { firstValueFrom, of } = await import('rxjs');
    const { allPages } = await import('./paged-list');
    const asked: number[] = [];
    const items = await firstValueFrom(allPages((q) => {
      asked.push(q.page);
      const start = (q.page - 1) * q.page_size;
      return of({ items: Array.from({ length: Math.max(0, Math.min(q.page_size, 230 - start)) }, (_, i) => start + i), total: 230,
        page: q.page, page_size: q.page_size });
    }));
    expect(asked).toEqual([1, 2, 3]);
    expect(items.length).toBe(230);
    expect(items[229]).toBe(229);
  });
});

describe('DocumentsPanel file input', () => {
  it('clears the input after a pick (the same file can be chosen again) and refuses files over the server limit', async () => {
    const { provideHttpClient } = await import('@angular/common/http');
    const { DocumentsPanel, MAX_UPLOAD_MB } = await import('./documents-panel');
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const f = TestBed.createComponent(DocumentsPanel);
    f.componentRef.setInput('canUpload', true);
    f.detectChanges();
    const panel = f.componentInstance as unknown as { pick(i: HTMLInputElement): void; file(): File | null };
    const input = (n: number, name = 'a.pdf') => {
      const file = new File(['x'], name);
      Object.defineProperty(file, 'size', { value: n });
      const el = { files: [file], value: 'fakepath/' + name } as unknown as HTMLInputElement;
      return el;
    };
    const ok = input(1024);
    panel.pick(ok);
    expect(panel.file()?.name).toBe('a.pdf');
    expect(ok.value).toBe('');
    panel.pick(input(MAX_UPLOAD_MB * 1024 * 1024 + 1, 'big.pdf'));
    expect(panel.file()).toBeNull();
    expect((f.nativeElement as HTMLElement).textContent).toContain(`max ${MAX_UPLOAD_MB} MB`);
  });
});
