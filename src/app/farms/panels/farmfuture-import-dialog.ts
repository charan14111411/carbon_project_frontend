import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { Observable } from 'rxjs';

import { ApiError } from '../../core/api/api.models';
import { GeoMap, MapLayer, MapPoint } from '../../shared/geo-map';
import { FarmFutureAreas, FarmFutureEstates, FarmFutureFarm, GeoGeometry } from '../farm.models';
import { FarmsApi } from '../farms.api';

export interface FarmFutureImportData {
  farmId: string;
  farmerName: string;
}

export interface FarmFutureImportResult {
  geojson: GeoGeometry;
  /** e.g. "FarmFuture · Palthope estate · Zone-1" — shown next to the candidate. */
  label: string;
}

const ALL = 'all';

/**
 * Find the farm owner's FarmFuture estates and farms by mobile number, pick a farm and one of its mapped areas (or all of them
 * merged). Nothing is saved here: the chosen area goes back to the boundary editor, which checks it with SQL Server and saves it as
 * a new boundary version (source IMPORT) like any other boundary.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressBarModule, MatRadioModule, GeoMap],
  template: `
    <h2 mat-dialog-title>Import boundary from FarmFuture</h2>
    <mat-dialog-content>
      <form class="phone" (ngSubmit)="find()">
        <mat-form-field subscriptSizing="dynamic" class="grow"><mat-label>FarmFuture mobile number</mat-label>
          <input matInput type="tel" [formControl]="phone" autocomplete="off" placeholder="+91 98765 43210" data-testid="ff-phone" />
          <mat-hint>Leave empty to use {{ data.farmerName }}'s primary phone. Another number must first be added to the farmer's contacts.</mat-hint>
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy()" data-testid="ff-find"><mat-icon>search</mat-icon> Find farms</button>
      </form>
      @if (busy()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error(); as e) { <p class="form-error" role="alert">{{ e }}</p> }

      @if (estates(); as r) {
        <p class="muted small">FarmFuture account {{ r.phone_masked }}{{ r.phone_source === 'FARMER_PRIMARY_PHONE' ? ' (farmer’s phone on file)' : '' }}
          · {{ r.estates.length }} estate(s)</p>
        <div class="estates" data-testid="ff-estates">
          @for (e of r.estates; track e.estate_id) {
            <div class="estate">
              <strong>{{ e.name || 'Unnamed estate' }}</strong>
              <span class="muted small">{{ e.postal_code ? 'PIN ' + e.postal_code : '' }}{{ e.is_fpo ? ' · FPO' : '' }}</span>
            </div>
            @for (f of e.farms; track f.farm_id) {
              <button type="button" class="farm" [class.picked]="picked()?.farm_id === f.farm_id" (click)="pick(f)" [disabled]="busy()">
                <span class="name">{{ f.name || 'Unnamed farm' }}</span>
                <span class="muted small">
                  {{ f.crops.length ? f.crops.join(', ') : 'No crops listed' }}
                  @if (f.plants_per_hectare) { · {{ f.plants_per_hectare | number: '1.0-0' }} plants/ha }
                  @if (!f.active_subscription) { · subscription inactive }
                </span>
              </button>
            }
          } @empty { <p class="muted">No estates are linked to this number.</p> }
        </div>
      }

      @if (areas(); as a) {
        <h3>{{ picked()?.name }} — mapped areas</h3>
        @if (a.zones.length) {
          <mat-radio-group class="zones" [ngModel]="choice()" (ngModelChange)="choice.set($event)" aria-label="Area to import">
            @if (a.combined_geojson) {
              <mat-radio-button [value]="all">Whole farm — all {{ a.zones.length }} areas merged</mat-radio-button>
            }
            @for (z of a.zones; track z.zone_id; let i = $index) {
              <mat-radio-button [value]="'' + i">{{ z.name }} · {{ z.vertex_count }} corners{{ z.is_main ? ' · main outline' : '' }}
                @if (z.mean_altitude_m) { <span class="muted small"> · ~{{ z.mean_altitude_m | number: '1.0-0' }} m</span> }
              </mat-radio-button>
            }
          </mat-radio-group>
        } @else {
          <p class="muted">This farm has no mapped area in FarmFuture{{ a.devices.length ? ' (only sensor locations)' : '' }}.
            Draw the boundary, walk it with GPS or upload a file instead.</p>
        }
        <app-geo-map [layers]="layers()" [points]="points()" height="320px" defaultMode="2d" />
        <p class="muted small">The selected area is only a candidate: it is checked by SQL Server and you save it as a new boundary version.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button type="button" [disabled]="!selected()" (click)="use()" data-testid="ff-use">Use this area</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { min-width: min(640px, 86vw); }
    .phone { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 12px; }
    .grow { flex: 1; min-width: 220px; }
    .estates { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow: auto; margin-bottom: 8px; }
    .estate { display: flex; gap: 8px; align-items: baseline; margin-top: 8px; }
    .farm { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 8px 12px; cursor: pointer;
      border: 1px solid var(--mat-sys-outline-variant); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
    .farm:hover { background: var(--mat-sys-surface-container-low); }
    .farm.picked { border-color: var(--mat-sys-primary); background: var(--mat-sys-surface-container); }
    .name { font-weight: 600; }
    h3 { font: var(--mat-sys-title-small); margin: 12px 0 4px; }
    .zones { display: flex; flex-direction: column; margin-bottom: 8px; }
  `,
})
export class FarmFutureImportDialog {
  protected readonly data = inject<FarmFutureImportData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FarmFutureImportDialog, FarmFutureImportResult>);
  private readonly api = inject(FarmsApi);

  protected readonly all = ALL;
  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly estates = signal<FarmFutureEstates | null>(null);
  protected readonly picked = signal<FarmFutureFarm | null>(null);
  protected readonly areas = signal<FarmFutureAreas | null>(null);
  /** 'all' (merged) or the zone index as a string. */
  protected readonly choice = signal<string | null>(null);
  /** The number the estates were found with, so the areas call uses the same account. */
  private usedPhone: string | null = null;

  protected readonly selected = computed<FarmFutureImportResult | null>(() => {
    const a = this.areas();
    const c = this.choice();
    if (!a || c === null) return null;
    const estate = this.estates()?.estates.find((e) => e.farms.some((f) => f.farm_id === a.farm_id));
    const base = ['FarmFuture', estate?.name, this.picked()?.name].filter((x) => !!x).join(' · ');
    if (c === ALL) return a.combined_geojson ? { geojson: a.combined_geojson, label: `${base} · all areas` } : null;
    const z = a.zones[Number(c)];
    return z ? { geojson: z.geojson, label: `${base} · ${z.name}` } : null;
  });

  protected readonly layers = computed<MapLayer[]>(() => {
    const a = this.areas();
    const c = this.choice();
    if (!a) return [];
    return a.zones.map((z, i) => {
      const on = c === ALL || c === String(i);
      return { geojson: z.geojson, color: on ? '#e65100' : '#757575', dashed: !on, fillOpacity: on ? 0.3 : 0.05, label: z.name };
    });
  });

  protected readonly points = computed<MapPoint[]>(() =>
    (this.areas()?.devices ?? []).map((d) => ({ lat: d.lat, lon: d.lon, label: d.name, color: '#1565c0' })));

  protected find(): void {
    const phone = this.phone.value.trim() || null;
    this.run(this.api.farmFutureEstates(this.data.farmId, phone), (r) => {
      this.usedPhone = phone;
      this.estates.set(r);
      this.picked.set(null);
      this.areas.set(null);
      this.choice.set(null);
    });
  }

  protected pick(f: FarmFutureFarm): void {
    this.picked.set(f);
    this.areas.set(null);
    this.choice.set(null);
    this.run(this.api.farmFutureAreas(this.data.farmId, f.farm_id, this.usedPhone), (a) => {
      this.areas.set(a);
      const main = a.zones.findIndex((z) => z.is_main);
      this.choice.set(main >= 0 ? String(main) : a.combined_geojson ? ALL : a.zones.length ? '0' : null);
    });
  }

  protected use(): void {
    const s = this.selected();
    if (s) this.ref.close(s);
  }

  private run<T>(obs: Observable<T>, done: (v: T) => void): void {
    this.busy.set(true);
    this.error.set(null);
    obs.subscribe({
      next: (v) => {
        this.busy.set(false);
        done(v);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(ApiError.from(e).message);
      },
    });
  }
}

export function openFarmFutureImport(dialog: MatDialog, data: FarmFutureImportData): Observable<FarmFutureImportResult | undefined> {
  return dialog.open<FarmFutureImportDialog, FarmFutureImportData, FarmFutureImportResult>(FarmFutureImportDialog,
    { data, maxWidth: '92vw', autoFocus: 'first-tabbable' }).afterClosed();
}
