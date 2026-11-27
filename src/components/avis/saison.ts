/** La période des fêtes : du 20 novembre au 6 janvier inclus. */
export function enFetes(d = new Date()): boolean {
  const m = d.getMonth(); // 0 = janvier
  const j = d.getDate();
  return (m === 10 && j >= 20) || m === 11 || (m === 0 && j <= 6);
}
