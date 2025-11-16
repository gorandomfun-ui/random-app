export function formatI18n(template: string, values: Record<string, string | number>): string {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}
