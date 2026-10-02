import type { Metadata } from 'next';

import { NewVehiclePage } from '@/components/vehicles/VehicleFormPages';

export const metadata: Metadata = { title: 'Add vehicle' };

export default function Page() {
  return <NewVehiclePage />;
}
