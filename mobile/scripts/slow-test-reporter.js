// Lightweight Jest reporter: lists every individual test slower than the threshold
// (seconds; reporter option `thresholdSeconds`, else jest `slowTestThreshold`, else 5).
// Informational only: it never fails the run. Jest's built-in `slowTestThreshold` only
// highlights whole files in the default reporter, not individual tests.
//
// Why the global `testTimeout: 20000` in package.json stays (package.json cannot hold comments):
// on 2026-11-25 it was removed to scope the 20 s to LaunchPermissionsPrompt only. With a cold
// transform cache, run 1 had 24 failed tests in 13 suites and 30 tests over 5 s (slowest 42.2 s);
// run 2 still had 3 failures with 6 tests over 5 s; run 3 passed. Many suites share the slow first
// render, so the global timeout is a backstop until the tests listed by this reporter are fixed.
class SlowTestReporter {
  constructor(globalConfig, options = {}) {
    const seconds = options.thresholdSeconds ?? globalConfig.slowTestThreshold ?? 5;
    this.thresholdMs = seconds * 1000;
    this.rootDir = globalConfig.rootDir;
    this.slow = [];
  }

  onTestResult(test, result) {
    for (const t of result.testResults) {
      if (typeof t.duration === 'number' && t.duration > this.thresholdMs) {
        const file = test.path.startsWith(this.rootDir)
          ? test.path.slice(this.rootDir.length + 1)
          : test.path;
        this.slow.push({ file, name: t.fullName, ms: t.duration });
      }
    }
  }

  onRunComplete() {
    const s = this.thresholdMs / 1000;
    if (this.slow.length === 0) {
      process.stderr.write(`\nSlow tests (> ${s} s): none\n`);
      return;
    }
    this.slow.sort((a, b) => b.ms - a.ms);
    process.stderr.write(`\nSlow tests (> ${s} s): ${this.slow.length}\n`);
    for (const t of this.slow) {
      process.stderr.write(`  ${(t.ms / 1000).toFixed(2)} s  ${t.file} > ${t.name}\n`);
    }
  }
}

module.exports = SlowTestReporter;
