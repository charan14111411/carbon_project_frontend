import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiError } from '../core/api/api.models';
import { label } from '../farmer/farmer.models';
import { MrvCalculationsPanel } from '../mrv/panels/mrv-calculations-panel';
import { PageHeader } from '../shared/page-header';
import { READ_ONLY } from '../shared/read-only';
import { StateView } from '../shared/state-view';
import { StatusBadge } from '../shared/status-badge';
import { CalculationApi } from './calculation.api';
import { CalcProject, calcBadge } from './calculation.models';

/** Calculations workspace (`calculation.read` only): pick a project in monitoring and a period; readiness and runs follow. */
@Component({
  selector: 'app-calculations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MrvCalculationsPanel, PageHeader, StateView, StatusBadge],
  // A CLOSED project's calculations stay readable; the panels then offer no action.
  providers: [{ provide: READ_ONLY, useFactory: () => inject(CalculationsPage).closed }],
  template: `
    <app-page-header title="Calculations" subtitle="Methodology calculations from frozen, approved MRV and laboratory inputs" />
    <app-state-view [loading]="loading()" [error]="error()" (retry)="ngOnInit()" />
    <div class="row">
      <mat-form-field subscriptSizing="dynamic" class="wide"><mat-label>Project</mat-label>
        <mat-select [ngModel]="projectId()" (ngModelChange)="pickProject($event)" data-testid="calc-project">
          @for (p of projects(); track p.id) { <mat-option [value]="p.id">{{ p.project_code }} · {{ p.name }}</mat-option> }
        </mat-select></mat-form-field>
      <mat-form-field subscriptSizing="dynamic" class="wide"><mat-label>Monitoring period</mat-label>
        <mat-select [ngModel]="periodId()" (ngModelChange)="pickPeriod($event)" data-testid="calc-period">
          @for (m of project()?.periods ?? []; track m.id) { <mat-option [value]="m.id">#{{ m.period_number }} {{ m.name }} · {{ label(m.status) }}</mat-option> }
        </mat-select></mat-form-field>
      @if (project(); as p) { <app-status-badge [status]="badge(p.status)" [text]="label(p.status)" />
        @if (p.environment === 'DEMO') { <app-status-badge status="DEMO" /> } }
    </div>
    @if (closed()) { <p class="note" data-testid="closed-note">This project is closed: its calculations are shown read-only.</p> }
    @if (project(); as p) {
      <app-mrv-calculations-panel [projectId]="p.id" [period]="period()" />
    } @else if (!projects().length && !loading() && !error()) {
      <p class="muted">No project of your organization is in monitoring yet.</p>
    }
  `,
  styles: `.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; } .wide { min-width: 280px; flex: 1; }`,
})
export class CalculationsPage implements OnInit {
  private readonly api = inject(CalculationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly label = label;
  protected readonly badge = calcBadge;
  protected readonly projects = signal<CalcProject[]>([]);
  protected readonly projectId = signal<string | null>(null);
  protected readonly periodId = signal<string | null>(null);
  protected readonly project = computed(() => this.projects().find((p) => p.id === this.projectId()) ?? null);
  protected readonly period = computed(() => this.project()?.periods.find((m) => m.id === this.periodId()) ?? null);
  readonly closed = computed(() => this.project()?.status === 'CLOSED');
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.loading.set(true);
    this.error.set(null);
    this.api.projects().subscribe({
      next: (ps) => {
        this.projects.set(ps);
        this.loading.set(false);
        const p = ps.find((x) => x.id === q.get('project')) ?? ps[0];
        if (p) this.select(p.id, q.get('period'));
      },
      error: (e: unknown) => { this.error.set(ApiError.from(e)); this.loading.set(false); },
    });
  }

  protected pickProject(id: string): void {
    this.select(id, null);
  }

  protected pickPeriod(id: string): void {
    this.periodId.set(id);
    void this.router.navigate([], { queryParams: { project: this.projectId(), period: id }, replaceUrl: true });
  }

  private select(projectId: string, periodId: string | null): void {
    this.projectId.set(projectId);
    const periods = this.project()?.periods ?? [];
    this.periodId.set((periods.find((m) => m.id === periodId) ?? periods[periods.length - 1])?.id ?? null);
  }
}
