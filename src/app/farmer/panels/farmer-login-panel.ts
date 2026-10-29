import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { NotifyService } from '../../core/notify.service';
import { runAction } from '../../shared/run-action';
import { Farmer, LinkCandidate } from '../farmer.models';
import { FarmersApi } from '../farmers.api';

/**
 * The farmer's self-service login: links an account holding the Farmer role (in the farmer's organization or farmer group) so the
 * farmer can see their own profile, farms, credits and payouts. The account itself is created by an administrator.
 */
@Component({
  selector: 'app-farmer-login-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatFormFieldModule, MatSelectModule, MatButtonModule],
  template: `
    <div class="tab-body" data-testid="farmer-login">
      @if (linked(); as l) {
        <p>Linked login: <strong>{{ l.full_name }}</strong> <span class="muted">{{ l.email }}</span></p>
      } @else {
        <p class="muted">No login is linked: the farmer cannot see their own payouts, credits or farms yet.</p>
      }
      @if (others().length) {
        <div class="row">
          <mat-form-field subscriptSizing="dynamic" class="wide"><mat-label>{{ linked() ? 'Link another login' : 'Login to link' }}</mat-label>
            <mat-select [(ngModel)]="selected" data-testid="login-select">
              @for (c of others(); track c.user_id) { <mat-option [value]="c.user_id">{{ c.full_name }} · {{ c.email }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <button mat-flat-button type="button" [disabled]="busy() || !selected" (click)="link()" data-testid="login-link">Link login</button>
        </div>
      } @else if (loaded()) {
        <p class="small muted">No other account with the Farmer role is available in this farmer's organization or farmer group. Ask an
          administrator to create the farmer's account (role Farmer), then link it here.</p>
      }
    </div>
  `,
  styles: `.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .wide { min-width: 280px; flex: 1; }`,
})
export class FarmerLoginPanel implements OnInit {
  readonly farmer = input.required<Farmer>();
  readonly changed = output<Farmer>();
  private readonly api = inject(FarmersApi);
  private readonly notify = inject(NotifyService);
  protected readonly busy = signal(false);
  protected readonly loaded = signal(false);
  protected readonly linked = signal<LinkCandidate | null>(null);
  protected readonly others = signal<LinkCandidate[]>([]);
  protected selected = '';

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.api.linkCandidates(this.farmer().id).subscribe((c) => {
      this.linked.set(c.find((x) => x.linked) ?? null);
      this.others.set(c.filter((x) => !x.linked));
      this.selected = '';
      this.loaded.set(true);
    });
  }

  protected link(): void {
    if (!this.selected) return;
    runAction(this.api.linkUser(this.farmer().id, this.selected), this.busy, this.notify, 'Login linked.', (f) => {
      this.changed.emit(f);
      this.reload();
    });
  }
}
