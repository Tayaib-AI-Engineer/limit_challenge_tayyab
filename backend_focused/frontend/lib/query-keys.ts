// Hierarchical keys, so one invalidate call can refresh a whole family: invalidating
// vehicleKeys.all refreshes every list, detail and history page.
export const vehicleKeys = {
  all: ['vehicles'] as const,
  lists: () => [...vehicleKeys.all, 'list'] as const,
  list: (params: Record<string, string | number | boolean>) =>
    [...vehicleKeys.lists(), params] as const,
  detail: (id: number) => [...vehicleKeys.all, 'detail', id] as const,
  history: (id: number, page: number, pageSize: number) =>
    [...vehicleKeys.detail(id), 'history', { page, pageSize }] as const,
  due: (page: number, pageSize: number) => [...vehicleKeys.all, 'due', { page, pageSize }] as const,
  duplicateCheck: (params: Record<string, string | number | boolean>) =>
    [...vehicleKeys.all, 'duplicate-check', params] as const,
};

export const officeKeys = {
  all: ['offices'] as const,
  list: () => [...officeKeys.all, 'list'] as const,
  summary: () => [...officeKeys.all, 'summary'] as const,
};

export const mechanicKeys = {
  all: ['mechanics'] as const,
  list: () => [...mechanicKeys.all, 'list'] as const,
  workload: () => [...mechanicKeys.all, 'workload'] as const,
};
