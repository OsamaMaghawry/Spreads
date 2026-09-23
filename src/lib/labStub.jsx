// What a lab module resolves to in a build that has the lab switched off.
//
// vite.config.js aliases every path in LAB_MODULES to this file when VITE_LAB
// is not 1, so the real module's code is never pulled into the graph and never
// reaches the CDN -- see the comment there for why the flag alone was not
// enough. Nothing renders it: LAB is false in the same build, so every call
// site has already branched away. It exists so the import resolves.
export default function LabStub() {
  return null;
}
