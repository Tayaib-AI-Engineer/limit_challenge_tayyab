import { useEffect, useState, useSyncExternalStore } from 'react';

import { utcToday } from './format';
import { LAST_SEARCH_KEY } from './vehicle-search';

/** Today's UTC date, fixed for the life of the component. */
export function useToday(): string {
  const [today] = useState(utcToday);
  return today;
}

export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const noSubscription = () => () => {};

function lastSearchHref() {
  try {
    const query = window.sessionStorage.getItem(LAST_SEARCH_KEY);
    return query ? `/vehicles?${query}` : '/vehicles';
  } catch {
    return '/vehicles';
  }
}

/** The vehicle list as the user last left it (filters, sort, page), for "Back" links. */
export function useBackToVehiclesHref(): string {
  return useSyncExternalStore(noSubscription, lastSearchHref, () => '/vehicles');
}
