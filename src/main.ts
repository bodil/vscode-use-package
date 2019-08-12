import * as vscode from "vscode";
import * as Path from "path";
import * as Fs from "fs";
import * as Json from "comment-json";

export type Keybinding = {
    key: string;
    command: string;
    when?: string;
    args?: Record<string, string>;
};

export type UsePackageOptions = {
    scope?: string;
    config?: Record<string, any>;
    globalConfig?: Record<string, any>;
    keymap?: Array<Keybinding>;
    init?: () => Thenable<void>;
};

function readFile(path: string): Promise<string> {
    return new Promise((resolve, reject) =>
        Fs.readFile(path, { encoding: "utf-8" }, (err, result) =>
            err ? reject(err) : resolve(result)
        )
    );
}

function writeFile(path: string, data: string): Promise<void> {
    return new Promise((resolve, reject) =>
        Fs.writeFile(path, data, { encoding: "utf-8" }, (err) => (err ? reject(err) : resolve()))
    );
}

function defer<A>(f: () => Thenable<A>): Thenable<A> {
    return new Promise((resolve, reject) => setTimeout(() => f().then(resolve, reject), 0));
}

async function installExtension(name: string) {
    await vscode.commands.executeCommand("workbench.extensions.installExtension", name);
    return await new Promise((resolve, reject) => {
        let retries = 20;
        let delay = 0;
        function retry() {
            setTimeout(() => {
                if (!vscode.extensions.getExtension(name)) {
                    if (retries > 0) {
                        delay += 10;
                        retries -= 1;
                        retry();
                    } else {
                        reject(new Error(`Failed to install extension: "${name}"`));
                    }
                } else {
                    resolve();
                }
            }, delay);
        }
        retry();
    });
}

type ProgressBar = {
    progress: vscode.Progress<{ increment: number; message: string }>;
    total: number;
    message?: string;
    report: (message: string) => void;
    increment: () => void;
};

type QueueItem = {
    name: string;
    resolve: () => void;
    reject: (error?: any) => void;
};

type Queue = {
    items: Array<QueueItem>;
    idle: boolean;
    scheduled: number;
    failed: number;
    progress?: ProgressBar;
};

const queue: Queue = {
    items: [],
    idle: true,
    progress: undefined,
    scheduled: 0,
    failed: 0,
};

function buildProgressBar(
    progress: vscode.Progress<{ increment: number; message: string }>,
    total: number
): ProgressBar {
    return {
        progress,
        total: queue.scheduled,
        message: undefined,
        report: function(message) {
            this.progress.report({ increment: 0, message });
            this.message = message;
        },
        increment: function() {
            this.progress.report({
                increment: 100 / this.total,
                message: this.message || "",
            });
        },
    };
}

function startQueue(): Thenable<void> {
    return defer(() => (queue.idle ? processQueue() : Promise.resolve()));
}

async function processQueue() {
    queue.idle = false;
    await vscode.window.withProgress(
        {
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: "Use-Package",
        },
        async function(
            progress: vscode.Progress<{ increment: number; message: string }>,
            _token: vscode.CancellationToken
        ) {
            queue.progress = buildProgressBar(progress, queue.items.length);
            await processStep();
        }
    );
}

function pluralise(count: number): string {
    return count === 1 ? "" : "s";
}

async function processStep() {
    if (queue.items.length === 0) {
        queue.idle = true;
        queue.progress = undefined;
        if (queue.scheduled > 0) {
            if (queue.failed > 0) {
                const installed = queue.scheduled - queue.failed;
                if (installed > 0) {
                    vscode.window.showErrorMessage(
                        `Installed ${installed} extension${pluralise(installed)}, and ${
                            queue.failed
                        } extension${pluralise(queue.failed)} failed to install.`
                    );
                } else {
                    vscode.window.showErrorMessage(
                        `${queue.failed} extension${pluralise(queue.failed)} failed to install.`
                    );
                }
            } else {
                vscode.window.showInformationMessage(
                    `Installed ${queue.scheduled} extension${pluralise(queue.scheduled)}.`
                );
            }
        }
        queue.scheduled = 0;
        queue.failed = 0;
        return;
    }

    const next = queue.items.shift();
    if (next === undefined || queue.progress === undefined) {
        throw new Error();
    }
    queue.progress.report(`Installing extension "${next.name}"`);
    try {
        await installExtension(next.name);
        console.log("Installed successfully:", next.name);
        next.resolve();
    } catch (err) {
        next.reject(err);
        queue.failed += 1;
        vscode.window.showErrorMessage(`${err}`);
    }
    await defer(processStep);
}

function addToQueue(name: string): Thenable<void> {
    return new Promise((resolve, reject) => {
        queue.scheduled += 1;
        queue.items.push({ name, resolve, reject });
        startQueue();
    });
}

async function install(name: string) {
    if (vscode.extensions.getExtension(name)) {
        return Promise.resolve();
    } else {
        return addToQueue(name);
    }
}

function extensionName(name: string): string {
    const parts = name.split(".");
    return parts.pop() || "";
}

let extensionContext: vscode.ExtensionContext | undefined = undefined;

export function initUsePackage(context: vscode.ExtensionContext) {
    extensionContext = context;
}

function getExtensionContext(): vscode.ExtensionContext {
    if (extensionContext === undefined) {
        const message =
            "You must initialise Use-Package by calling " +
            "`initUsePackage(context)` before you can use it!";
        vscode.window.showErrorMessage(message);
        throw new Error(message);
    } else {
        return extensionContext;
    }
}

export async function usePackage(name: string, options?: UsePackageOptions): Promise<void> {
    options = options || {};
    await install(name);
    const scope = options.scope || extensionName(name);
    if (options.config !== undefined) {
        await configSet(scope, options.config);
    }
    if (options.globalConfig !== undefined) {
        await configSet(undefined, options.globalConfig);
    }
    if (options.keymap !== undefined) {
        await keymapSet(options.keymap);
    }
    if (options.init !== undefined) {
        await options.init();
    }
}

export async function configSet(
    scope: string | Record<string, any> | undefined,
    options?: Record<string, any>
) {
    if (typeof scope === "object") {
        options = scope;
        scope = undefined;
    }
    if (options === undefined) {
        return;
    }
    const config = vscode.workspace.getConfiguration(scope);
    for (const key of Object.keys(options)) {
        const value = options[key];
        const state = config.inspect(key);
        if (state === undefined || state.globalValue !== value) {
            await config.update(key, value, vscode.ConfigurationTarget.Global);
        }
    }
}

function keyIndex(keymap: Array<Keybinding>, key: Keybinding): number | undefined {
    for (let i = 0; i < keymap.length; i++) {
        if (keymap[i] && keymap[i].key === key.key && keymap[i].when === key.when) {
            return i;
        }
    }
    return undefined;
}

function setKey(keymap: Array<Keybinding>, key: Keybinding) {
    const index = keyIndex(keymap, key);
    if (index === undefined) {
        keymap.push(key);
    } else {
        keymap[index] = key;
    }
}

export async function keymapSet(keymap: Array<Keybinding>) {
    const masterPath = Path.resolve(
        getExtensionContext().globalStoragePath,
        "../../keybindings.json"
    );
    const originalData = await readFile(masterPath);
    const master = Json.parse(originalData);

    for (const key of keymap) {
        setKey(master, key);
    }

    const masterData = Json.stringify(master, undefined, 4);
    if (masterData !== originalData) {
        await writeFile(masterPath, masterData);
    }
}
