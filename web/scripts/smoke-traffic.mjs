// Smoke test: simulate users against a running Flagsmith experiment.
import { Flagsmith } from '@flagsmith/nodejs';

const [envKey, flag, event, n = '300'] = process.argv.slice(2);
const api = process.env.SMOKE_SDK_API_URL ?? 'http://localhost:8000/api/v1/';
const fs = new Flagsmith({
  environmentKey: envKey,
  apiUrl: api,
  enableEvents: true,
  eventProcessorConfig: { eventsApiUrl: api.replace(/v1\/?$/, '') },
});

const rate = { control: 0.25, treatment: 0.4 };
const tally = {};
for (let i = 0; i < Number(n); i++) {
  const id = `smoke-${Date.now()}-${i}`;
  const f = await fs.getExperimentFlag(flag, id);
  const v = String(f.value);
  tally[v] ??= { exposed: 0, converted: 0 };
  tally[v].exposed++;
  if (Math.random() < (rate[v] ?? 0.25)) {
    fs.trackEvent(event, { identifier: id });
    tally[v].converted++;
  }
}
await fs.close();
console.log(JSON.stringify(tally));
