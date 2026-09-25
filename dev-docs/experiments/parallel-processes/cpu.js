// Stays in registers and L1: sensitive to a busy sibling hyperthread and to the turbo budget.
export default {
  xorshift: n => {
    let x = 2463534242;
    for (let i = 0; i < n; ++i) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
    }
    return x;
  }
};
