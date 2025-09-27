export type QuotaBudget = {
  label: string
  limit: number
  reserveRatio?: number
}

export type QuotaUsage = {
  label: string
  limit: number
  reserveRatio: number
  consumed: number
}

export class QuotaManager {
  private budgets = new Map<string, QuotaUsage>()

  constructor(budgets: Record<string, QuotaBudget | undefined> = {}) {
    for (const [key, budget] of Object.entries(budgets)) {
      if (!budget) continue
      this.addBudget(key, budget)
    }
  }

  addBudget(key: string, budget: QuotaBudget) {
    const reserveRatio = typeof budget.reserveRatio === 'number' ? Math.max(0, Math.min(0.9, budget.reserveRatio)) : 0.2
    const limit = Number.isFinite(budget.limit) && budget.limit > 0 ? budget.limit : 0
    this.budgets.set(key, {
      label: budget.label || key,
      limit,
      reserveRatio,
      consumed: 0,
    })
  }

  getUsage(key: string): QuotaUsage | undefined {
    return this.budgets.get(key)
  }

  getUsageSnapshot(): Record<string, QuotaUsage> {
    const snapshot: Record<string, QuotaUsage> = {}
    for (const [key, value] of this.budgets.entries()) {
      snapshot[key] = { ...value }
    }
    return snapshot
  }

  getRemaining(key: string): number {
    const usage = this.budgets.get(key)
    if (!usage) return 0
    return Math.max(0, usage.limit - usage.consumed)
  }

  getReserveThreshold(key: string): number {
    const usage = this.budgets.get(key)
    if (!usage) return 0
    return usage.limit * (1 - usage.reserveRatio)
  }

  canConsume(key: string, cost: number): boolean {
    const usage = this.budgets.get(key)
    if (!usage) return false
    if (cost <= 0) return true
    const projected = usage.consumed + cost
    const threshold = this.getReserveThreshold(key)
    return projected <= threshold
  }

  consume(key: string, cost: number): boolean {
    const usage = this.budgets.get(key)
    if (!usage) return false
    if (cost <= 0) return true
    if (!this.canConsume(key, cost)) return false
    usage.consumed += cost
    return true
  }

  hasRemaining(key: string): boolean {
    return this.canConsume(key, 1)
  }

  shouldStop(key: string): boolean {
    const usage = this.budgets.get(key)
    if (!usage) return true
    return !this.hasRemaining(key)
  }

  isDepleted(): boolean {
    for (const key of this.budgets.keys()) {
      if (this.hasRemaining(key)) {
        return false
      }
    }
    return true
  }
}
