// The only entry point of the committed browser vendor bundle. Keeping it to
// one named re-export means `tools/build.mjs` bundles the Supabase SDK and
// nothing of this project, so `src/vendor/supabase.mjs` stays a pure vendor
// artefact. Application modules never import the SDK themselves: `createAuth`
// and `createStore` receive an already-built client (Ruling R33).
export { createClient } from "@supabase/supabase-js";
