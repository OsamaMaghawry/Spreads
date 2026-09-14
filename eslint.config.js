import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      // Spreading pluginJs.configs.recommended above sets `rules`, and this
      // `rules` key then replaces it wholesale -- so every recommended rule,
      // no-undef included, was silently switched off. That let
      // `step` (the variable is `steps`) ship in the close-order walk, where it
      // threw ReferenceError on the first reprice and left a position open that
      // the user was trying to close. A typo'd identifier on the money path has
      // to be a build failure, not a runtime surprise.
      "no-undef": "error",
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
      // THE BLANK PAGE RULE.
      //
      // CloseDialog listed `qty` in a dependency array above the `const qty`
      // that defines it. A dependency array is evaluated during render, every
      // render, so the dialog read `qty` inside its own temporal dead zone and
      // threw before it drew anything -- "Cannot access uninitialized
      // variable" in Safari. With no error boundary at the time, a trader
      // pressing Close on a live position got a white screen.
      //
      // Nothing caught it: it is valid syntax, the build succeeded, and no
      // test renders a component. This rule is what catches the next one, at
      // lint time, before it ships.
      //
      // `functions: false` because hoisted function declarations are genuinely
      // fine and the codebase uses them; only `let`/`const`/`class` -- the
      // bindings that actually have a dead zone -- are errors.
      "no-use-before-define": [
        "error",
        { variables: true, functions: false, classes: false },
      ],
    },
  },
];
