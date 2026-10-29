import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../core/api/api.service';
import { newKey } from '../core/api/idempotency';
import { DocumentRef } from '../lab/lab.models';
import {
  Account, Batch, BatchLineage, Issuance, OrgRef, PeriodRegistry, Registration, RegistryEvent, RegistryProject, Submission, SubmissionDetail,
} from './registry.models';

type Body = Record<string, unknown>;

/** Project-side registry API (`/registry`): registries are external counterparties; every manual record needs evidence. */
@Injectable({ providedIn: 'root' })
export class RegistryApi {
  private readonly api = inject(ApiService);
  private readonly b = '/registry';

  registries = (environment: string): Observable<OrgRef[]> => this.api.get(`${this.b}/organizations`, { environment });
  projects = (): Observable<RegistryProject[]> => this.api.get(`${this.b}/projects`);
  accounts = (organizationId?: string): Observable<Account[]> => this.api.get(`${this.b}/accounts`, { organization_id: organizationId });
  createAccount = (body: Body): Observable<Account> => this.api.post(`${this.b}/accounts`, body);
  configureAccount = (id: string, body: Body): Observable<Account> => this.api.post(`${this.b}/accounts/${id}/configure`, body);
  period = (projectId: string, periodId: string): Observable<PeriodRegistry> => this.api.get(`${this.b}/projects/${projectId}/periods/${periodId}`);
  createRegistration = (projectId: string, accountId: string): Observable<Registration> =>
    this.api.post(`${this.b}/projects/${projectId}/registrations`, { registry_account_id: accountId });
  registrationDoc = (id: string, file: File): Observable<DocumentRef> => this.api.upload(`${this.b}/registrations/${id}/documents`, file, {});
  recordRegistered = (id: string, body: Body): Observable<Registration> => this.api.post(`${this.b}/registrations/${id}/record-registered`, body);
  recordRegistrationRejected = (id: string, body: Body): Observable<Registration> => this.api.post(`${this.b}/registrations/${id}/record-rejected`, body);
  createSubmission = (projectId: string, body: Body, key = newKey()): Observable<Submission> =>
    this.api.post(`${this.b}/projects/${projectId}/submissions`, body, key);
  submission = (id: string): Observable<SubmissionDetail> => this.api.get(`${this.b}/submissions/${id}`);
  events = (id: string): Observable<RegistryEvent[]> => this.api.get(`${this.b}/submissions/${id}/events`);
  submissionDoc = (id: string, file: File, category: string, checklistItem?: string | null): Observable<DocumentRef> =>
    this.api.upload(`${this.b}/submissions/${id}/documents`, file, checklistItem ? { category, checklist_item: checklistItem } : { category });
  freeze = (id: string, key = newKey()): Observable<Submission> => this.api.post(`${this.b}/submissions/${id}/freeze`, {}, key);
  submit = (id: string, key = newKey()): Observable<Submission> => this.api.post(`${this.b}/submissions/${id}/submit`, {}, key);
  recordSubmitted = (id: string, body: Body, key = newKey()): Observable<Submission> =>
    this.api.post(`${this.b}/submissions/${id}/record-submitted`, body, key);
  recordQuery = (id: string, body: Body): Observable<RegistryEvent> => this.api.post(`${this.b}/submissions/${id}/record-query`, body);
  recordResponse = (id: string, body: Body, key = newKey()): Observable<Submission> =>
    this.api.post(`${this.b}/submissions/${id}/record-response`, body, key);
  withdraw = (id: string, body: Body): Observable<Submission> => this.api.post(`${this.b}/submissions/${id}/withdraw`, body);
  cancel = (id: string, reason: string): Observable<Submission> => this.api.post(`${this.b}/submissions/${id}/cancel`, { reason });
  /** `null` (no body) asks an API adapter to query the registry; MANUAL accounts send ReconcileIn (outcome + evidence document). */
  reconcile = (id: string, body: Body | null): Observable<Submission> => this.api.post(`${this.b}/submissions/${id}/reconcile`, body);
  recordIssuance = (submissionId: string, body: Body, key = newKey()): Observable<Issuance> =>
    this.api.post(`${this.b}/submissions/${submissionId}/issuances`, body, key);
  confirm = (id: string, note: string, key = newKey()): Observable<Issuance> => this.api.post(`${this.b}/issuances/${id}/confirm`, { note }, key);
  void = (id: string, reason: string, key = newKey()): Observable<Issuance> => this.api.post(`${this.b}/issuances/${id}/void`, { reason }, key);
  cancelIssuance = (id: string, body: Body): Observable<Issuance> => this.api.post(`${this.b}/issuances/${id}/cancel`, body);
}

/** Read-only credit batches (`/credits`). No inventory, transfer or retirement exists in Phase 9A. */
@Injectable({ providedIn: 'root' })
export class CreditsApi {
  private readonly api = inject(ApiService);

  batches = (projectId?: string, periodId?: string): Observable<Batch[]> =>
    this.api.get('/credits/batches', { project_id: projectId, period_id: periodId });
  batch = (id: string): Observable<Batch> => this.api.get(`/credits/batches/${id}`);
  lineage = (id: string): Observable<BatchLineage> => this.api.get(`/credits/batches/${id}/lineage`);
}
