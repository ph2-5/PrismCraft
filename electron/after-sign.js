/**
 * Electron Builder After Sign Hook
 * 用于 macOS 公证
 */

const { notarize } = require("@electron/notarize");
const path = require("path");

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  // 仅对 macOS 进行公证
  if (electronPlatformName !== "darwin") {
    return;
  }

  // 检查是否启用公证
  if (process.env.CODE_SIGN_ENABLED !== "true") {
    console.log("[AfterSign] 代码签名未启用，跳过公证");
    return;
  }

  // 检查必要的公证环境变量
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      "[AfterSign] 缺少公证所需的环境变量 (APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID)，跳过公证"
    );
    return;
  }

  // 获取应用名称
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[AfterSign] 开始公证: ${appPath}`);

  try {
    await notarize({
      tool: "notarytool",
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    });

    console.log("[AfterSign] 公证完成");
  } catch (error) {
    console.error("[AfterSign] 公证失败:", error);

    // 在 CI 中，公证失败应该导致构建失败
    if (process.env.CI) {
      throw error;
    }
  }
}

module.exports = afterSign;
