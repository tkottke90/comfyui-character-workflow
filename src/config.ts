import dotenv from 'dotenv';
import { Application } from 'express';
import { ConfigSchema } from './schemas/config.schema';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import yaml from 'yaml';
import _ from 'lodash';
import pkg from '../package.json';
import z from 'zod';

// Initialize the environment variables from the .env file
dotenv.config();

/**
 * Recursively replaces ${VAR_NAME} patterns in all string values of a config object
 * with the corresponding process.env value. Uppercase variable names only.
 * Missing env vars produce a warning and are replaced with an empty string.
 */
function interpolateEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        console.warn(
          `[Config] Warning: environment variable ${varName} not found, using empty string`,
        );
        return '';
      }
      return value;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
    }
    return result;
  }

  return obj;
}

function saveConfig(configPath: string, configData: Record<string, unknown>) {
  fs.writeFileSync(configPath, yaml.stringify(configData), 'utf-8');
}

function ensureConfigExists(configPath: string) {
  const dir = path.dirname(configPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    console.log('[App Startup] No config file found, creating default config at', configPath);
    saveConfig(configPath, ConfigSchema.parse({}));
  }
}

function validateConfig(configPath: string, configData: Record<string, unknown>) {
  // Get the default config by parsing an empty object (Zod will apply all defaults)
  const defaultConfig = ConfigSchema.parse({});

  // Track if we made any changes so we know whether to save
  let configChanged = false;

  // Check each top-level section and add missing ones from defaults
  for (const section in defaultConfig) {
    if (!(section in configData)) {
      console.log(`[Config Migration] Adding missing section: ${section}`);
      configData[section] = (defaultConfig as Record<string, unknown>)[section];
      configChanged = true;
    }
  }

  // Now validate the merged config
  const validationResult = ConfigSchema.safeParse(configData);

  if (!validationResult.success) {
    console.log(
      '[Config Validation] Config validation failed, applying defaults for invalid sections',
    );
    console.error(validationResult.error.format());

    // Deep merge defaults with user config, keeping user values where valid
    const mergedConfig = _.merge({}, defaultConfig, configData);

    // Validate the merged config
    const finalConfig = ConfigSchema.parse(mergedConfig);

    saveConfig(configPath, finalConfig);
    console.log('[Config Migration] Config migrated and saved');

    return finalConfig;
  }

  // If we added missing sections, save the updated config
  if (configChanged) {
    saveConfig(configPath, validationResult.data);
    console.log('[Config Migration] Config updated with missing sections');
  }

  return validationResult.data as Record<string, unknown>;
}

export default function initializeConfig(app: Application) {
  const configDir = path.resolve(
    process.env.CONFIG_DIR || path.join(os.homedir(), 'config/ai-assistant'),
  );
  const configFilePath = path.join(configDir, 'config.yaml');

  // Make sure we have a config file to read from
  ensureConfigExists(configFilePath);

  // Load the config file and set it on the app instance
  const configFile = fs.readFileSync(configFilePath, 'utf-8');

  // Validate the config file against our schema and apply defaults if missing
  // This will automatically migrate old configs by adding any missing sections.
  // Interpolate env vars before validation so secrets stay out of the config file.
  const rawConfig = interpolateEnvVars(yaml.parse(configFile)) as Record<string, unknown>;
  const configData: Record<string, unknown> = validateConfig(configFilePath, rawConfig);

  // Setup some internal config values
  configData.appVersion = pkg.version;
  configData.appName = 'AI Assistant 2';
  configData.assetDir = path.resolve(configDir, 'assets');

  // Set up a simple config getter on the app instance
  app.config = {
    _configData: configData,
    configPath: configFilePath,
    get: function (key: string, defaultValue: string = ''): string {
      // First check environment variables, then config file, then default value
      const envValue = process.env[key];
      if (envValue !== undefined) {
        return envValue;
      }

      return _.get(this._configData, key, defaultValue) as string;
    },

    getBoolean: function (key: string, defaultValue: boolean = false): boolean {
      return this.get(key, String(defaultValue)) === 'true';
    },

    getConfigDir: function (subPath: string = ''): string {
      const baseDir = path.dirname(this.configPath);

      // Ensure the directory exists
      const fullDir = path.resolve(baseDir, subPath);
      if (!fs.existsSync(fullDir)) {
        fs.mkdirSync(fullDir, { recursive: true });
      }

      return path.resolve(baseDir, subPath);
    },

    getNumber: function (key: string, defaultValue: number = 0): number {
      const val = this.get(key, String(defaultValue));

      const num = parseInt(val, 10);

      return isNaN(num) ? defaultValue : num;
    },
    has: function (key: string): boolean {
      return this.get(key) !== '';
    },
    loadConfig: function <T>(
      key: string,
      schema: T,
    ): T extends z.ZodTypeAny ? z.infer<T> : unknown {
      const configValue = _.get(this._configData, key);

      if (configValue === undefined) {
        throw new Error(`Config key "${key}" not found`);
      }

      if (schema instanceof z.ZodType) {
        const parsed = schema.safeParse(configValue);
        if (!parsed.success) {
          console.error(`Config key "${key}" failed validation:`, parsed.error.format());
          throw new Error(`Config key "${key}" failed validation`);
        }
        return parsed.data as unknown as T extends z.ZodTypeAny ? z.infer<T> : unknown;
      }

      return configValue as T extends z.ZodTypeAny ? z.infer<T> : unknown;
    },
  };
}
