import type { Metadata } from 'next';
import { Suspense } from 'react';

import { VehicleSearchPage } from '@/components/vehicles/VehicleSearchPage';

export const metadata: Metadata = { title: 'Vehicles' };

export default function VehiclesPage() {
  // The search lives in the URL (useSearchParams), which requires a Suspense boundary.
  return (
    <Suspense>
      <VehicleSearchPage />
    </Suspense>
  );
}
