"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaManager = void 0;
class QuotaManager {
    constructor(budgets = {}) {
        this.budgets = new Map();
        for (const [key, budget] of Object.entries(budgets)) {
            if (!budget)
                continue;
            this.addBudget(key, budget);
        }
    }
    addBudget(key, budget) {
        const reserveRatio = typeof budget.reserveRatio === 'number' ? Math.max(0, Math.min(0.9, budget.reserveRatio)) : 0.2;
        const limit = Number.isFinite(budget.limit) && budget.limit > 0 ? budget.limit : 0;
        this.budgets.set(key, {
            label: budget.label || key,
            limit,
            reserveRatio,
            consumed: 0,
        });
    }
    getUsage(key) {
        return this.budgets.get(key);
    }
    getUsageSnapshot() {
        const snapshot = {};
        for (const [key, value] of this.budgets.entries()) {
            snapshot[key] = { ...value };
        }
        return snapshot;
    }
    getRemaining(key) {
        const usage = this.budgets.get(key);
        if (!usage)
            return 0;
        return Math.max(0, usage.limit - usage.consumed);
    }
    getReserveThreshold(key) {
        const usage = this.budgets.get(key);
        if (!usage)
            return 0;
        return usage.limit * (1 - usage.reserveRatio);
    }
    canConsume(key, cost) {
        const usage = this.budgets.get(key);
        if (!usage)
            return false;
        if (cost <= 0)
            return true;
        const projected = usage.consumed + cost;
        const threshold = this.getReserveThreshold(key);
        return projected <= threshold;
    }
    consume(key, cost) {
        const usage = this.budgets.get(key);
        if (!usage)
            return false;
        if (cost <= 0)
            return true;
        if (!this.canConsume(key, cost))
            return false;
        usage.consumed += cost;
        return true;
    }
    hasRemaining(key) {
        return this.canConsume(key, 1);
    }
    shouldStop(key) {
        const usage = this.budgets.get(key);
        if (!usage)
            return true;
        return !this.hasRemaining(key);
    }
    isDepleted() {
        for (const key of this.budgets.keys()) {
            if (this.hasRemaining(key)) {
                return false;
            }
        }
        return true;
    }
}
exports.QuotaManager = QuotaManager;
