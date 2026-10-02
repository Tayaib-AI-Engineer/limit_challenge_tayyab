import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import * as api from './api';
import { mechanicKeys, officeKeys, vehicleKeys } from './query-keys';
import type { MaintenanceRecordInput, VehicleInput } from './types';

const REFERENCE_DATA_STALE_TIME = 5 * 60_000; // offices and mechanics rarely change

// ---- Queries ---------------------------------------------------------------------------

export function useVehicleList(params: Record<string, string | number | boolean>) {
  return useQuery({
    queryKey: vehicleKeys.list(params),
    queryFn: ({ signal }) => api.fetchVehicles(params, signal),
    // Keep showing the previous results while the next search loads, instead of a skeleton.
    placeholderData: keepPreviousData,
  });
}

export function useVehicle(id: number, enabled = true) {
  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: ({ signal }) => api.fetchVehicle(id, signal),
    enabled,
  });
}

export function useVehicleHistory(id: number, page: number, pageSize: number) {
  return useQuery({
    queryKey: vehicleKeys.history(id, page, pageSize),
    queryFn: ({ signal }) => api.fetchVehicleHistory(id, page, pageSize, signal),
    placeholderData: keepPreviousData,
  });
}

export const DUE_PAGE_SIZE = 20;

export function useVehiclesDue(page: number) {
  return useQuery({
    queryKey: vehicleKeys.due(page, DUE_PAGE_SIZE),
    queryFn: ({ signal }) => api.fetchVehiclesDue(page, DUE_PAGE_SIZE, signal),
    placeholderData: keepPreviousData,
  });
}

export function useDuplicateCheck(
  params: Record<string, string | number | boolean>,
  enabled: boolean,
) {
  return useQuery({
    queryKey: vehicleKeys.duplicateCheck(params),
    queryFn: ({ signal }) => api.checkDuplicates(params, signal),
    enabled,
    staleTime: 0,
  });
}

export function useOffices() {
  return useQuery({
    queryKey: officeKeys.list(),
    queryFn: ({ signal }) => api.fetchOffices(signal),
    staleTime: REFERENCE_DATA_STALE_TIME,
  });
}

export function useOfficeSummary() {
  return useQuery({
    queryKey: officeKeys.summary(),
    queryFn: ({ signal }) => api.fetchOfficeSummary(signal),
  });
}

export function useMechanics() {
  return useQuery({
    queryKey: mechanicKeys.list(),
    queryFn: ({ signal }) => api.fetchMechanics(signal),
    staleTime: REFERENCE_DATA_STALE_TIME,
  });
}

// ---- Mutations -------------------------------------------------------------------------

/**
 * After any write, mark everything derived from vehicles and records as stale: lists,
 * details, histories, the due list, the office summary and the workload. Only queries on
 * screen refetch right away, so this is cheap. Returning the promise keeps the mutation
 * pending until fresh data has arrived. (No optimistic updates: the server rejects too
 * much - uniqueness, inactive mechanics, office moves - for guesses to be worth it.)
 */
function refreshFleetData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: vehicleKeys.all }),
    queryClient.invalidateQueries({ queryKey: officeKeys.summary() }),
    queryClient.invalidateQueries({ queryKey: mechanicKeys.workload() }),
  ]);
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleInput) => api.createVehicle(input),
    onSuccess: () => refreshFleetData(queryClient),
  });
}

export function useUpdateVehicle(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: Partial<VehicleInput>) => api.updateVehicle(id, changes),
    onSuccess: () => refreshFleetData(queryClient),
  });
}

export function useDeleteVehicle(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteVehicle(id),
    onSuccess: () => {
      // The page is about to navigate away; don't refetch a vehicle that no longer exists.
      queryClient.removeQueries({ queryKey: vehicleKeys.detail(id) });
      return refreshFleetData(queryClient);
    },
  });
}

export function useAssignOffice(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (office: number) => api.assignOffice(id, office),
    onSuccess: () => refreshFleetData(queryClient),
  });
}

export function useCreateMaintenanceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MaintenanceRecordInput) => api.createMaintenanceRecord(input),
    onSuccess: () => refreshFleetData(queryClient),
  });
}

export function useDeleteMaintenanceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteMaintenanceRecord(id),
    onSuccess: () => refreshFleetData(queryClient),
  });
}
