/**
 * The worker's entry point.
 *
 * Session 2's smoke worker lived here and has done its job — it proved the
 * schema builds on D1 and that every table round-trips. It is in the
 * history rather than in the deploy, because it wrote rows.
 */

import { createApp } from "./app";
import type { Bindings } from "./config";

export type Env = Bindings;

export default createApp();
