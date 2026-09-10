import pino from "pino";
import { config } from "@caddy-manager/config";

export const logger = pino({ level: config.logLevel });
