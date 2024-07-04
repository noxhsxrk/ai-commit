export const loadConfig = async () => {
  const dotenv = await import("dotenv");
  const { getArgs } = await import("./helpers.js");

  dotenv.default.config();

  return getArgs();
};

export const args = await loadConfig();
