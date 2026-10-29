import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const endpoints = {
  gateway: { paths: ['/api/v1/places?page=1&limit=10', '/api/v1/routes?page=1&limit=10', '/api/v1/gamification/ranks'] },
  auth: { paths: ['/api/v1/gamification/ranks'] },
  trekking: { paths: ['/api/v1/places?page=1&limit=10', '/api/v1/routes?page=1&limit=10'] },
  checkin: { paths: ['/api/v1/checkins/me?page=1&limit=10'], token: true },
  agent: { paths: ['/api/v1/agent/conversations?page=1&limit=10'], token: true },
};
const service = __ENV.SERVICE || 'gateway';
const profile = __ENV.PROFILE || 'smoke';
const workload = __ENV.WORKLOAD || 'business';
if (!endpoints[service]) throw new Error('SERVICE must be gateway, auth, trekking, checkin or agent.');
if (!['smoke', 'capacity', 'stress'].includes(profile)) throw new Error('Invalid PROFILE.');
if (!['business', 'health'].includes(workload)) throw new Error('Invalid WORKLOAD.');
const baseUrl = (__ENV.BASE_URL || '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/?#@\s]+(?::\d+)?$/.test(baseUrl)) {
  throw new Error('Set BASE_URL to an HTTP(S) origin without a path or credentials.');
}
const token = (__ENV.AUTH_TOKEN || '').trim();
if (workload === 'business' && endpoints[service].token && !token) {
  throw new Error('This business workload requires AUTH_TOKEN (Agent requires an admin JWT).');
}
function numberSetting(name, fallback, min, max) {
  const value = Number(__ENV[name] === undefined ? fallback : __ENV[name]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}
function vusSetting(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error('VU levels must be integers between 1 and 500.');
  }
  return count;
}
const levels = profile === 'smoke' ? [1] : profile === 'capacity'
  ? [vusSetting(__ENV.VUS || 10)]
  : (__ENV.VU_STEPS || '1,5,10,20,50,100').split(',').map(vusSetting);
if (levels.some((v, i) => i > 0 && v <= levels[i - 1])) {
  throw new Error('VU_STEPS must be strictly increasing.');
}
const hold = numberSetting('HOLD_SECONDS', profile === 'smoke' ? 15 : 120, 1, 3600);
const ramp = numberSetting('RAMP_SECONDS', profile === 'smoke' ? 1 : 15, 1, 300);
const gap = numberSetting('GAP_SECONDS', 15, 1, 300);
const think = numberSetting('THINK_SECONDS', 1, 0.1, 30);
const p95 = numberSetting('P95_MS', 1500, 1, 60000);
const paths = workload === 'health' ? ['/health'] : endpoints[service].paths;
const headers = { Accept: 'application/json' };
if (workload === 'business' && token) headers.Authorization = `Bearer ${token}`;
const rateLimited = new Rate('rate_limited');
const requestFailed = new Rate('business_failed');
const expected200 = http.expectedStatuses(200);
const scenarios = {};
const thresholds = {};
const rounds = [];
let offset = 0;
for (let i = 0; i < levels.length; i++) {
  const name = `step_${i + 1}_${levels[i]}vus`;
  scenarios[name] = {
    executor: 'ramping-vus', startTime: `${offset}s`, startVUs: 0,
    stages: [
      { duration: `${ramp}s`, target: levels[i] },
      { duration: `${hold}s`, target: levels[i] },
      { duration: `${ramp}s`, target: 0 },
    ],
    gracefulRampDown: '10s', gracefulStop: '10s',
    tags: { service, workload, load_level: String(levels[i]) },
  };
  const tag = `{scenario:${name}}`;
  thresholds[`http_req_duration${tag}`] = [
    `p(95)<${p95}`,
    { threshold: `p(95)<${Math.max(5000, p95 * 3)}`, abortOnFail: true, delayAbortEval: '30s' },
  ];
  thresholds[`business_failed${tag}`] = [
    'rate<0.01',
    { threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '30s' },
  ];
  thresholds[`rate_limited${tag}`] = [
    'rate<0.01',
    { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
  ];
  thresholds[`http_reqs${tag}`] = ['count>0'];
  rounds.push({ name, vus: levels[i], startsAtSeconds: offset });
  // Leave room for the previous scenario's graceful stop before the next round.
  offset += ramp * 2 + hold + 10 + gap;
}

export const options = {
  scenarios, thresholds, discardResponseBodies: true,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  tags: { test_suite: 'trekvn-capacity', service, workload },
};

function get(path, phase) {
  return http.get(baseUrl + path, {
    headers, timeout: '10s', redirects: 0, responseCallback: expected200,
    tags: { name: path.split('?')[0], phase },
  });
}

export function setup() {
  // Validate every route/token once before starting concurrent traffic.
  for (const path of paths) {
    const result = get(path, 'preflight');
    if (result.status !== 200) {
      throw new Error(`Preflight failed: ${path.split('?')[0]} returned HTTP ${result.status}. Check URL, token, deployment or quota.`);
    }
  }
  console.log(`${service} / ${workload} / ${profile}: ${levels.join(' -> ')} VUs; hold ${hold}s; think ${think}s.`);
}

export default function () {
  // One GET per iteration. VUs rotate across routes without creating any data.
  const path = paths[__ITER % paths.length];
  const result = get(path, 'load');
  const ok = check(result, { 'HTTP 200': (r) => r.status === 200 });
  requestFailed.add(!ok);
  rateLimited.add(result.status === 429);
  sleep(think);
}

export function handleSummary(data) {
  const lines = [
    `TrekVN k6 | service=${service} workload=${workload} profile=${profile}`,
    `Hold=${hold}s, think=${think}s, SLO: p95<${p95}ms, failure<1%, 429<1%`,
    'Round | VUs | requests | p95 ms | failed % | 429 % | SLO',
  ];
  for (const round of rounds) {
    const metric = (name) => data.metrics[`${name}{scenario:${round.name}}`];
    const duration = metric('http_req_duration');
    const failed = metric('business_failed');
    const limited = metric('rate_limited');
    const requests = metric('http_reqs');
    const count = requests ? requests.values.count : 0;
    const evaluated = [duration, failed, limited, requests];
    const passed = count > 0 && evaluated.every((m) => m && Object.values(m.thresholds || {}).every((t) => t.ok));
    const value = (m, key, scale = 1) => m && Number.isFinite(m.values[key])
      ? (m.values[key] * scale).toFixed(2) : '-';
    lines.push(`${round.name} | ${round.vus} | ${count} | ${value(duration, 'p(95)')} | ${value(failed, 'rate', 100)} | ${value(limited, 'rate', 100)} | ${count ? (passed ? 'PASS' : 'FAIL') : 'NOT RUN'}`);
  }
  lines.push('A passing round is evidence for this read workload only, not a maximum real-user capacity.');
  const report = lines.join('\n') + '\n';
  const outputs = { stdout: report };
  if (__ENV.REPORT_PREFIX) {
    outputs[`${__ENV.REPORT_PREFIX}.txt`] = report;
    outputs[`${__ENV.REPORT_PREFIX}.json`] = JSON.stringify(data, null, 2);
  }
  return outputs;
}
