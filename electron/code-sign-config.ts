/**
 * 代码签名配置
 *
 * 此文件定义代码签名的配置选项。
 * 实际签名需要在 CI/CD 环境中配置证书和密钥。
 */

export interface CodeSignConfig {
  /** 是否启用代码签名 */
  enabled: boolean;

  /** Windows 签名配置 */
  windows: {
    /** 证书来源: 'file' | 'azure-key-vault' | 'hardware-token' */
    certificateSource: "file" | "azure-key-vault" | "hardware-token";

    /** 证书文件路径（相对于项目根目录或绝对路径） */
    certificateFile?: string;

    /** 证书密码环境变量名 */
    certificatePasswordEnv?: string;

    /** Azure Key Vault 配置 */
    azureKeyVault?: {
      vaultName: string;
      certificateName: string;
      clientId: string;
      tenantId: string;
    };

    /** 签名时间戳服务器 */
    timestampServer: string;

    /** 签名算法 */
    digestAlgorithm: "sha256" | "sha384" | "sha512";
  };

  /** macOS 签名配置 */
  mac: {
    /** 证书类型: 'development' | 'distribution' */
    certificateType: "development" | "distribution";

    /** Apple Developer Team ID */
    teamId?: string;

    /** 证书名称（在 Keychain 中） */
    certificateName?: string;

    /** 是否启用公证 */
    notarize: boolean;

    /** Apple ID (用于公证) */
    appleId?: string;

    /** Apple ID 密码环境变量名 */
    appleIdPasswordEnv?: string;
  };
}

/**
 * 默认代码签名配置
 */
export const defaultCodeSignConfig: CodeSignConfig = {
  enabled: process.env.CODE_SIGN_ENABLED === "true",

  windows: {
    certificateSource: "file",
    certificatePasswordEnv: "WINDOWS_CERT_PASSWORD",
    timestampServer: "http://timestamp.digicert.com",
    digestAlgorithm: "sha256",
  },

  mac: {
    certificateType: "distribution",
    notarize: true,
    appleIdPasswordEnv: "APPLE_ID_PASSWORD",
  },
};

/**
 * 获取 Windows 签名配置
 */
export function getWindowsSignConfig(): Record<string, unknown> {
  const config = defaultCodeSignConfig;

  if (!config.enabled) {
    return {
      signAndEditExecutable: false,
    };
  }

  const baseConfig: Record<string, unknown> = {
    signAndEditExecutable: true,
    signingHashAlgorithms: ["sha256"],
    timestampServer: config.windows.timestampServer,
    publisherName: process.env.WINDOWS_PUBLISHER_NAME,
  };

  switch (config.windows.certificateSource) {
    case "file":
      return {
        ...baseConfig,
        certificateFile: process.env.WINDOWS_CERT_FILE,
        certificatePassword: process.env[config.windows.certificatePasswordEnv || "WINDOWS_CERT_PASSWORD"],
      };

    case "azure-key-vault":
      return {
        ...baseConfig,
        azureKeyVault: {
          vaultName: process.env.AZURE_KEY_VAULT_NAME,
          certificateName: process.env.AZURE_CERTIFICATE_NAME,
          clientId: process.env.AZURE_CLIENT_ID,
          tenantId: process.env.AZURE_TENANT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
      };

    case "hardware-token":
      return {
        ...baseConfig,
        signDlls: true,
        certificateSha1: process.env.WINDOWS_CERT_SHA1,
      };

    default:
      return baseConfig;
  }
}

/**
 * 获取 macOS 签名配置
 */
export function getMacSignConfig(): Record<string, unknown> {
  const config = defaultCodeSignConfig;

  if (!config.enabled) {
    return {
      identity: null,
    };
  }

  return {
    identity: process.env.MAC_CERTIFICATE_NAME || config.mac.certificateName,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "electron/entitlements.mac.plist",
    entitlementsInherit: "electron/entitlements.mac.plist",
    teamId: process.env.APPLE_TEAM_ID || config.mac.teamId,
  };
}

/**
 * 获取公证配置
 */
export function getNotarizeConfig(): Record<string, unknown> | null {
  const config = defaultCodeSignConfig;

  if (!config.enabled || !config.mac.notarize) {
    return null;
  }

  return {
    teamId: process.env.APPLE_TEAM_ID || config.mac.teamId,
    appleId: process.env.APPLE_ID || config.mac.appleId,
    appleIdPassword: process.env[config.mac.appleIdPasswordEnv || "APPLE_ID_PASSWORD"],
  };
}
