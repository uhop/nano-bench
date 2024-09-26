const isPalindromeSlice = s => {
  while (s.length > 1) {
    if (s[0] !== s[s.length - 1]) break;
    s = s.slice(1, -1);
  }
  return s.length <= 1;
};

const isPalindromeSubstring = s => {
  while (s.length > 1) {
    if (s[0] !== s[s.length - 1]) break;
    s = s.substring(1, s.length - 1);
  }
  return s.length <= 1;
};

const isPalindromeIndex = s => {
  if (s.length <= 1) return true;

  let l = 0, r = s.length - 1;
  while (l < r) {
    if (s[l] !== s[r]) break;
    ++l;
    --r;
  }

  return l >= r;
};

const charCodeA = 'A'.charCodeAt(0);

let sample = '';
for (let i = 100; i--; sample += String.fromCharCode(Math.floor(Math.random() * 26) + charCodeA));
sample += [...sample].reverse().join('');

export default {
  'using slice()': n => {
    for (let i = 0; i < n; ++i) {
      isPalindromeSlice(sample);
    }
  },
  'using substring()': n => {
    for (let i = 0; i < n; ++i) {
      isPalindromeSubstring(sample);
    }
  },
  'using index': n => {
    for (let i = 0; i < n; ++i) {
      isPalindromeIndex(sample);
    }
  }
};
