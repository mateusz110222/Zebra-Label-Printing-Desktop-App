/**
 * Abstract base class for printer connections
 * Provides common interface for IP and COM connections
 */

export interface ConnectionResult {
  status: boolean;
  message: string;
  rawError?: string;
}

export interface PrinterConfig {
  type: "IP" | "COM";
  ip?: string;
  port?: number;
  comPort?: string;
}

/**
 * Base class for printer connections
 * Handles common logic and error handling
 */
export abstract class PrinterConnectionBase {
  protected config: PrinterConfig;
  protected label: string;

  constructor(config: PrinterConfig, label: string) {
    this.config = config;
    this.label = label;
  }

  /**
   * Connect to printer and send label
   * Must be implemented by subclasses
   */
  abstract connect(): Promise<ConnectionResult>;

  /**
   * Validate configuration
   * @returns true if configuration is valid
   */
  abstract validate(): boolean;

  /**
   * Get connection type name for logging
   */
  abstract getConnectionTypeName(): string;

  /**
   * Execute connection with error handling
   */
  async execute(): Promise<ConnectionResult> {
    try {
      if (!this.validate()) {
        return {
          status: false,
          message: "backend.printer.invalid_config",
          rawError: this.getConnectionTypeName(),
        };
      }

      return await this.connect();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Unknown ${this.getConnectionTypeName()} error`;

      if (typeof message === "string" && message.startsWith("backend.")) {
        return {
          status: false,
          message: message,
          rawError: this.getConnectionTypeName(),
        };
      }

      return {
        status: false,
        message: "backend.printer.error",
        rawError: `${this.getConnectionTypeName()}: ${message}`,
      };
    }
  }
}
