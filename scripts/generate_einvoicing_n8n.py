"""Generate n8n/workflows/UAE_EInvoicing_Readiness.json (importable workflow)."""
import json
import os
import uuid


def nid() -> str:
    return str(uuid.uuid4())


READINESS_CODE = r"""const items = $input.all();
const results = [];
for (const item of items) {
  const r = item.json;
  const revenue = parseFloat(String(r['Annual Revenue AED'] ?? r['Annual Revenue AED '] ?? '0').replace(/,/g, '')) || 0;
  const asp = String(r['ASP Appointed'] ?? '').toUpperCase() === 'YES';
  const fmt = String(r['Current Invoice Format'] ?? '');
  const integration = String(r['Integration Status'] ?? 'not_started');
  const masterClean = String(r['Master Data Clean'] ?? '').toUpperCase();
  const budget = String(r['ERP Upgrade Budget Confirmed'] ?? '').toUpperCase() === 'YES';
  const invPm = parseInt(String(r['Invoices Per Month'] ?? '0'), 10) || 0;
  const business = String(r['Business Type'] ?? '');

  let phase = 'out_of_scope';
  let phaseLabel = 'Out of scope / not in Phase 1 mandate';
  if (revenue >= 50000000) {
    phase = 'phase_1';
    phaseLabel = 'Phase 1 (Revenue ≥ AED 50M) — CRITICAL';
  } else if (revenue >= 1) {
    phase = 'phase_2';
    phaseLabel = 'Phase 2 (other businesses)';
  }

  let score = 100;
  const gaps = [];
  if (!asp) { score -= 35; gaps.push({ level: 'critical', text: 'No accredited ASP appointed' }); }
  if (['PDF','Paper','Email'].includes(fmt)) { score -= 25; gaps.push({ level: 'high', text: 'Invoice format not Peppol / PINT AE ready' }); }
  if (integration === 'not_started') { score -= 15; gaps.push({ level: 'high', text: 'ERP / ASP integration not started' }); }
  if (masterClean === 'NO' || masterClean === 'PARTIAL') { score -= 12; gaps.push({ level: 'high', text: 'Master data not clean for e-invoicing' }); }
  if (!budget) { score -= 8; gaps.push({ level: 'medium', text: 'ERP upgrade budget not confirmed' }); }
  if (invPm > 500 && integration !== 'live') { score -= 5; gaps.push({ level: 'medium', text: 'High invoice volume without live integration' }); }
  if (business === 'B2C' && revenue < 50000000) { score -= 5; }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const aspDeadline = new Date('2026-07-31T23:59:59Z');
  const goLive = revenue >= 50000000 ? new Date('2027-01-01T00:00:00Z') : new Date('2027-07-01T00:00:00Z');
  const today = new Date();
  const daysAsp = Math.ceil((aspDeadline - today) / 86400000);
  const daysLive = Math.ceil((goLive - today) / 86400000);

  let costLow = 150000, costHigh = 400000;
  if (revenue >= 50000000) { costLow = 650000; costHigh = 1850000; }
  else if (revenue >= 10000000) { costLow = 350000; costHigh = 950000; }

  const penaltyExposure = (!asp && revenue >= 50000000) ? 60000 : 5000;

  let urgency = 'GREEN';
  if (phase === 'phase_1' && score < 40) urgency = 'RED';
  else if (phase === 'phase_1' || score < 55) urgency = 'AMBER';

  const criticalGaps = gaps.filter(g => g.level === 'critical').length;
  const highGaps = gaps.filter(g => g.level === 'high').length;

  const ctx = JSON.stringify({
    company: r['Company Name'],
    trn: r['TRN Number'],
    revenue,
    phase,
    phaseLabel,
    score,
    urgency,
    gaps,
    daysAsp,
    daysLive,
    costLow,
    costHigh,
    penaltyExposure,
    criticalGaps,
    highGaps,
    fmt,
    integration,
    asp,
    business,
    entity: r['Entity Type'],
  });

  const prompt = `You are a UAE tax technology advisor. Ministerial Decisions 243/244 (2025) set e-invoicing timelines (Phase 1 revenue ≥ AED 50M go-live 1 Jan 2027; ASP appointment by 31 Jul 2026). Peppol PINT AE is the technical baseline.

Engine output (JSON): ${ctx}

Write a concise CFO-ready advisory (max 450 words) with sections: (1) Executive summary (2) Phase & deadlines (3) Top gaps & remediation (4) Cost & resourcing (5) Next 3 actions this week. Use AED. Be direct; no markdown code fences.`;

  results.push({ json: { ...r, _readiness: { phase, phaseLabel, score, urgency, gaps, daysAsp, daysLive, costLow, costHigh, penaltyExposure, criticalGaps, highGaps }, claudeUserMessage: prompt } });
}
return results;"""

COMPILE_CODE = r"""const anth = $input.first().json;
const itemIndex = $itemIndex;
const bases = $('Calculate E-Invoicing Readiness').all();
const base = bases[itemIndex].json;
const text = anth.content && anth.content[0] && anth.content[0].text ? anth.content[0].text : JSON.stringify(anth);
const z = base._readiness;
const now = new Date().toISOString().slice(0, 10);
const tracker = {
  'Assessment Date': now,
  'Company': base['Company Name'],
  'TRN': base['TRN Number'],
  'Phase': z.phaseLabel,
  'Readiness Score': z.score,
  'Urgency': z.urgency,
  'Critical Gaps': z.criticalGaps,
  'High Gaps': z.highGaps,
  'Days to ASP Deadline': z.daysAsp,
  'Days to Go-Live': z.daysLive,
  'Est Cost Low AED': z.costLow,
  'Est Cost High AED': z.costHigh,
  'Penalty Exposure AED': z.penaltyExposure,
  'ASP Appointed': base['ASP Appointed'],
  'ASP Name': base['ASP Name'] || '',
  'Status': 'DONE',
};
return [{ json: { intake: base, readiness: z, advisory_text: text, tracker, emailTo: base['CFO Email'], advisorCc: base['Tax Advisor Email'] || '', slackChannel: base['Slack Channel'] } }];"""


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "n8n", "workflows")
    os.makedirs(out_dir, exist_ok=True)

    nodes = [
        {
            "parameters": {"rule": {"interval": [{"field": "cronExpression", "expression": "0 8 * * 1"}]}},
            "id": nid(),
            "name": "Weekly Schedule",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.2,
            "position": [0, 0],
        },
        {
            "parameters": {
                "assignments": {
                    "assignments": [
                        {
                            "id": nid(),
                            "name": "spreadsheetId",
                            "value": "YOUR_GOOGLE_SHEET_ID_HERE",
                            "type": "string",
                        },
                    ]
                },
                "options": {},
            },
            "id": nid(),
            "name": "Set Sheet IDs",
            "type": "n8n-nodes-base.set",
            "typeVersion": 3.4,
            "position": [220, 0],
        },
        {
            "parameters": {
                "assignments": {
                    "assignments": [
                        {"id": nid(), "name": "anthropicModel", "value": "claude-opus-4-7", "type": "string"},
                    ]
                },
                "options": {},
            },
            "id": nid(),
            "name": "Set API Constants",
            "type": "n8n-nodes-base.set",
            "typeVersion": 3.4,
            "position": [220, 160],
        },
        {
            "parameters": {
                "operation": "read",
                "documentId": {
                    "__rl": True,
                    "value": "={{ $('Set Sheet IDs').first().json.spreadsheetId }}",
                    "mode": "id",
                },
                "sheetName": {"__rl": True, "value": "E-Invoicing Intake", "mode": "name"},
                "options": {},
            },
            "id": nid(),
            "name": "Read Intake Sheet",
            "type": "n8n-nodes-base.googleSheets",
            "typeVersion": 4.5,
            "position": [440, 0],
        },
        {
            "parameters": {"jsCode": READINESS_CODE},
            "id": nid(),
            "name": "Calculate E-Invoicing Readiness",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [660, 0],
        },
        {
            "parameters": {
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                    "conditions": [
                        {
                            "id": nid(),
                            "leftValue": "={{ $json.Status }}",
                            "rightValue": "READY",
                            "operator": {"type": "string", "operation": "equals"},
                        },
                    ],
                    "combinator": "and",
                },
                "options": {},
            },
            "id": nid(),
            "name": "Filter Status READY",
            "type": "n8n-nodes-base.filter",
            "typeVersion": 2.2,
            "position": [880, 0],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "https://api.anthropic.com/v1/messages",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "x-api-key", "value": "YOUR_ANTHROPIC_API_KEY"},
                        {"name": "anthropic-version", "value": "2023-06-01"},
                        {"name": "content-type", "value": "application/json"},
                    ]
                },
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ model: $('Set API Constants').first().json.anthropicModel, max_tokens: 4096, messages: [{ role: 'user', content: $json.claudeUserMessage }] }) }}",
            },
            "id": nid(),
            "name": "Claude Advisory (Opus 4.7)",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1100, 0],
        },
        {
            "parameters": {"jsCode": COMPILE_CODE},
            "id": nid(),
            "name": "Compile Tracker + Email Payload",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1320, 0],
        },
        {
            "parameters": {
                "operation": "append",
                "documentId": {
                    "__rl": True,
                    "value": "={{ $('Set Sheet IDs').first().json.spreadsheetId }}",
                    "mode": "id",
                },
                "sheetName": {"__rl": True, "value": "E-Invoicing Tracker", "mode": "name"},
                "columns": {
                    "mappingMode": "defineBelow",
                    "value": {
                        "Assessment Date": "={{ $json.tracker['Assessment Date'] }}",
                        "Company": "={{ $json.tracker.Company }}",
                        "TRN": "={{ $json.tracker.TRN }}",
                        "Phase": "={{ $json.tracker.Phase }}",
                        "Readiness Score": "={{ $json.tracker['Readiness Score'] }}",
                        "Urgency": "={{ $json.tracker.Urgency }}",
                        "Critical Gaps": "={{ $json.tracker['Critical Gaps'] }}",
                        "High Gaps": "={{ $json.tracker['High Gaps'] }}",
                        "Days to ASP Deadline": "={{ $json.tracker['Days to ASP Deadline'] }}",
                        "Days to Go-Live": "={{ $json.tracker['Days to Go-Live'] }}",
                        "Est Cost Low AED": "={{ $json.tracker['Est Cost Low AED'] }}",
                        "Est Cost High AED": "={{ $json.tracker['Est Cost High AED'] }}",
                        "Penalty Exposure AED": "={{ $json.tracker['Penalty Exposure AED'] }}",
                        "ASP Appointed": "={{ $json.tracker['ASP Appointed'] }}",
                        "ASP Name": "={{ $json.tracker['ASP Name'] }}",
                        "Status": "={{ $json.tracker.Status }}",
                    },
                },
                "options": {},
            },
            "id": nid(),
            "name": "Append Tracker Row",
            "type": "n8n-nodes-base.googleSheets",
            "typeVersion": 4.5,
            "position": [1540, -120],
        },
        {
            "parameters": {
                "sendTo": "={{ $json.emailTo }}",
                "subject": "=UAE E-Invoicing Readiness — {{ $json.intake['Company Name'] }}",
                "message": "={{ $json.advisory_text }}",
                "options": {"ccList": "={{ $json.advisorCc }}"},
            },
            "id": nid(),
            "name": "Email CFO + Tax Advisor",
            "type": "n8n-nodes-base.gmail",
            "typeVersion": 2.1,
            "position": [1540, 80],
        },
        {
            "parameters": {
                "select": "channel",
                "channelId": {"__rl": True, "value": "={{ $json.slackChannel }}", "mode": "name"},
                "text": "={{ '*UAE E-Invoicing Readiness*\\n' + $json.intake['Company Name'] + ' — Score ' + $json.readiness.score + '/100 (' + $json.readiness.urgency + ')' }}",
                "otherOptions": {},
            },
            "id": nid(),
            "name": "Slack Alert",
            "type": "n8n-nodes-base.slack",
            "typeVersion": 2.2,
            "position": [1540, 260],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "={{ ($env.GULFTAX_API_URL || 'http://127.0.0.1:8000') + '/api/automations/n8n/inbound/einvoicing_assessed' }}",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "X-N8N-Signature", "value": "={{ $env.GULFTAX_N8N_SECRET }}"},
                        {"name": "content-type", "value": "application/json"},
                    ]
                },
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ event: 'einvoicing_assessed', company: $json.intake['Company Name'], trn: $json.intake['TRN Number'], readiness: $json.readiness, advisory: $json.advisory_text }) }}",
            },
            "id": nid(),
            "name": "GulfTax Webhook",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1540, 440],
            "disabled": True,
        },
        {
            "parameters": {
                "content": "## UAE E-Invoicing Readiness\n- Replace sheet ID + Anthropic key in nodes (or use credentials).\n- Model: **claude-opus-4-7** via HTTP Messages API.\n- Filter keeps **Status = READY** rows.\n- Webhook disabled until Prompt 11 HMAC is implemented.",
                "height": 320,
                "width": 400,
            },
            "id": nid(),
            "name": "Sticky — Setup Notes",
            "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1,
            "position": [-200, -200],
        },
    ]

    connections = {
        "Weekly Schedule": {"main": [[{"node": "Set Sheet IDs", "type": "main", "index": 0}]]},
        "Set Sheet IDs": {
            "main": [
                [
                    {"node": "Read Intake Sheet", "type": "main", "index": 0},
                    {"node": "Set API Constants", "type": "main", "index": 0},
                ]
            ]
        },
        "Set API Constants": {"main": [[]]},
        "Read Intake Sheet": {"main": [[{"node": "Calculate E-Invoicing Readiness", "type": "main", "index": 0}]]},
        "Calculate E-Invoicing Readiness": {"main": [[{"node": "Filter Status READY", "type": "main", "index": 0}]]},
        "Filter Status READY": {"main": [[{"node": "Claude Advisory (Opus 4.7)", "type": "main", "index": 0}]]},
        "Claude Advisory (Opus 4.7)": {"main": [[{"node": "Compile Tracker + Email Payload", "type": "main", "index": 0}]]},
        "Compile Tracker + Email Payload": {
            "main": [
                [
                    {"node": "Append Tracker Row", "type": "main", "index": 0},
                    {"node": "Email CFO + Tax Advisor", "type": "main", "index": 0},
                    {"node": "Slack Alert", "type": "main", "index": 0},
                    {"node": "GulfTax Webhook", "type": "main", "index": 0},
                ]
            ]
        },
    }

    wf = {
        "name": "UAE E-Invoicing Readiness",
        "nodes": nodes,
        "connections": connections,
        "pinData": {},
        "meta": {"templateCredsSetupCompleted": False},
        "settings": {"executionOrder": "v1"},
    }

    path = os.path.join(out_dir, "UAE_EInvoicing_Readiness.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2)
    print("Wrote", path, "nodes", len(nodes))


if __name__ == "__main__":
    main()
