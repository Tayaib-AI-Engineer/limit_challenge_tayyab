import type { Metadata } from 'next';

import { VehicleDetailPage } from '@/components/vehicles/VehicleDetailPage';

export const metadata: Metadata = { title: 'Vehicle' };

// Next 16: route params arrive as a Promise.
export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleDetailPage id={id} />;
}
