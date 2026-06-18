import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { ExactCasperScheme } from "./scheme";

/**
 * Configuration options for registering Casper schemes to an x402ResourceServer
 */
export interface CasperResourceServerConfig {
  /**
   * Optional specific networks to register.
   * If not provided, registers wildcard support (casper:*).
   */
  networks?: Network[];
}

/**
 * Registers Casper exact payment schemes to an x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for Casper resource server registration
 * @returns The server instance for chaining
 */
export function registerExactCasperScheme(
  server: x402ResourceServer,
  config: CasperResourceServerConfig = {},
): x402ResourceServer {
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      server.register(network, new ExactCasperScheme());
    });
  } else {
    server.register("casper:*", new ExactCasperScheme());
  }

  return server;
}
