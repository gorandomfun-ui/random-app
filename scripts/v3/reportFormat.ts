/** Small Markdown helpers shared by the v3 report scripts. */

export function table(header: string[], rows: Array<Array<string | number>>): string {
  const head = `| ${header.join(' | ')} |`
  const rule = `|${header.map(() => '---').join('|')}|`
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n')
  return [head, rule, body].join('\n')
}

export function percent(part: number, whole: number): string {
  if (!whole) return '0 %'
  return `${((part / whole) * 100).toFixed(2)} %`
}

export function count(value: number): string {
  return value.toLocaleString('fr-FR')
}

export function day(value: Date | string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toISOString().slice(0, 10)
}
