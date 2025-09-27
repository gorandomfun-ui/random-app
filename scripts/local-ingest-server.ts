import { createServer } from 'node:http'
import { runIngest, ALL_CATEGORIES, type Category, type RunSummary, type LogEvent } from './local-ingest'

type RunRequestBody = {
  categories?: Category[]
  dryRun?: boolean
  maxCombos?: number | null
  sleepMs?: number
}

const PORT = Number(process.env.LOCAL_INGEST_PORT || 7766)
const HOST = process.env.LOCAL_INGEST_HOST || '127.0.0.1'

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Local Ingest Runner</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f5f7fb; color: #1f2933; }
  h1 { margin-top: 0; }
  fieldset { border: 1px solid #cbd2d9; padding: 12px 16px 16px; margin-bottom: 16px; }
  legend { font-weight: 600; }
  label { display: inline-flex; align-items: center; gap: 6px; margin-right: 12px; margin-bottom: 8px; }
  button { cursor: pointer; border: none; background: #2563eb; color: white; padding: 10px 18px; border-radius: 6px; font-weight: 600; letter-spacing: 0.01em; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  input[type="number"] { width: 120px; padding: 6px 8px; }
  textarea, pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow: auto; font-size: 13px; }
  pre { max-height: 360px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e4e7eb; }
  th { background: #e4efff; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .pill.success { background: #dcfce7; color: #166534; }
  .pill.failed { background: #fee2e2; color: #991b1b; }
  .pill.skipped { background: #e0f2fe; color: #075985; }
  #status { margin-bottom: 12px; font-weight: 600; }
  .quick-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
</style>
</head>
<body>
  <h1>Local Ingest Runner</h1>
  <p>Use the controls below to trigger ingestion batches from your machine. Configure your <code>.env.local</code> before running.</p>

  <div id="status">Idle</div>

  <fieldset>
    <legend>Categories</legend>
    <div>
      ${ALL_CATEGORIES.map((cat) => `<label><input type="checkbox" class="cat-checkbox" value="${cat}" checked /> ${cat}</label>`).join('')}
    </div>
  </fieldset>

  <fieldset>
    <legend>Options</legend>
    <label><input type="checkbox" id="dryRun" /> Dry run (preview only)</label>
    <label>Max combos <input type="number" id="maxCombos" min="1" placeholder="auto" /></label>
    <label>Sleep (ms) <input type="number" id="sleepMs" min="0" placeholder="use default" /></label>
  </fieldset>

  <div class="quick-grid">
    <button type="button" id="runSelected">Run Selected</button>
    ${ALL_CATEGORIES.map((cat) => `<button type="button" class="quick" data-cat="${cat}">Run ${cat}</button>`).join('')}
  </div>

  <h2>Summary</h2>
  <div id="summary">No runs yet.</div>

  <h2>Log</h2>
  <pre id="log">No logs yet.</pre>

<script>
const categories = ${JSON.stringify(ALL_CATEGORIES)}
const statusEl = document.getElementById('status')
const summaryEl = document.getElementById('summary')
const logEl = document.getElementById('log')
const dryRunEl = document.getElementById('dryRun')
const maxCombosEl = document.getElementById('maxCombos')
const sleepMsEl = document.getElementById('sleepMs')
const categoryInputs = Array.from(document.querySelectorAll('.cat-checkbox'))
const quickButtons = Array.from(document.querySelectorAll('.quick'))
const runSelectedBtn = document.getElementById('runSelected')

let running = false

function getSelectedCategories() {
  const picked = categoryInputs.filter((input) => input.checked).map((input) => input.value)
  return picked.length ? picked : categories.slice()
}

function setRunning(flag) {
  running = flag
  statusEl.textContent = flag ? 'Running…' : 'Idle'
  runSelectedBtn.disabled = flag
  quickButtons.forEach((btn) => { btn.disabled = flag })
}

function formatDuration(ms) {
  return (ms / 1000).toFixed(1) + 's'
}

function renderSummary(summary) {
  if (!summary) {
    summaryEl.textContent = 'No runs yet.'
    return
  }
  const rows = summary.categories.map((cat) => {
    const pillClass = cat.status === 'completed' ? 'pill success' : cat.status === 'failed' ? 'pill failed' : 'pill skipped'
    const totals = cat.totals ? \`scanned:\${cat.totals.scanned} unique:\${cat.totals.unique} inserted:\${cat.totals.inserted} updated:\${cat.totals.updated}\` : '—'
    const detail = cat.reason ? cat.reason : cat.error ? cat.error : ''
    const extra = cat.combosExecuted != null ? \`Combos: \${cat.combosExecuted}\` : cat.requestsExecuted != null ? \`Requests: \${cat.requestsExecuted}\` : ''
    return \`
      <tr>
        <td>\${cat.name}</td>
        <td><span class="\${pillClass}">\${cat.status}</span></td>
        <td>\${formatDuration(cat.durationMs)}</td>
        <td>\${totals}</td>
        <td>\${extra}</td>
        <td>\${detail}</td>
      </tr>
    \`
  }).join('')

  summaryEl.innerHTML = \`
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Totals</th>
          <th>Extra</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>\${rows}</tbody>
    </table>
    <p><strong>Dry run:</strong> \${summary.dryRun ? 'Yes' : 'No'} · <strong>Total:</strong> \${formatDuration(summary.durationMs)}</p>
  \`
}

function renderLogs(logs) {
  if (!logs || !logs.length) {
    logEl.textContent = 'No logs yet.'
    return
  }
  const lines = logs.map((entry) => {
    const detail = entry.detail === undefined ? '' : \` → \${JSON.stringify(entry.detail)}\`
    return \`[\${entry.timestamp}] [\${entry.level.toUpperCase()}] [\${entry.category}] \${entry.message}\${detail}\`
  })
  logEl.textContent = lines.join('\n')
}

async function runIngest(payload) {
  setRunning(true)
  logEl.textContent = 'Running…'
  summaryEl.textContent = 'Running…'
  try {
    const res = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error || 'Run failed')
    }
    renderSummary(data.summary)
    renderLogs(data.summary?.logs || [])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    statusEl.textContent = \`Error: \${message}\`
    logEl.textContent = message
  } finally {
    setRunning(false)
  }
}

runSelectedBtn.addEventListener('click', () => {
  if (running) return
  const payload = {
    categories: getSelectedCategories(),
    dryRun: dryRunEl.checked,
    maxCombos: maxCombosEl.value ? Number(maxCombosEl.value) : null,
    sleepMs: sleepMsEl.value ? Number(sleepMsEl.value) : undefined,
  }
  runIngest(payload)
})

quickButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (running) return
    const category = button.dataset.cat
    if (!category) return
    const payload = {
      categories: [category],
      dryRun: dryRunEl.checked,
      maxCombos: maxCombosEl.value ? Number(maxCombosEl.value) : null,
      sleepMs: sleepMsEl.value ? Number(sleepMsEl.value) : undefined,
    }
    runIngest(payload)
  })
})
</script>
</body>
</html>`

let running = false

function sendJson(res: import('node:http').ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end('Bad Request')
    return
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  if (req.method === 'POST' && req.url === '/run') {
    if (running) {
      sendJson(res, 409, { ok: false, error: 'A run is already in progress.' })
      return
    }

    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', async () => {
      try {
        const body: RunRequestBody = raw ? JSON.parse(raw) : {}
        const categories = Array.isArray(body.categories) && body.categories.length
          ? body.categories.filter((value): value is Category => (ALL_CATEGORIES as readonly string[]).includes(value))
          : ALL_CATEGORIES.slice()
        const logs: LogEvent[] = []
        running = true
        const summary: RunSummary = await runIngest({
          categories,
          dryRun: body.dryRun,
          maxCombos: body.maxCombos != null ? body.maxCombos : undefined,
          sleepMs: body.sleepMs != null ? body.sleepMs : undefined,
          logger: (event) => logs.push(event),
        })
        summary.logs = logs
        sendJson(res, 200, { ok: true, summary })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sendJson(res, 500, { ok: false, error: message })
      } finally {
        running = false
      }
    })
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }).end()
    return
  }

  res.writeHead(404).end('Not Found')
}).listen(PORT, HOST, () => {
  console.log(`Local ingest UI running at http://${HOST}:${PORT}`)
})
