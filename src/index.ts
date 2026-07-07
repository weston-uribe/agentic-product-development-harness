#!/usr/bin/env node
import { createProgram } from "./cli/program.js";

const program = createProgram();
await program.parseAsync(process.argv);
