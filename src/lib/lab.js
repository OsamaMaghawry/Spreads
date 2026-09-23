// Work in progress that ships with the app but is not part of the product yet.
//
// WHY THIS EXISTS.
//
// The deploy gates refuse any production build whose app tree is not
// byte-identical to the one staging served (see .github/workflows/deploy-app.yml).
// That rule is right -- it is the money path, and it guarantees production runs
// exactly what was read on dev-dash. But it has one consequence nobody chose:
// a subset of the app cannot be shipped, so ANY long-running piece of work on
// staging holds every small fix behind it.
//
// The owner, 23 Sep, blocked from shipping a one-line scanner fix by an
// unfinished broker integration: "I don't want to delay the small bugs or
// things because of the brokers."
//
// So the separation moves from the BRANCH to the BUILD. Unfinished work lives
// on staging like everything else -- one trunk, no long-lived feature branches
// to rot and conflict -- and is switched off in the production build. Staging
// and production ship the same tree; they disagree only about this flag.
//
// WHAT QUALIFIES. Something being built and exercised on staging that a
// customer must not reach yet. Not a kill switch for a shipped feature, and
// not a way to skip review: the code still lands on staging, still passes
// every test, and is still read on dev-dash before it goes anywhere.
//
// SERVER SIDE IS SEPARATE AND DOES NOT USE THIS. A browser flag is a claim the
// browser makes, so it hides a surface, it does not protect one. Edge functions
// behind lab work refuse on their own, by checking that the credentials the
// work needs are actually present -- staging has them, production does not, so
// they fail closed with no flag to set and nothing to forget. See
// supabase/functions/snaptrade/index.ts and tradier/index.ts.
//
// HOW TO RETIRE ONE. When the work is finished, delete its LAB check. That is
// the whole ceremony -- and it should happen, because a flag that outlives its
// feature is a branch by another name.
export const LAB = import.meta.env.VITE_LAB === "1";
