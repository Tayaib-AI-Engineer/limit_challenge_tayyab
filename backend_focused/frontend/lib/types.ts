// Shapes returned by the Fleet Maintenance API (backend/fleet/serializers.py).
// Dates are calendar dates as `YYYY-MM-DD` strings; money is a JSON number.

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type Office = {
  id: number;
  name: string;
  city: string;
};

export type OfficeSummary = Office & {
  active_vehicle_count: number;
  maintenance_cost_last_year: number;
  last_maintenance: string | null;
};

/** List / create / update shape: the office as an id plus its name. */
export type Vehicle = {
  id: number;
  vin: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  office: number;
  office_name: string;
  active: boolean;
};

export type VehicleDue = Vehicle & {
  last_maintenance: string | null;
  days_since_last_maintenance: number | null;
};

export type MechanicBrief = {
  id: number;
  name: string;
  certification_number: string;
};

export type Mechanic = MechanicBrief & { active: boolean };

export type MechanicWorkload = Mechanic & {
  maintenance_count: number;
  total_cost: number;
};

export const MAINTENANCE_TYPES = {
  oil_change: 'Oil change',
  tire_rotation: 'Tire rotation',
  brake_service: 'Brake service',
  inspection: 'Inspection',
  engine_repair: 'Engine repair',
  transmission: 'Transmission',
  battery: 'Battery',
  other: 'Other',
} as const;

export type MaintenanceType = keyof typeof MAINTENANCE_TYPES;

/** A record inside a vehicle's history: the vehicle is implied. */
export type HistoryRecord = {
  id: number;
  date: string;
  maintenance_type: MaintenanceType;
  cost: number;
  notes: string;
  mechanic: MechanicBrief;
};

/** Detail shape: the office nested, plus the complete history, newest first. */
export type VehicleDetail = Omit<Vehicle, 'office' | 'office_name'> & {
  office: Office;
  maintenance_records: HistoryRecord[];
};

export type MaintenanceRecordInput = {
  vehicle: number;
  mechanic: number;
  date: string;
  maintenance_type: MaintenanceType;
  cost: string;
  notes: string;
};

export type VehicleInput = {
  vin: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  office: number;
  active: boolean;
};

export type DuplicateField = 'vin' | 'license_plate';
