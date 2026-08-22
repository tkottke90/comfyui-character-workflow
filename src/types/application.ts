import express from 'express';
import { Logger } from '@tkottke90/logger';
import z from 'zod';

// Augment the Express namespace
declare global {
  namespace Express {
    interface Application {
      /**
       * Starts the HTTP server and begins listening for incoming requests.
       */
      start: () => void;

      /**
       * Initiates a graceful shutdown: stops background services, closes the HTTP
       * server to drain in-flight requests, then exits the process.
       * @param code Process exit code. Defaults to 1 (error). Pass 0 for a clean stop.
       */
      shutdown: (code?: number) => void;

      config: {
        _configData: Record<string, unknown>;

        /**
         * The path to the loaded config file, if any. This is not guaranteed to be set (e.g. if config loading failed), so should be checked before use.
         */
        configPath: string;

        /**
         * Gets a config value by key, first checking environment variables, then the config file, and finally falling back to a default value if provided.
         * @param key The config key to retrieve
         * @param defaultValue An optional default value to return if the key is not found in either environment variables or the config file
         * @returns The config value as a string, or the default value if the key is not found
         */
        get(key: string, defaultValue?: string): string;

        /**
         * Utility method to get a config value as a boolean.
         * @param key The config key to retrieve
         * @param defaultValue An optional default value to return if the key is not found or cannot be parsed as a boolean
         * @returns The config value parsed as a boolean, or the default value if the key is not found or cannot be parsed
         */
        getBoolean(key: string, defaultValue?: boolean): boolean;

        /**
         * Utility method to get a config value as a number.
         * @param key The config key to retrieve
         * @param defaultValue An optional default value to return if the key is not found or cannot be parsed as a number
         * @returns The config value parsed as a number, or the default value if the key is not found or cannot be parsed
         */
        getNumber(key: string, defaultValue?: number): number;

        /**
         * Gets the absolute path of a directory relative to the config directory location,
         * ensuring that the directory exists by creating it if necessary.  
         * @param path The relative config directory path
         */
        getConfigDir(path?: string): string;

        /**
         * Checks for the existence of a config key in either environment variables or the config file
         * @param key The config key to check for
         * @returns True if the key exists in either environment variables or the config file, false otherwise
         */
        has(key: string): boolean;

        /**
         * Loads a config section and validates it against a provided Zod schema. If the config value is missing or fails validation, an error is thrown.
         * @param key The config key to load
         * @param schema A Zod schema to validate the config value against
         * @returns The parsed config value if validation is successful
         * @throws An error if the config key is not found or if validation fails
         */
        loadConfig<T>(key: string, schema: T): T extends z.ZodTypeAny ? z.infer<T> : unknown;
      };
      logger: Logger;
    }

    interface Request {
      // You can add custom properties to the Request object here if needed
      logger: Logger;
    }
  }
}

// Re-export for convenience
export type Request = express.Request;
export type Response = express.Response;
export type Application = express.Application;
