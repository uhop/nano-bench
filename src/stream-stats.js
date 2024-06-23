// based on https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance

export class StatCounter {
  constructor() {
    this.count = this.mean = this.M2 = this.M3 = this.M4 = 0;
  }

  add(value) {
    const n = ++this.count,
      delta = value - this.mean,
      term1 = delta / n,
      term2 = delta * term1 * (n - 1),
      term3 = term1 * term1;

    this.mean += delta / n;
    this.M4 += term3 * term2 * ((n - 3) * n + 3) + 6 * term3 * this.M2 - 4 * term1 * this.M3;
    this.M3 += term1 * term2 * (n - 2) - 3 * term1 * this.M2;
    this.M2 += term2;
  }

  get variance() {
    return this.M2 / this.count;
  }

  get sampleVariance() {
    return this.M2 / (this.count - 1);
  }

  get skewness() {
    return (Math.sqrt(this.count) * this.M3) / Math.pow(this.M2, 1.5);
  }

  get kurtosis() {
    return (this.count * this.M4) / (this.M2 * this.M2) - 3;
  }

  clone() {
    const newStatCounter = new StatCounter();

    newStatCounter.count = this.count;
    newStatCounter.mean = this.mean;
    newStatCounter.M2 = this.M2;
    newStatCounter.M3 = this.M3;
    newStatCounter.M4 = this.M4;

    return newStatCounter;
  }
}

export const streamStats = iterable => {
  const statCounter = new StatCounter();

  for (const value of iterable) {
    statCounter.add(value);
  }

  return {
    count: statCounter.count,
    mean: statCounter.mean,
    variance: statCounter.variance,
    sampleVariance: statCounter.sampleVariance,
    skewness: statCounter.skewness,
    kurtosis: statCounter.kurtosis
  };
};

export default streamStats;
