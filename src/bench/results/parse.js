export const parseResults = (raw, source = 'results') => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${source}: not valid JSON`);
  }
  if (data?.schemaVersion !== 1) {
    throw new Error(`${source}: unsupported schemaVersion ${data?.schemaVersion} (expected 1)`);
  }
  return data;
};

export default parseResults;
