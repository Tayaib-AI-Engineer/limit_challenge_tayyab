import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { isIsoDate } from './format';
import { normalizeIdentifier } from './rules';

// The vehicle search lives in the URL, with the API's own parameter names, so that a
// search can be bookmarked, shared, reloaded and restored by the Back button. Parsing is
// strict: a value the API would reject (active=maybe, a malformed date) is dropped and
// reported instead of failing the whole search.

export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

// The fields the API can sort by (VehicleViewSet.ordering_fields), minus the internal id.
export const SORT_FIELDS = ['license_plate', 'vin', 'make', 'model', 'year'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type Ordering = SortField | `-${SortField}`;

export type VehicleSearch = {
  office: number | null;
  active: boolean | null;
  make: string;
  model: string;
  maintenance_from: string;
  maintenance_to: string;
  mechanic_certification: string;
  ordering: Ordering | null;
  page: number;
  page_size: PageSize;
};

export const EMPTY_SEARCH: VehicleSearch = {
  office: null,
  active: null,
  make: '',
  model: '',
  maintenance_from: '',
  maintenance_to: '',
  mechanic_certification: '',
  ordering: null,
  page: 1,
  page_size: 20,
};

type ParamReader = { get(key: string): string | null };

export function parseVehicleSearch(params: ParamReader): {
  search: VehicleSearch;
  ignored: string[];
} {
  const search = { ...EMPTY_SEARCH };
  const ignored: string[] = [];
  const read = (key: string) => params.get(key)?.trim() ?? '';
  const reject = (key: string) => ignored.push(`${key}=${params.get(key)}`);

  const office = read('office');
  if (/^[1-9]\d*$/.test(office)) search.office = Number(office);
  else if (office) reject('office');

  const active = read('active').toLowerCase();
  if (active === 'true' || active === '1') search.active = true;
  else if (active === 'false' || active === '0') search.active = false;
  else if (active) reject('active');

  search.make = read('make');
  search.model = read('model');
  search.mechanic_certification = normalizeIdentifier(read('mechanic_certification'));

  for (const key of ['maintenance_from', 'maintenance_to'] as const) {
    const value = read(key);
    if (isIsoDate(value)) search[key] = value;
    else if (value) reject(key);
  }
  if (
    search.maintenance_from &&
    search.maintenance_to &&
    search.maintenance_from > search.maintenance_to
  ) {
    reject('maintenance_to');
    search.maintenance_to = '';
  }

  const ordering = read('ordering');
  if ((SORT_FIELDS as readonly string[]).includes(ordering.replace(/^-/, ''))) {
    search.ordering = ordering as Ordering;
  } else if (ordering) reject('ordering');

  const page = read('page');
  if (/^[1-9]\d*$/.test(page)) search.page = Number(page);
  else if (page) reject('page');

  const pageSize = Number(read('page_size'));
  if ((PAGE_SIZES as readonly number[]).includes(pageSize)) search.page_size = pageSize as PageSize;
  else if (read('page_size')) reject('page_size');

  return { search, ignored };
}

/** Query string with defaults left out and a stable key order, so equal searches give equal URLs. */
export function serializeVehicleSearch(search: VehicleSearch): string {
  const params = new URLSearchParams();
  if (search.office !== null) params.set('office', String(search.office));
  if (search.active !== null) params.set('active', String(search.active));
  if (search.make) params.set('make', search.make);
  if (search.model) params.set('model', search.model);
  if (search.maintenance_from) params.set('maintenance_from', search.maintenance_from);
  if (search.maintenance_to) params.set('maintenance_to', search.maintenance_to);
  if (search.mechanic_certification)
    params.set('mechanic_certification', search.mechanic_certification);
  if (search.ordering) params.set('ordering', search.ordering);
  if (search.page > 1) params.set('page', String(search.page));
  if (search.page_size !== EMPTY_SEARCH.page_size)
    params.set('page_size', String(search.page_size));
  return params.toString();
}

/** The same values as API parameters (they share names); also the React Query key. */
export function toApiParams(search: VehicleSearch): Record<string, string | number | boolean> {
  return Object.fromEntries(new URLSearchParams(serializeVehicleSearch(search)));
}

const FILTER_KEYS = [
  'office',
  'active',
  'make',
  'model',
  'maintenance_from',
  'maintenance_to',
  'mechanic_certification',
] as const;

export function countFilters(search: VehicleSearch): number {
  return FILTER_KEYS.filter((key) => search[key] !== null && search[key] !== '').length;
}

export const LAST_SEARCH_KEY = 'fleet.lastVehicleSearch';

export function useVehicleSearch() {
  const params = useSearchParams();
  const { search, ignored } = useMemo(() => parseVehicleSearch(params), [params]);

  const replace = useCallback((next: VehicleSearch) => {
    const query = serializeVehicleSearch(next);
    // The native History API updates useSearchParams without a server round trip
    // (Next docs: "Native History API"). Replace, not push: Back leaves the page rather
    // than undoing filter changes one by one.
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }, []);

  /** Apply changes; any change other than the page itself goes back to page 1. */
  const update = useCallback(
    (changes: Partial<VehicleSearch>) => {
      const page = 'page' in changes ? changes.page : 1;
      replace({ ...search, ...changes, page: page ?? 1 });
    },
    [search, replace],
  );

  /** Remove every filter; keep the sort order and page size. */
  const clearFilters = useCallback(
    () => replace({ ...EMPTY_SEARCH, ordering: search.ordering, page_size: search.page_size }),
    [search, replace],
  );

  return { search, ignored, update, replace, clearFilters };
}
