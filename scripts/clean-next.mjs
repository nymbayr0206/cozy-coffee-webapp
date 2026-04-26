import { rmSync } from "node:fs";
import { resolve } from "node:path";

rmSync(resolve(".next"), { recursive: true, force: true });
