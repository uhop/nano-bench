import process from 'node:process';

export const rusageAvailable = () => {
  try {
    return typeof process.resourceUsage == 'function' && !!process.resourceUsage();
  } catch {
    return false;
  }
};

export const rusageDelta = (before, after) => ({
  cpuUser: after.userCPUTime - before.userCPUTime,
  cpuSystem: after.systemCPUTime - before.systemCPUTime,
  minorPageFault: after.minorPageFault - before.minorPageFault,
  majorPageFault: after.majorPageFault - before.majorPageFault,
  voluntaryContextSwitches: after.voluntaryContextSwitches - before.voluntaryContextSwitches,
  involuntaryContextSwitches: after.involuntaryContextSwitches - before.involuntaryContextSwitches
});

export default rusageDelta;
