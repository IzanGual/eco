import { useEffect, useState } from 'react';
import { onHousehold, type Household } from './sync';

/** Espacio compartido de pareja actual (o null). */
export function useHousehold() {
  const [h, setH] = useState<Household | null>(null);
  useEffect(() => onHousehold(setH), []);
  return h;
}
