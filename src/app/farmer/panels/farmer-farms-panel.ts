import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { FarmSummary } from '../../farms/farm.models';
import { FarmsApi } from '../../farms/farms.api';
import { ApiError } from '../../core/api/api.models';
import { formatArea } from '../../shared/geo';
import { allPages } from '../../shared/paged-list';
import { StateView } from '../../shared/state-view';
import { StatusBadge } from '../../shared/status-badge';
import { Farmer } from '../farmer.models';

@Component({
  selector: 'app-farmer-farms-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, StateView, StatusBadge],
  template: `
    <div class="tab-body">
      <app-state-view [error]="error()" (retry)="ngOnInit()" />
      @for (farm of farms(); track farm.id) {
        <a class="line" [routerLink]="['/farms', farm.id]">
          <mat-icon>agriculture</mat-icon>
          <span class="grow"><strong>{{ farm.farm_code }}</strong> · {{ farm.name }}
            <span class="muted small">{{ area(farm.area_hectares) }} · {{ farm.land_tenure }}</span></span>
          @if (farm.open_overlaps) { <app-status-badge status="WARNING" [text]="farm.open_overlaps + ' overlap'" /> }
          <app-status-badge [status]="farm.status === 'VERIFIED' ? 'ACTIVE' : farm.status" [text]="farm.status" />
        </a>
      } @empty { @if (!error()) { <p class="muted">No farms yet.</p> } }
      @if (canAdd()) {
        <a mat-flat-button [routerLink]="['/farms/new']" [queryParams]="{ farmer: farmer().id }"><mat-icon>add_location_alt</mat-icon> Add farm</a>
      } @else if (farmer().status === 'DRAFT') {
        <p class="muted small">Register the farmer before adding farms.</p>
      }
    </div>
  `,
  styles: `
    .line { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--mat-sys-outline-variant);
      color: inherit; text-decoration: none; }
    .grow { flex: 1; } a[mat-flat-button] { margin-top: 12px; }
  `,
})
export class FarmerFarmsPanel implements OnInit {
  readonly farmer = input.required<Farmer>();
  private readonly api = inject(FarmsApi);
  protected readonly farms = signal<FarmSummary[]>([]);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly area = formatArea;
  protected readonly canAdd = computed(() => this.farmer().can_manage && !['DRAFT', 'SUSPENDED'].includes(this.farmer().status));

  ngOnInit(): void {
    this.error.set(null);
    allPages((q) => this.api.list({ ...q, farmer_id: this.farmer().id })).subscribe({
      next: (farms) => this.farms.set(farms),
      error: (e: unknown) => this.error.set(ApiError.from(e)),
    });
  }
}
