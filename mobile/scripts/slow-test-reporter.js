// Lightweight Jest reporter: lists every individual test slower than the threshold
// (seconds; reporter option `thresholdSeconds`, else jest `slowTestThreshold`, else 5).
// Informational only: it never fails the run. Jest's built-in `slowTestThreshold` only
// highlights whole files in the default reporter, not individual tests.
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
