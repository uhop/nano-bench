export const buildResultsObject = ({
  pkg,
  createdAt,
  label,
  source,
  environment,
  params,
  series,
  significance
}) => ({
  schemaVersion: 1,
  tool: pkg.name,
  toolVersion: pkg.version,
  createdAt,
  ...(label ? {label} : {}),
  source,
  environment,
  params,
  results: series,
  ...(significance ? {significance} : {})
});

export default buildResultsObject;
