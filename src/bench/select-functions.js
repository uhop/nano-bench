export const selectFunctions = (fns, requested = []) => {
  const available = Object.keys(fns).filter(name => typeof fns[name] === 'function');
  if (available.length < 1) throw new Error('The exported object has no functions to measure');
  if (!requested.length) return available;
  for (const name of requested) {
    if (!available.includes(name))
      throw new Error(`Method not found: ${name}. Available: ${available.join(', ')}`);
  }
  return requested;
};

export default selectFunctions;
