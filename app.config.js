module.exports = ({ config }) => {
  const expiresAt = '2026-10-30T23:59:59.999Z';

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      license: {
        ...(config.extra?.license || {}),
        buildDate: new Date().toISOString(),
        expiresAt,
      },
    },
  };
};
