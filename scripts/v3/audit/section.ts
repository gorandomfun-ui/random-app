/** Collects the report sections as each audit step finishes. */

export type Section = { title: string; body: string }

const collected: Section[] = []

export function addSection(title: string, body: string): void {
  collected.push({ title, body })
  console.log(`  ✓ ${title}`)
}

export function sections(): Section[] {
  return collected
}
