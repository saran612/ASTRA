import fs from 'node:fs';
import path from 'node:path';
import { FDR_TRANSITIONS } from '../packages/shared/dist/state-machine.js';

function generateDiagrams() {
  let mermaid = '```mermaid\nstateDiagram-v2\n';
  mermaid += '    [*] --> SUBMITTED\n';

  for (const t of FDR_TRANSITIONS) {
    const roles = t.allowedRoles.join('|');
    mermaid += `    ${t.from} --> ${t.to}: [${roles}]\n`;
  }
  mermaid += '    RELEASED --> [*]\n';
  mermaid += '    LAPSED --> [*]\n';
  mermaid += '```\n';

  let ascii = '```text\n';
  ascii += '+-----------------------------------------------------------------------------------------+\n';
  ascii += '|                                  FDR LIFECYCLE FLOW                                      |\n';
  ascii += '+-----------------------------------------------------------------------------------------+\n';
  ascii += ' [SUBMITTED] \n';
  ascii += '      │ (auto/INSTITUTION/OFFICER)\n';
  ascii += '      ▼\n';
  ascii += ' [UNDER_SCRUTINY] <--------+ (INSTITUTION resubmits)\n';
  ascii += '      │                    |\n';
  ascii += '      ├─(OFFICER flags)──> [DISCREPANCY]\n';
  ascii += '      ▼ (OFFICER verifies)\n';
  ascii += '  [VERIFIED]\n';
  ascii += '      │ (OFFICER/AUTHORITY accepts)\n';
  ascii += '      ▼\n';
  ascii += '   [ACTIVE] ─────────────────────+ (T-90 Clock Engine)\n';
  ascii += '      │                          ▼\n';
  ascii += '      │                     [EXPIRING] ───(Matured no renewal)───> [LAPSED]\n';
  ascii += '      │                          │\n';
  ascii += '      │                          ├─(Replacement reaches ACTIVE)──> [RENEWED]\n';
  ascii += '      ▼                          ▼                                    │\n';
  ascii += ' [RELEASE_REQUESTED] <───────────┴────────────────────────────────────┘\n';
  ascii += '      │\n';
  ascii += '      ├─(OFFICER rejects)────────> [ACTIVE]\n';
  ascii += '      ▼ (OFFICER recommends)\n';
  ascii += ' [RELEASE_APPROVED]\n';
  ascii += '      │ (AUTHORITY signs off)\n';
  ascii += '      ▼\n';
  ascii += '  [RELEASED]\n';
  ascii += '```\n';

  const doc = `# FDR State Machine

Generated automatically from \`packages/shared/src/state-machine.ts\`. Do not edit manually.

## Mermaid Flow Diagram
${mermaid}

## ASCII Flow Diagram
${ascii}

## Transition Specifications
| From | To | Allowed Roles | Description | Guard Logic |
| :--- | :--- | :--- | :--- | :--- |
${FDR_TRANSITIONS.map(
  (t) =>
    `| \`${t.from}\` | \`${t.to}\` | \`${t.allowedRoles.join(', ')}\` | ${t.description} | ${
      t.guard ? 'Conditional Guard' : 'None'
    } |`
).join('\n')}
`;

  const targetPath = path.resolve(process.cwd(), 'docs/STATE_MACHINE.md');
  fs.writeFileSync(targetPath, doc);
  console.log('Generated docs/STATE_MACHINE.md successfully.');
}

generateDiagrams();
