const { execSync } = require("child_process");

execSync("npx electron-builder --win", {
  stdio: "inherit",
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
});
