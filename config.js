export const loadConfig = async () => {
  try {
    const dotenv = await import("dotenv");
    const { getArgs } = await import("./helpers.js");

    dotenv.default.config();

    return getArgs();
  } catch (error) {
    console.error("Error loading configuration:", error);
    process.exit(1);
  }
};

export const args = await loadConfig();
