export function nextRunAt(frequency: 'daily' | 'weekly', from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + (frequency === 'daily' ? 1 : 7));
  return next;
}
