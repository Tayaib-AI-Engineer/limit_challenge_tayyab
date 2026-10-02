import type { Metadata } from 'next';

import { EditVehiclePage } from '@/components/vehicles/VehicleFormPages';

export const metadata: Metadata = { title: 'Edit vehicle' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditVehiclePage id={id} />;
}
