import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';

import { FALLBACK_MAP } from '../core/api/client-config.service';
import { errorInterceptor } from '../core/http/interceptors';

import { FarmFutureAreas, FarmFutureEstates, GeoGeometry } from './farm.models';
import { FarmFutureImportDialog, FarmFutureImportResult } from './panels/farmfuture-import-dialog';

const ESTATES_URL = '/api/v1/farms/f1/farmfuture/estates';
const AREAS_URL = '/api/v1/farms/f1/farmfuture/farms/ff-1/areas';

function poly(lon: number): GeoGeometry {
  return { type: 'Polygon', coordinates: [[[lon, 12], [lon + 0.001, 12], [lon + 0.001, 12.001], [lon, 12]]] };
}

const ESTATES: FarmFutureEstates = { phone_masked: '+91*******222', phone_source: 'FARMER_PRIMARY_PHONE', estates: [
  { estate_id: 'e1', name: 'Palthope estate', postal_code: '571250', is_fpo: false, farms: [
    { farm_id: 'ff-1', name: 'Palthope estate', postal_code: '571250', crops: ['Coffee-Robusta', 'Coffee-Arabica'], plants_per_hectare: 4000,
      is_owner_estate: true, active_subscription: true },
    { farm_id: 'ff-2', name: 'Bison Field', postal_code: null, crops: [], plants_per_hectare: null, is_owner_estate: false,
      active_subscription: false }] }] };

const AREAS: FarmFutureAreas = { farm_id: 'ff-1', combined_geojson: poly(76.05), devices: [{ name: 'Soilsync Hub', lat: 12.0, lon: 76.05, device_type: 4 }],
  zones: [
    { zone_id: 'z2', name: 'Zone-2', is_main: false, geojson: poly(76.05), vertex_count: 6, mean_altitude_m: 898.3 },
    { zone_id: 'z1', name: 'Zone-1', is_main: false, geojson: poly(76.06), vertex_count: 5, mean_altitude_m: null }] };

describe('FarmFutureImportDialog', () => {
  let http: HttpTestingController;
  let closed: FarmFutureImportResult | undefined;

  beforeEach(() => {
    closed = undefined;
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: { farmId: 'f1', farmerName: 'Asha Patil' } },
      { provide: MatDialogRef, useValue: { close: (r: FarmFutureImportResult) => (closed = r) } }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.match((r) => r.url.endsWith('/config/client')).forEach((r) => r.flush({ map: FALLBACK_MAP }));
    http.verify();
  });

  async function render() {
    const f = TestBed.createComponent(FarmFutureImportDialog);
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  it('uses the farmer phone on file, lists estates and farms, and returns the merged area by default', async () => {
    const f = await render();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain("Leave empty to use Asha Patil's phone number on file.");
    el.querySelector<HTMLButtonElement>('[data-testid="ff-find"]')!.click();
    const req = http.expectOne(ESTATES_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ phone_number: null });
    req.flush(ESTATES);
    f.detectChanges();
    const text = el.querySelector('[data-testid="ff-estates"]')?.textContent ?? '';
    expect(text).toContain('Palthope estate');
    expect(text).toContain('Coffee-Robusta, Coffee-Arabica');
    expect(text).toContain('4,000 plants/ha');
    expect(text).toContain('subscription inactive');
    expect(el.querySelector<HTMLButtonElement>('[data-testid="ff-use"]')!.disabled).toBe(true);

    el.querySelector<HTMLButtonElement>('.farm')!.click();
    const areas = http.expectOne(AREAS_URL);
    expect(areas.request.body).toEqual({ phone_number: null });
    areas.flush(AREAS);
    f.detectChanges();
    expect(el.textContent).toContain('Whole farm — all 2 areas merged');
    el.querySelector<HTMLButtonElement>('[data-testid="ff-use"]')!.click();
    expect(closed?.label).toBe('FarmFuture · Palthope estate · Palthope estate · all areas');
    expect(closed?.geojson).toEqual(AREAS.combined_geojson);
  });

  it('sends an entered number and explains a farm without mapped areas', async () => {
    const f = await render();
    const el = f.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('[data-testid="ff-phone"]')!;
    input.value = '+91 77996 61222';
    input.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('[data-testid="ff-find"]')!.click();
    const req = http.expectOne(ESTATES_URL);
    expect(req.request.body).toEqual({ phone_number: '+91 77996 61222' });
    req.flush({ ...ESTATES, phone_source: 'ENTERED' });
    f.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('.farm')[1].click();
    const areas = http.expectOne('/api/v1/farms/f1/farmfuture/farms/ff-2/areas');
    expect(areas.request.body).toEqual({ phone_number: '+91 77996 61222' });
    areas.flush({ farm_id: 'ff-2', zones: [], combined_geojson: null, devices: [] });
    f.detectChanges();
    expect(el.textContent).toContain('This farm has no mapped area in FarmFuture');
    expect(el.querySelector<HTMLButtonElement>('[data-testid="ff-use"]')!.disabled).toBe(true);
  });

  it('shows the server message when the number is unknown', async () => {
    const f = await render();
    const el = f.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-testid="ff-find"]')!.click();
    http.expectOne(ESTATES_URL).flush({ error_code: 'FARMFUTURE_USER_NOT_FOUND', message: 'FarmFuture has no user with this mobile number.' },
      { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('FarmFuture has no user with this mobile number.');
  });
});
