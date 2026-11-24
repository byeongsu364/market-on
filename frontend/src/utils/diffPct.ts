export const diffPct = (seen: number, reference: number) =>
  reference > 0 ? Math.round(((seen - reference) / reference) * 100) : 0;
