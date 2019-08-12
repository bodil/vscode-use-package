# vscode-use-package

Programmatic configuration, extension management and keybinding for VS Code, to go with the
[init-script](https://github.com/bodil/vscode-init-script) extension.

This is heavily inspired by John Wiegley's [use-package](https://github.com/jwiegley/use-package)
system for Emacs.

Heavily inspired by John Wiegley's [use-package](https://github.com/jwiegley/use-package) system for
Emacs.

## Usage

`vscode-use-package` provides the `usePackage` function, which takes care of installing and
configuring extensions from your `init.ts` file. The advantage of this is that you can easily
maintain (and, perhaps more importantly, keep in version control) a consistent VS Code configuration
across multiple computers and OS installations.

The recommended way to install this is using `npm` in the folder where you keep your `init.ts`
script:

```sh
$ cd ~/.config/Code/User # or equivalent
$ npm add vscode-use-package
```

In this way, you can simply `import` it in your `init.ts` file (or `require` it in your `init.js`
file, if you prefer):

```js
import { initUsePackage, usePackage } from "vscode-use-package";
```

### `usePackage`

`usePackage` takes a package name (`<publisher>.<extension-name>` as found in the "Installation"
header on the Marketplace page) and an optional configuration object. It will check if the extension
is already installed, install it for you if it's not, then go ahead and configure it according to
your specifications.

The configuration object looks like this (and all the keys are optional):

```typescript
export type UsePackageOptions = {
    scope?: string;
    config?: Record<string, any>;
    globalConfig?: Record<string, any>;
    keymap?: Array<Keybinding>;
    init?: () => Thenable<void>;
};
```

#### `config`

The `config` property takes an object of configuration keys and values, and updates the VS Code
configuration accordingly. The keys will be automatically namespaced to the package you're
configuring: `usePackage("my-package", {config: {enableFeature: true}})` will result in the
configuration key `my-package.enableFeature` being set to `true`.

If the name of the configuration scope differs from the name of the package, as, unfortunately,
often happens, you can use the `scope` property to override it.

As an example, here is how you'd install the
[GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens) package and configure
it to stop showing you annotations for the current line:

```typescript
usePackage("eamodio.gitlens", {
    config: {
        "currentLine.enabled": false,
    },
});
```

#### `globalConfig`

If you need to set options outside the package scope, use the `globalConfig` property, and feed it
fully namespaced keys, as you would in `settings.json`.

For instance, this is how you could install a new syntax theme and enable it automatically:

```typescript
usePackage("jack-pallot.atom-dark-syntax", {
    globalConfig: { "workbench.colorTheme": "Atom Dark Syntax" },
});
```

#### `keymap`

The `keymap` property is used to define keybindings for the package. The commands, unlike the
settings keys, are not automatically prefixed with the package scope. The format is (or is supposed
to be) equivalent to `keybindings.json`.

The `Keybinding` type looks like this:

```typescript
export type Keybinding = {
    key: string;
    command: string;
    when?: string;
    args?: Record<string, string>;
};
```

Here is how you use it:

```typescript
usePackage("garaemon.vscode-emacs-tab", {
    scope: "emacs-tab",
    keymap: [
        {
            key: "tab",
            command: "emacs-tab.reindentCurrentLine",
            when: "editorTextFocus",
        },
    ],
});
```

#### `init`

The `init` property takes a function which will be called once the package is installed and
everything else is configured, in case you need to do any configuration that isn't covered by the
other properties.

```typescript
usePackage("jack-pallot.atom-dark-syntax", {
    globalConfig: { "workbench.colorTheme": "Atom Dark Syntax" },
    init: () => alert("syntax theme installed!"), // please don't do this, though
});
```

### `configSet` and `keymapSet`

In addition to `usePackage`, the `vscode-use-package` module exports the
`configSet(scope: string, options: Record<string, any>)` function and the
`keymapSet(keymap: Array<Keybinding>)` function. These are the function `usePackage` calls to set
config options and keybindings, but you might want to use these to configure settings unrelated to
extensions:

```typescript
configSet("workbench", {
    "editor.showTabs": false,
    "editor.enablePreview": false,
    "activityBar.visible": true,
});

keymapSet([
    {
        key: "ctrl+x ctrl+c",
        command: "workbench.action.quit",
    },
]);
```

Note that you can also call `configSet(options: Record<string, any>)` without the scope argument to
set top level options.

### Async!

Please keep in mind that `usePackage` runs asynchronously, so that code invoked after `usePackage`
calls is not guaranteed to (and almost certainly won't) run after the package is installed and
configured.

However, `usePackage` calls are performed in sequence, in invocation order, so that packages can
assume previous packages have been fully installed, and code in a `usePackage`'s `init` hook is
guaranteed to run after all previous `usePackage`s have fully completed.

If you need to wait for the completion of a `usePackage` call, it returns a `Promise<void>` that you
can await the resolution of. Because `usePackage` calls run in order, if you need to wait for
everything to fully complete, you can just wait for your last `usePackage` to complete.

## Licence

Copyright 2019 Bodil Stokke

This program is free software: you can redistribute it and/or modify it under the terms of the GNU
Lesser General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
General Public License for more details.

You should have received a copy of the GNU Lesser General Public License along with this program. If
not, see https://www.gnu.org/licenses/.

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct][coc]. By
participating in this project you agree to abide by its terms.

[coc]: https://github.com/bodil/vscode-init-script/blob/master/CODE_OF_CONDUCT.md
