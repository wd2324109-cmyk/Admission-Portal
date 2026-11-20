import { useState } from 'react';

// Page number that returns to 1 whenever any of the filter values change, without a second request.
export function usePage(...filters) {
  const key = JSON.stringify(filters);
  const [s, set] = useState({ key, page: 1 });
  return [s.key === key ? s.page : 1, page => set({ key, page })];
}
