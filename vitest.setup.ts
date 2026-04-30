// vitest-chrome@0.1.0 does not declare an exports field, causing Node to load
// the CJS entry which requires() vitest — incompatible with vitest 4.x ESM.
// Use the ESM bundle directly to bypass the CJS loader.
import * as chrome from 'vitest-chrome/lib/index.esm.js'
Object.assign(global, { chrome })
