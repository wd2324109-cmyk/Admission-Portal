import { useState } from 'react';

export function usePage(...filters) {
  const key = JSON.stringify(filters);
  const [s, set] = useState({ key, page: 1 });
  return [s.key === key ? s.page : 1, page => set({ key, page })];
}
