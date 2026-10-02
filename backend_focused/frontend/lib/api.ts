// One function per endpoint. Paths keep their trailing slash: Django can redirect a GET
// without it, but a POST without it fails.
import { apiClient } from './api-client';
import type {
  DuplicateField,
  MaintenanceRecordInput,
  Mechanic,
  MechanicWorkload,
  Office,
  OfficeSummary,
  Paginated,
  Vehicle,
  VehicleDetail,
  VehicleDue,
  VehicleInput,
  HistoryRecord,
} from './types';

type Params = Record<string, string | number | boolean>;

// The API caps page_size at 100; offices (12) and mechanics (40) fit in one page.
const ALL = { page_size: 100 };

export async function fetchVehicles(params: Params, signal?: AbortSignal) {
  const { data } = await apiClient.get<Paginated<Vehicle>>('/vehicles/', { params, signal });
  return data;
}

export async function fetchVehicle(id: number, signal?: AbortSignal) {
  const { data } = await apiClient.get<VehicleDetail>(`/vehicles/${id}/`, { signal });
  return data;
}

export async function fetchVehicleHistory(
  id: number,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
) {
  const { data } = await apiClient.get<Paginated<HistoryRecord>>(
    `/vehicles/${id}/maintenance-history/`,
    {
      params: { page, page_size: pageSize },
      signal,
    },
  );
  return data;
}

export async function createVehicle(input: VehicleInput) {
  const { data } = await apiClient.post<Vehicle>('/vehicles/', input);
  return data;
}

export async function updateVehicle(id: number, changes: Partial<VehicleInput>) {
  const { data } = await apiClient.patch<Vehicle>(`/vehicles/${id}/`, changes);
  return data;
}

export async function deleteVehicle(id: number) {
  await apiClient.delete(`/vehicles/${id}/`);
}

export async function assignOffice(id: number, office: number) {
  const { data } = await apiClient.post<Vehicle>(`/vehicles/${id}/assign-office/`, { office });
  return data;
}

export async function checkDuplicates(params: Params, signal?: AbortSignal) {
  const { data } = await apiClient.get<{ conflicts: DuplicateField[] }>(
    '/vehicles/duplicate-check/',
    {
      params,
      signal,
    },
  );
  return data.conflicts;
}

export async function fetchVehiclesDue(page: number, pageSize: number, signal?: AbortSignal) {
  const { data } = await apiClient.get<Paginated<VehicleDue>>('/vehicles/needing-maintenance/', {
    params: { page, page_size: pageSize },
    signal,
  });
  return data;
}

export async function fetchOffices(signal?: AbortSignal) {
  const { data } = await apiClient.get<Paginated<Office>>('/offices/', { params: ALL, signal });
  return data.results;
}

export async function fetchOfficeSummary(signal?: AbortSignal) {
  const { data } = await apiClient.get<OfficeSummary[]>('/offices/summary/', { signal });
  return data;
}

export async function fetchMechanics(signal?: AbortSignal) {
  const { data } = await apiClient.get<Paginated<Mechanic>>('/mechanics/', { params: ALL, signal });
  return data.results;
}

export async function fetchMechanicWorkload(signal?: AbortSignal) {
  const { data } = await apiClient.get<MechanicWorkload[]>('/mechanics/workload/', { signal });
  return data;
}

export async function createMaintenanceRecord(input: MaintenanceRecordInput) {
  const { data } = await apiClient.post('/maintenance-records/', input);
  return data;
}

export async function deleteMaintenanceRecord(id: number) {
  await apiClient.delete(`/maintenance-records/${id}/`);
}
