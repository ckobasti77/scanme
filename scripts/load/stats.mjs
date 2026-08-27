// TASK-24 — latency/throughput arithmetic for the load harness. Pure functions,
// no I/O; run.mjs feeds it sample rows and prints what it returns.

export function percentiles(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    n: sorted.length,
    p50: Math.round(at(50)),
    p95: Math.round(at(95)),
    p99: Math.round(at(99)),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

// samples: [{ step, at, ms, ok, cls }] with `at` in ms from run start.
export function summarize(samples) {
  const bySteps = {};
  for (const sample of samples) {
    const entry = (bySteps[sample.step] ??= {
      ok: 0,
      failed: 0,
      failures: {},
      latencies: [],
    });
    if (sample.ok) {
      entry.ok += 1;
      entry.latencies.push(sample.ms);
    } else {
      entry.failed += 1;
      entry.failures[sample.cls] = (entry.failures[sample.cls] ?? 0) + 1;
    }
  }
  const out = {};
  for (const [step, entry] of Object.entries(bySteps)) {
    out[step] = {
      ok: entry.ok,
      failed: entry.failed,
      failures: entry.failures,
      latency: percentiles(entry.latencies),
    };
  }
  return out;
}

// Commits over time: 10-second buckets of { commits, p50 ms } so the SHAPE of
// the curve (does throughput degrade as the session grows?) is visible.
export function buckets(samples, stepName, bucketMs = 10_000) {
  const rows = samples.filter((s) => s.step === stepName && s.ok);
  if (rows.length === 0) return [];
  const out = new Map();
  for (const row of rows) {
    const key = Math.floor(row.at / bucketMs);
    const bucket = out.get(key) ?? { latencies: [] };
    bucket.latencies.push(row.ms);
    out.set(key, bucket);
  }
  const keys = [...out.keys()].sort((a, b) => a - b);
  return keys.map((key) => {
    const latencies = out.get(key).latencies;
    return {
      t: `${(key * bucketMs) / 1000}s`,
      count: latencies.length,
      perSec: +(latencies.length / (bucketMs / 1000)).toFixed(1),
      p50: percentiles(latencies).p50,
    };
  });
}
