"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadKeywordComboConfig = loadKeywordComboConfig;
exports.generateKeywordCombo = generateKeywordCombo;
exports.buildComboQueries = buildComboQueries;
exports.buildKeywordLabel = buildKeywordLabel;
exports.formatComboDebug = formatComboDebug;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
let cache = null;
async function readComboConfigFile() {
    const filePath = node_path_1.default.resolve(process.cwd(), 'lib/ingest/keywords/combo.json');
    const raw = await promises_1.default.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
}
async function statComboConfigFile() {
    const filePath = node_path_1.default.resolve(process.cwd(), 'lib/ingest/keywords/combo.json');
    const stats = await promises_1.default.stat(filePath);
    return stats.mtimeMs;
}
function clampProbability(value, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    if (value === undefined || value === null)
        return fallback;
    return Math.max(0, Math.min(1, value));
}
function normalizeList(list) {
    return {
        includeProbability: clampProbability(list?.includeProbability, 1),
        values: Array.isArray(list?.values)
            ? list.values
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter(Boolean)
            : [],
    };
}
function normalizeYearConfig(config) {
    let includeProbability = clampProbability(config?.includeProbability, 1);
    const noneProbability = clampProbability(config?.noneProbability, 0);
    if (includeProbability < noneProbability) {
        includeProbability = noneProbability;
    }
    const buckets = Array.isArray(config?.buckets)
        ? config.buckets
            .map((bucket) => ({
            label: typeof bucket?.label === 'string' ? bucket.label : undefined,
            from: Number.isFinite(bucket?.from) ? Math.floor(bucket.from) : NaN,
            to: Number.isFinite(bucket?.to) ? Math.floor(bucket.to) : NaN,
            weight: Number.isFinite(bucket?.weight) ? Math.max(0, bucket.weight) : 0,
        }))
            .filter((bucket) => bucket.weight > 0 && !Number.isNaN(bucket.from) && !Number.isNaN(bucket.to) && bucket.to >= bucket.from)
        : [];
    return { includeProbability, noneProbability, buckets };
}
function normalizeConfig(config) {
    return {
        wordPrimary: normalizeList(config?.wordPrimary ?? { includeProbability: 0, values: [] }),
        wordSecondary: normalizeList(config?.wordSecondary ?? { includeProbability: 0, values: [] }),
        countries: normalizeList(config?.countries ?? { includeProbability: 0, values: [] }),
        years: normalizeYearConfig(config?.years ?? { includeProbability: 0, noneProbability: 1, buckets: [] }),
    };
}
async function loadKeywordComboConfig(force = false) {
    const mtime = await statComboConfigFile();
    if (!force && cache && cache.mtimeMs === mtime) {
        return cache.config;
    }
    const rawConfig = await readComboConfigFile();
    const normalized = normalizeConfig(rawConfig);
    cache = { config: normalized, mtimeMs: mtime };
    return normalized;
}
function pickOne(values, rng) {
    if (!values.length)
        return undefined;
    const index = Math.floor(rng() * values.length);
    return values[index];
}
function maybePickFromList(list, rng) {
    if (!list.values.length)
        return undefined;
    if (rng() > list.includeProbability)
        return undefined;
    const value = pickOne(list.values, rng);
    return value;
}
function pickYearValue(config, rng) {
    if (!config.buckets.length)
        return undefined;
    const roll = rng();
    if (roll > config.includeProbability)
        return undefined;
    if (roll < config.noneProbability)
        return undefined;
    const totalWeight = config.buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
    if (totalWeight <= 0)
        return undefined;
    const target = rng() * totalWeight;
    let cumulative = 0;
    for (const bucket of config.buckets) {
        cumulative += bucket.weight;
        if (target <= cumulative) {
            if (bucket.from === bucket.to)
                return bucket.from;
            const span = bucket.to - bucket.from;
            const offset = Math.floor(rng() * (span + 1));
            return bucket.from + offset;
        }
    }
    const last = config.buckets[config.buckets.length - 1];
    return last ? last.to : undefined;
}
async function generateKeywordCombo(rng = Math.random) {
    const config = await loadKeywordComboConfig();
    const primary = maybePickFromList(config.wordPrimary, rng);
    const secondary = maybePickFromList(config.wordSecondary, rng);
    const country = maybePickFromList(config.countries, rng);
    const year = pickYearValue(config.years, rng);
    const tokens = [primary, secondary, country, year ? String(year) : undefined]
        .filter((value) => typeof value === 'string' && value.trim().length > 0);
    const query = tokens.join(' ').trim();
    return {
        query,
        components: {
            primary,
            secondary,
            country,
            year,
        },
    };
}
function buildComboQueries(count, rng = Math.random) {
    const tasks = Array.from({ length: Math.max(1, count) }, () => generateKeywordCombo(rng));
    return Promise.all(tasks);
}
function buildKeywordLabel(combo) {
    const parts = [combo.components.primary, combo.components.secondary, combo.components.country];
    if (combo.components.year)
        parts.push(String(combo.components.year));
    return parts.filter(Boolean).join(' • ');
}
function formatComboDebug(combo) {
    const { components } = combo;
    const segments = [
        components.primary ? `primary:${components.primary}` : null,
        components.secondary ? `secondary:${components.secondary}` : null,
        components.country ? `country:${components.country}` : null,
        components.year ? `year:${components.year}` : null,
    ].filter(Boolean);
    return segments.join(' | ');
}
