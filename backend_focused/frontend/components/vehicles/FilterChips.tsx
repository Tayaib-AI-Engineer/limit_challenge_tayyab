'use client';

import { Button, Chip, Stack } from '@mui/material';

import { formatDate } from '@/lib/format';
import type { Mechanic, Office } from '@/lib/types';
import type { VehicleSearch } from '@/lib/vehicle-search';

type Props = {
  search: VehicleSearch;
  update: (changes: Partial<VehicleSearch>) => void;
  clearFilters: () => void;
  offices: Office[];
  mechanics: Mechanic[];
};

/** Every active filter as a removable chip, so the current search is readable at a glance. */
export function FilterChips({ search, update, clearFilters, offices, mechanics }: Props) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  if (search.office !== null) {
    const office = offices.find((o) => o.id === search.office);
    chips.push({
      key: 'office',
      label: `Office: ${office?.name ?? `#${search.office}`}`,
      remove: () => update({ office: null }),
    });
  }
  if (search.active !== null) {
    chips.push({
      key: 'active',
      label: search.active ? 'Active only' : 'Inactive only',
      remove: () => update({ active: null }),
    });
  }
  if (search.make) {
    chips.push({ key: 'make', label: `Make: ${search.make}`, remove: () => update({ make: '' }) });
  }
  if (search.model) {
    chips.push({
      key: 'model',
      label: `Model: ${search.model}`,
      remove: () => update({ model: '' }),
    });
  }
  if (search.maintenance_from || search.maintenance_to) {
    const from = search.maintenance_from ? formatDate(search.maintenance_from) : '…';
    const to = search.maintenance_to ? formatDate(search.maintenance_to) : '…';
    chips.push({
      key: 'dates',
      label: `Serviced ${from} – ${to}`,
      remove: () => update({ maintenance_from: '', maintenance_to: '' }),
    });
  }
  if (search.mechanic_certification) {
    const mechanic = mechanics.find(
      (m) => m.certification_number === search.mechanic_certification,
    );
    chips.push({
      key: 'mechanic',
      label: `Mechanic: ${mechanic?.name ?? search.mechanic_certification}`,
      remove: () => update({ mechanic_certification: '' }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onDelete={chip.remove} />
      ))}
      <Button size="small" onClick={clearFilters}>
        Clear all
      </Button>
    </Stack>
  );
}
