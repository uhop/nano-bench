export class MedianCounter {
  constructor(limit = 10) {
    this.limit = limit;
    this.array = [];
  }

  add(value) {
    for (let i = 0; i < this.array.length; ++i) {
      const counter = this.array[i];

      if (counter.length < 3) {
        counter.push(value);
        return;
      }

      this.array[i] = [value];

      const a = counter[0],
        b = counter[1],
        c = counter[2];
      if (a < b) {
        value = b < c ? b : a < c ? c : a;
      } else {
        value = a < c ? a : b < c ? c : b;
      }
    }

    if (this.array.length < this.limit) {
      this.array.push([value]);
    } else {
      this.add(value);
    }
  }

  get() {
    const copy = this.clone();

    let value;

    while (copy.array.length) {
      const counter = copy.array.shift();

      switch (counter.length) {
        case 1:
          value = counter[0];
          break;
        case 2:
          {
            const a = counter[0],
              b = counter[1];
            value = a < b ? a : b;
          }
          break;
        case 3:
          {
            const a = counter[0],
              b = counter[1],
              c = counter[2];
            if (a < b) {
              value = b < c ? b : a < c ? c : a;
            } else {
              value = a < c ? a : b < c ? c : b;
            }
          }
          break;
      }

      if (!copy.array.length) break;

      copy.add(value);
    }

    return value;
  }

  clone() {
    const newMedian = new MedianCounter();
    for (const counter of this.array) {
      newMedian.array.push(counter.slice());
    }
    return newMedian;
  }
}

export const streamMedian = iterable => {
  const medianCounter = new MedianCounter();
  for (const value of iterable) {
    medianCounter.add(value);
  }
  return medianCounter.get();
};

export default streamMedian;
